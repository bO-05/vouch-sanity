import 'server-only'

import {createHash, createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto'
import {
  buildCatalogQuestions,
  catalogOutcome,
  catalogState,
  findNumberMentions,
  MAX_CHECKLIST_LINES,
  proposeChecklist,
  type CatalogItem,
  type ProposedLine,
} from '@/lib/catalog-match'
import {askFieldProblem, tidyFields, type AskFields} from '@/lib/intake-rules'
import {askJev} from '@/lib/jev'
import {CATALOG_QUERY, CATEGORY_OPTIONS_QUERY, POLICY_QUERY} from '@/lib/queries'
import {fetchPublished} from '@/lib/sanity/live'
import {getWriteClient} from '@/lib/sanity/write-client'
import {
  buildTriageQuestions,
  gateTriage,
  parsePolicy,
  triageDecisionOutcome,
  triageState,
  type CategoryOption,
  type Policy,
  type TriageVerdict,
} from '@/lib/triage'
import {LANGUAGE_LABELS} from '@/lib/vocab'

/**
 * Intake: a neighbor's request goes from words to a draft to (maybe) a published request.
 *
 * 1. Catalog match (optional UX assist): Jev proposes checklist lines from the catalog.
 * 2. Submit: code validates everything, creates a private DRAFT, asks Jev the triage questions,
 *    and gates the answers against the policy in code.
 *    - Pass → one transaction publishes it (published = verified; drafts are private).
 *    - Otherwise → it stays a draft in `review`, with reasons composed by code.
 *    - Any failure (Jev, policy, Sanity) → review, never an automatic publish.
 * Every Jev call is recorded as a `decision` by `askJev`.
 */

const REQUEST_TIMEOUT_MS = 15_000

type IntakeContext = {
  catalog: CatalogItem[]
  categories: CategoryOption[]
  policy: {ok: true; policy: Policy} | {ok: false; problem: string}
}

async function loadContext(): Promise<IntakeContext> {
  const [catalog, categories, rawPolicy] = await Promise.all([
    fetchPublished<CatalogItem[]>(CATALOG_QUERY),
    fetchPublished<CategoryOption[]>(CATEGORY_OPTIONS_QUERY),
    fetchPublished<unknown>(POLICY_QUERY),
  ])
  return {catalog, categories, policy: parsePolicy(rawPolicy)}
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readFields(raw: Record<string, unknown>): AskFields {
  const text = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : '')
  return tidyFields({
    title: text('title'),
    story: text('story'),
    displayName: text('displayName'),
    city: text('city'),
    country: text('country'),
    language: text('language') || 'en',
  })
}

// ---------------------------------------------------------------------------------------------
// Intake tickets: the catalog-match decision is recorded before the request exists, under a
// fresh request id. The browser gets that id back with an HMAC, so the submit can reuse it (and
// the decision shows up in the request's trail) without letting anyone claim an arbitrary id.
// ---------------------------------------------------------------------------------------------

const NEED_ID = /^need-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function ticketKey(): Buffer {
  const secret = process.env.SANITY_API_WRITE_TOKEN?.trim()
  if (!secret) throw new Error('SANITY_API_WRITE_TOKEN is not configured on this server.')
  return createHash('sha256').update(`vouch-intake-ticket\0${secret}`).digest()
}

function signTicket(needId: string): string {
  return `${needId}.${createHmac('sha256', ticketKey()).update(needId).digest('base64url')}`
}

function needIdFromTicket(ticket: unknown): string | null {
  if (typeof ticket !== 'string') return null
  const [needId, signature] = ticket.split('.')
  if (!needId || !signature || !NEED_ID.test(needId)) return null
  const expected = createHmac('sha256', ticketKey()).update(needId).digest()
  const given = Buffer.from(signature, 'base64url')
  return given.length === expected.length && timingSafeEqual(given, expected) ? needId : null
}

// ---------------------------------------------------------------------------------------------
// 1. Catalog match
// ---------------------------------------------------------------------------------------------

export type CatalogMatchResult =
  | {
      ok: true
      ticket: string
      lines: ProposedLine[]
      decisionId: string
      model: string
      latencyMs: number
      checkedItems: number
      numbersFound: number
    }
  | {
      ok: false
      message: string
      decisionId: string | null
      /** Set when a failed Jev call was recorded, so the failure still joins the request's trail. */
      ticket?: string
    }

export async function matchCatalog(raw: unknown): Promise<CatalogMatchResult> {
  const fields = readFields(isRecord(raw) ? raw : {})
  const problem = askFieldProblem(fields, ['title', 'story'])
  if (problem) return {ok: false, message: problem.message, decisionId: null}

  let context: IntakeContext
  try {
    context = await loadContext()
  } catch (error) {
    return {ok: false, message: `Couldn't load the catalog from Sanity: ${errorMessage(error)}`, decisionId: null}
  }
  if (!context.policy.ok) {
    return {ok: false, message: `Can't suggest a checklist right now: ${context.policy.problem}`, decisionId: null}
  }
  if (context.catalog.length === 0) {
    return {ok: false, message: 'The supply catalog is empty.', decisionId: null}
  }

  const minProbability = context.policy.policy.thresholds.catalogMinProbability
  const mentions = findNumberMentions(`${fields.title}. ${fields.story}`)
  const plan = buildCatalogQuestions(context.catalog, mentions)
  const needId = `need-${randomUUID()}`

  const result = await askJev({
    kind: 'catalog_match',
    subjectId: needId,
    state: catalogState(fields.title, fields.story, mentions),
    questions: plan.questions,
    decide: (answers) => catalogOutcome(proposeChecklist(plan, answers, minProbability)),
  })
  if (!result.ok) {
    return {
      ok: false,
      message: `Jev couldn't suggest a checklist (${result.error}). You can pick items from the catalog yourself.`,
      decisionId: result.decisionId,
      ...(result.decisionId ? {ticket: signTicket(needId)} : {}),
    }
  }

  return {
    ok: true,
    ticket: signTicket(needId),
    lines: proposeChecklist(plan, result.answers, minProbability),
    decisionId: result.decisionId,
    model: result.model,
    latencyMs: result.latencyMs,
    checkedItems: context.catalog.length,
    numbersFound: mentions.length,
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Submit, triage, gate
// ---------------------------------------------------------------------------------------------

export type SubmitRoute = 'published' | 'review' | 'emergency'

export type SubmitResult =
  | {
      ok: true
      needId: string
      /** The private status token. Only its SHA-256 is stored; this is the only copy. */
      statusToken: string
      route: SubmitRoute
      reasons: string[]
      emergencyResources: string | null
      decisionId: string | null
    }
  | {ok: false; message: string}

type Line = {supplyItemId: string; quantity: number}

function readLines(raw: unknown, catalog: CatalogItem[]): {ok: true; lines: Line[]} | {ok: false; message: string} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {ok: false, message: 'Add at least one item to your checklist.'}
  }
  if (raw.length > MAX_CHECKLIST_LINES) {
    return {ok: false, message: `A checklist can have at most ${MAX_CHECKLIST_LINES} items.`}
  }
  const byId = new Map(catalog.map((item) => [item._id, item]))
  const lines: Line[] = []
  for (const entry of raw) {
    const supplyItemId = isRecord(entry) ? entry.supplyItemId : undefined
    const quantity = isRecord(entry) ? entry.quantity : undefined
    const item = typeof supplyItemId === 'string' ? byId.get(supplyItemId) : undefined
    if (!item) return {ok: false, message: 'One of the items is not in the catalog (anymore). Please remove it.'}
    if (lines.some((line) => line.supplyItemId === item._id)) {
      return {ok: false, message: `${item.name} is on the checklist twice.`}
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > item.maxPerHousehold) {
      return {
        ok: false,
        message: `Ask for 1 to ${item.maxPerHousehold} of ${item.name} (${item.unit}): that's the most one household can request.`,
      }
    }
    lines.push({supplyItemId: item._id, quantity})
  }
  return {ok: true, lines}
}

function lineKey(): string {
  return randomBytes(6).toString('hex')
}

function isConflict(error: unknown): boolean {
  return isRecord(error) && error.statusCode === 409
}

type TriageSummary = {
  _type: 'triageSummary'
  outcome: 'auto_published' | 'needs_review' | 'emergency' | 'error'
  reasons: string[]
  flags: Array<{_key: string; _type: 'triageFlag'; code: string; label: string; probability: number}>
  minConfidence?: number
  decision?: {_type: 'reference'; _ref: string; _weak: true}
  decidedAt: string
}

function summary(
  outcome: TriageSummary['outcome'],
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
      .map((flag) => ({
        _key: flag.code,
        _type: 'triageFlag',
        code: flag.code,
        label: flag.label,
        probability: flag.probability,
      })),
    ...(typeof verdict?.minConfidence === 'number' ? {minConfidence: verdict.minConfidence} : {}),
    ...(decisionId ? {decision: {_type: 'reference', _ref: decisionId, _weak: true}} : {}),
    decidedAt: new Date().toISOString(),
  }
}

/** Jev's suggestions for the fields a verifier would otherwise fill in. */
function suggestedFields(verdict: TriageVerdict | null, context: IntakeContext, requesterLanguage: string) {
  const minConfidence = context.policy.ok ? context.policy.policy.thresholds.triageMinConfidence : 1
  const category = verdict?.category
    ? context.categories.find((c) => c.slug === verdict.category?.slug)
    : undefined
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

export async function submitRequest(raw: unknown): Promise<SubmitResult> {
  const input = isRecord(raw) ? raw : {}
  const fields = readFields(input)
  const problem = askFieldProblem(fields)
  if (problem) return {ok: false, message: problem.message}

  let context: IntakeContext
  let client: ReturnType<typeof getWriteClient>
  try {
    client = getWriteClient()
    context = await loadContext()
  } catch (error) {
    return {ok: false, message: `Requests can't be submitted right now: ${errorMessage(error)}`}
  }

  const parsedLines = readLines(input.lines, context.catalog)
  if (!parsedLines.ok) return {ok: false, message: parsedLines.message}
  const byId = new Map(context.catalog.map((item) => [item._id, item]))

  // Reuse the id from the catalog match (so its decision joins the trail) if the ticket is ours
  // and nothing exists under that id yet.
  let needId = needIdFromTicket(input.ticket)
  if (needId) {
    const taken = await client
      .fetch<number>('count(*[_id in [$id, "drafts." + $id]])', {id: needId}, {timeout: REQUEST_TIMEOUT_MS})
      .catch(() => 1)
    if (taken > 0) needId = null
  }
  needId ??= `need-${randomUUID()}`
  const draftId = `drafts.${needId}`

  const statusToken = randomBytes(32).toString('base64url')
  const submittedAt = new Date().toISOString()
  const content = {
    _type: 'need' as const,
    title: fields.title,
    story: fields.story,
    language: fields.language,
    displayName: fields.displayName,
    city: fields.city,
    country: fields.country,
    items: parsedLines.lines.map((line) => ({
      _key: lineKey(),
      _type: 'needItem' as const,
      supplyItem: {_type: 'reference' as const, _ref: line.supplyItemId},
      quantity: line.quantity,
      pledgedQty: 0,
    })),
    statusTokenHash: createHash('sha256').update(statusToken).digest('hex'),
    submittedAt,
    isDemo: false,
  }

  // The private draft. Nobody but the server, the requester (with the link) and verifiers sees it.
  let draftRev: string
  try {
    const created = await client.create(
      {...content, _id: draftId, stage: 'triage'},
      {tag: 'vouch.intake.draft', timeout: REQUEST_TIMEOUT_MS},
    )
    draftRev = created._rev
  } catch (error) {
    return {ok: false, message: `Sanity didn't accept the request, so nothing was saved: ${errorMessage(error)}`}
  }

  const base = {needId, statusToken}
  const toReview = async (
    outcome: TriageSummary['outcome'],
    reasons: string[],
    verdict: TriageVerdict | null,
    decisionId: string | null,
  ): Promise<SubmitResult> => {
    const emergency = outcome === 'emergency'
    const emergencyResources = emergency && context.policy.ok ? context.policy.policy.emergencyResources : null
    const shown = [...reasons]
    try {
      await client
        .patch(draftId)
        .set({
          stage: 'review',
          triage: summary(outcome, reasons, verdict, decisionId),
          ...suggestedFields(verdict, context, fields.language),
        })
        .commit({visibility: 'sync', tag: 'vouch.intake.review', timeout: REQUEST_TIMEOUT_MS})
    } catch (error) {
      shown.push(
        `Saving the triage result failed (${errorMessage(error)}). A volunteer will find the request in the intake list.`,
      )
    }
    return {ok: true, ...base, route: emergency ? 'emergency' : 'review', reasons: shown, emergencyResources, decisionId}
  }

  if (!context.policy.ok) {
    return toReview('error', [`Vouch's policy document is incomplete (${context.policy.problem}), so a volunteer will review this request.`], null, null)
  }
  const policy = context.policy.policy

  const checklist = parsedLines.lines.map((line) => {
    const item = byId.get(line.supplyItemId)!
    return `${line.quantity} × ${item.name} (${item.unit})`
  })
  const questions = buildTriageQuestions(policy, context.categories, LANGUAGE_LABELS)
  const gate = (answers: Parameters<typeof gateTriage>[0]) =>
    gateTriage(answers, policy, context.categories, LANGUAGE_LABELS)
  const result = await askJev({
    kind: 'triage',
    subjectId: needId,
    state: triageState({
      title: fields.title,
      story: fields.story,
      city: fields.city,
      country: fields.country,
      checklist,
    }),
    questions,
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

  // Passed the gate: publish in ONE transaction, guarded by the draft's revision, so exactly the
  // text Jev checked goes live. `create` fails if a published document already exists.
  const publishedAt = new Date().toISOString()
  try {
    await client
      .transaction()
      .patch(draftId, (patch) => patch.ifRevisionId(draftRev).set({stage: 'open'}))
      .create({
        ...content,
        ...suggestedFields(verdict, context, fields.language),
        _id: needId,
        stage: 'open',
        publishedAt,
        triage: summary('auto_published', [], verdict, result.decisionId),
      })
      .delete(draftId)
      .commit({visibility: 'sync', tag: 'vouch.intake.publish', timeout: REQUEST_TIMEOUT_MS})
  } catch (error) {
    const why = isConflict(error)
      ? 'The request changed while Jev was checking it'
      : `Publishing failed (${errorMessage(error)})`
    return toReview('error', [`${why}, so a volunteer will review it instead.`], verdict, result.decisionId)
  }

  return {ok: true, ...base, route: 'published', reasons: [], emergencyResources: null, decisionId: result.decisionId}
}
