import 'server-only'

import {errorMessage, isConflict, loadIntakeContext, type IntakeContext} from '@/lib/intake-context'
import {askJev} from '@/lib/jev'
import {getWriteClient} from '@/lib/sanity/write-client'
import {
  buildTriageQuestions,
  gateTriage,
  triageDecisionOutcome,
  triageState,
  type TriageRoute,
  type TriageVerdict,
} from '@/lib/triage'
import {LANGUAGE_LABELS} from '@/lib/vocab'

/**
 * The `jev-triage` effect: the one Jev call that decides whether a private draft may go live on its
 * own. Code (never the model) gates the typed answers against the policy and writes the outcome and
 * its reasons onto the draft. Any failure routes to a volunteer; nothing is ever guessed.
 */

const TIMEOUT_MS = 15_000

export type TriageOutcome = 'auto_published' | 'needs_review' | 'emergency' | 'error'

type TriageSummary = {
  _type: 'triageSummary'
  outcome: TriageOutcome
  reasons: string[]
  flags: Array<{_key: string; _type: 'triageFlag'; code: string; label: string; probability: number}>
  minConfidence?: number
  decision?: {_type: 'reference'; _ref: string; _weak: true}
  decidedAt: string
}

function summary(
  outcome: TriageOutcome,
  reasons: string[],
  verdict: TriageVerdict | null,
  decisionId: string | null,
): TriageSummary {
  return {
    _type: 'triageSummary',
    outcome,
    reasons,
    flags: (verdict?.flags ?? [])
      .filter((flag) => flag.fired)
      .map((flag) => ({_key: flag.code, _type: 'triageFlag', code: flag.code, label: flag.label, probability: flag.probability})),
    ...(typeof verdict?.minConfidence === 'number' ? {minConfidence: verdict.minConfidence} : {}),
    ...(decisionId ? {decision: {_type: 'reference', _ref: decisionId, _weak: true}} : {}),
    decidedAt: new Date().toISOString(),
  }
}

/** Jev's suggestions for the fields a verifier would otherwise fill in. */
function suggestedFields(verdict: TriageVerdict | null, context: IntakeContext, requesterLanguage: string) {
  const minConfidence = context.policy.ok ? context.policy.policy.thresholds.triageMinConfidence : 1
  const category = verdict?.category ? context.categories.find((c) => c.slug === verdict.category?.slug) : undefined
  const language =
    verdict?.language && verdict.language.confidence >= minConfidence && verdict.language.code in LANGUAGE_LABELS
      ? verdict.language.code
      : requesterLanguage
  return {
    language,
    ...(category ? {category: {_type: 'reference' as const, _ref: category._id}} : {}),
    ...(verdict?.urgency ? {urgency: verdict.urgency.level} : {}),
  }
}

type DraftForTriage = {
  _id: string
  _rev: string
  title?: string
  story?: string
  city?: string
  country?: string
  language?: string
  items?: Array<{quantity?: number; supplyItem?: {_ref?: string}}>
}

export type TriageStepResult = {
  route: TriageRoute
  /** The draft revision Jev checked (after the summary was written). Only set when it may publish. */
  checkedRev: string | null
}

export async function runTriage(needId: string): Promise<TriageStepResult> {
  const client = getWriteClient()
  const draftId = `drafts.${needId}`
  const draft = await client.getDocument<DraftForTriage>(draftId)
  if (!draft) throw new Error(`There is no private draft ${draftId} to check.`)

  // Every write below is guarded by the revision that was read, so the words Jev saw are the words
  // that get the verdict (and, on a pass, the only words that can go live).
  const write = async (fields: Record<string, unknown>): Promise<string> => {
    try {
      const updated = await client
        .patch(draftId)
        .ifRevisionId(draft._rev)
        .set(fields)
        .commit({visibility: 'async', tag: 'vouch.lifecycle.triage', timeout: TIMEOUT_MS})
      return updated._rev
    } catch (error) {
      if (!isConflict(error)) throw error
      const changed = summary('error', ['The request changed while Jev was checking it, so a volunteer will review it.'], null, null)
      await client.patch(draftId).set({stage: 'review', triage: changed}).commit({visibility: 'async', timeout: TIMEOUT_MS})
      throw new Error('The draft changed during triage (revision conflict).')
    }
  }

  let context: IntakeContext
  try {
    context = await loadIntakeContext()
  } catch (error) {
    await write({
      stage: 'review',
      triage: summary('error', [`Vouch couldn't load its policy from Sanity (${errorMessage(error)}), so a volunteer will review this request.`], null, null),
    })
    return {route: 'review', checkedRev: null}
  }

  const language = draft.language ?? 'en'
  const toReview = async (outcome: TriageOutcome, reasons: string[], verdict: TriageVerdict | null, decisionId: string | null) => {
    await write({stage: 'review', triage: summary(outcome, reasons, verdict, decisionId), ...suggestedFields(verdict, context, language)})
    return {route: outcome === 'emergency' ? ('emergency' as const) : ('review' as const), checkedRev: null}
  }

  if (!context.policy.ok) {
    return toReview('error', [`Vouch's policy document is incomplete (${context.policy.problem}), so a volunteer will review this request.`], null, null)
  }
  const policy = context.policy.policy
  const byId = new Map(context.catalog.map((item) => [item._id, item]))
  const checklist = (draft.items ?? []).map((line) => {
    const item = line.supplyItem?._ref ? byId.get(line.supplyItem._ref) : undefined
    return item ? `${line.quantity ?? '?'} × ${item.name} (${item.unit})` : `${line.quantity ?? '?'} × an item that is no longer in the catalog`
  })

  const gate = (answers: Parameters<typeof gateTriage>[0]) => gateTriage(answers, policy, context.categories, LANGUAGE_LABELS)
  const result = await askJev({
    kind: 'triage',
    subjectId: needId,
    state: triageState({
      title: draft.title ?? '',
      story: draft.story ?? '',
      city: draft.city ?? '',
      country: draft.country ?? '',
      checklist,
    }),
    questions: buildTriageQuestions(policy, context.categories, LANGUAGE_LABELS),
    decide: (answers) => triageDecisionOutcome(gate(answers)),
  })
  if (!result.ok) {
    return toReview(
      'error',
      [`Jev couldn't check this request (${result.error}). A volunteer will review it instead; nothing was decided automatically.`],
      null,
      result.decisionId,
    )
  }

  const verdict = gate(result.answers)
  if (verdict.route !== 'publish') {
    return toReview(verdict.route === 'emergency' ? 'emergency' : 'needs_review', verdict.reasons, verdict, result.decisionId)
  }

  // Passed: record the verdict on the draft. The `publish-need` effect then publishes exactly this revision.
  const checkedRev = await write({triage: summary('auto_published', [], verdict, result.decisionId), ...suggestedFields(verdict, context, language)})
  return {route: 'publish', checkedRev}
}
