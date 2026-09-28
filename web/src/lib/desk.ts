import 'server-only'

import {ActionDisabledError, ContractViolationError} from '@sanity/workflow-engine'
import {looksLikeContactInfo} from '@/lib/contact'
import {errorMessage, isRecord} from '@/lib/intake-context'
import {CONTACT_MESSAGE, tidyStory} from '@/lib/intake-rules'
import {
  drainLifecycle,
  fireLifecycle,
  readLifecycle,
  readLifecycles,
  startLifecycle,
  type LifecycleView,
} from '@/lib/lifecycle/engine'
import {receiptScanId} from '@/lib/proof-match'
import {getWriteClient} from '@/lib/sanity/write-client'
import type {Verifier} from '@/lib/verifier'
import {ACTIONS} from '@/workflows/need-lifecycle'

/**
 * The verifier desk: private drafts waiting for a person, and the decisions a verifier makes.
 * Decisions are Sanity Workflows actions on the request's lifecycle instance (`approve`,
 * `send-back`, `reject`); the queued effects (publish, record the review) run right away.
 * The caller must pass a signed-in verifier (readVerifier), checked on every call.
 */

const TIMEOUT_MS = 15_000
/** A pending automatic step older than this is shown as stuck, with a retry button. */
export const STUCK_AFTER_MS = 45_000
export const MAX_NOTE = 500

export type DeskDecision = 'approve' | 'send_back' | 'reject'

export type DeskItem = {
  needId: string
  rev: string
  stage: string
  title: string
  story: string
  language: string | null
  displayName: string
  city: string
  country: string
  submittedAt: string | null
  isDemo: boolean | null
  category: string | null
  urgency: number | null
  triage: {
    outcome: string | null
    reasons: string[] | null
    flags: Array<{code: string; label: string | null; probability: number | null}> | null
    minConfidence: number | null
  } | null
  decision: {_id: string; model: string | null; latencyMs: number | null; answers: string | null; error: string | null; createdAt: string | null} | null
  items: Array<{_key: string; quantity: number; name: string | null; unit: string | null}>
  reviews: Array<{_id: string; action: string; note: string | null; reviewerName: string; createdAt: string | null}>
  lifecycle: LifecycleView | null
}

export type RecentReview = {
  _id: string
  action: string
  note: string | null
  reviewerName: string
  createdAt: string | null
  needId: string | null
  title: string | null
  published: boolean
  proof: string | null
}

/** A published request whose receipt is being checked or waits for a verifier. */
export type ProofDeskItem = {
  needId: string
  title: string
  displayName: string
  city: string
  country: string
  isDemo: boolean | null
  items: Array<{_key: string; quantity: number; name: string | null; unit: string | null}>
  proof: {
    _id: string
    verdict: string | null
    reasons: string[] | null
    coverage: number | null
    receiptProbability: number | null
    uploaderDisplayName: string | null
    submittedAt: string | null
    lines: Array<{text: string; amount: number | null; ocrSimilarity: number | null}> | null
    matches: Array<{lineIndex: number; itemKey: string; probability: number; quantity: number | null; quantityLine: number | null}> | null
    quantities: Array<{itemKey: string; needed: number; shown: number}> | null
    decision: {_id: string; model: string | null; latencyMs: number | null; answers: string | null; error: string | null} | null
  } | null
  /** The private photo (JPEG data URL) and raw OCR text. */
  scan: {image: string | null; ocrText: string | null} | null
  lifecycle: LifecycleView | null
}

const PROOF_INBOX_QUERY = `*[_type == "need" && !(_id in path("drafts.**")) && stage in ["proof_check", "proof_review"]]
  | order(submittedAt asc) {
    "needId": _id, title, displayName, city, country, isDemo,
    "items": coalesce(items[]{_key, quantity, "name": supplyItem->name, "unit": supplyItem->unit}, []),
    "proof": *[_type == "proof" && need._ref == ^._id] | order(submittedAt desc)[0]{
      _id, verdict, reasons, coverage, receiptProbability, uploaderDisplayName, submittedAt,
      lines[]{text, amount, ocrSimilarity}, matches[]{lineIndex, itemKey, probability, quantity, quantityLine},
      quantities[]{itemKey, needed, shown},
      "decision": decision->{_id, model, latencyMs, answers, error}
    }
  }`

const INBOX_QUERY = `*[_type == "need" && _id in path("drafts.**") && stage in ["triage", "review", "publishing"]]
  | order(submittedAt asc) {
    _id, "rev": _rev, stage, title, story, language, displayName, city, country,
    submittedAt, isDemo, urgency, "category": category->title,
    triage{outcome, reasons, "flags": flags[]{code, label, probability}, minConfidence},
    "decision": triage.decision->{_id, model, latencyMs, answers, error, createdAt},
    "items": coalesce(items[]{_key, quantity, "name": supplyItem->name, "unit": supplyItem->unit}, []),
    "reviews": *[_type == "review" && "drafts." + subject._ref == ^._id] | order(createdAt asc)
      {_id, action, note, reviewerName, createdAt}
  }`

const RECENT_QUERY = `*[_type == "review"] | order(createdAt desc)[0...8]{
  _id, action, note, reviewerName, createdAt, "needId": subject._ref, "proof": proof._ref,
  "title": coalesce(*[_id == ^.subject._ref][0].title, *[_id == "drafts." + ^.subject._ref][0].title),
  "published": defined(*[_id == ^.subject._ref][0]._id)
}`

/** What the desk can do with an item right now. */
export type DeskState = 'decide' | 'checking' | 'stuck' | 'no-lifecycle' | 'elsewhere'

function deskState(lifecycle: LifecycleView | null, now: number): DeskState {
  if (!lifecycle) return 'no-lifecycle'
  if (lifecycle.failed.length > 0) return 'stuck'
  const since = [lifecycle.stages.at(-1)?.enteredAt, ...lifecycle.pending.map((effect) => effect.queuedAt)]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
  const waited = since.length > 0 ? now - Math.min(...since) : 0
  if (lifecycle.stage === 'review' || lifecycle.stage === 'proof_review') {
    if (lifecycle.pending.length === 0) return 'decide'
    return waited > STUCK_AFTER_MS ? 'stuck' : 'checking'
  }
  if (['triage', 'publishing', 'proof_check', 'certifying'].includes(lifecycle.stage)) {
    return waited > STUCK_AFTER_MS ? 'stuck' : 'checking'
  }
  return 'elsewhere'
}

export async function loadDesk(): Promise<{
  items: Array<DeskItem & {state: DeskState}>
  proofs: Array<ProofDeskItem & {state: DeskState}>
  recent: RecentReview[]
}> {
  const client = getWriteClient()
  const [raw, proofRows, recent] = await Promise.all([
    client.fetch<Array<Omit<DeskItem, 'lifecycle' | 'needId'> & {_id: string}>>(INBOX_QUERY, {}, {tag: 'vouch.desk.inbox', timeout: TIMEOUT_MS}),
    client.fetch<Array<Omit<ProofDeskItem, 'lifecycle' | 'scan'>>>(PROOF_INBOX_QUERY, {}, {tag: 'vouch.desk.proofs', timeout: TIMEOUT_MS}),
    client.fetch<RecentReview[]>(RECENT_QUERY, {}, {tag: 'vouch.desk.recent', timeout: TIMEOUT_MS}),
  ])
  const rows = raw.map(({_id, ...row}) => ({...row, needId: _id.replace(/^drafts\./, '')}))
  const scanIds = proofRows.flatMap((row) => (row.proof ? [receiptScanId(row.proof._id)] : []))
  const [lifecycles, scans] = await Promise.all([
    readLifecycles([...rows.map((row) => row.needId), ...proofRows.map((row) => row.needId)]),
    scanIds.length
      ? client.fetch<Array<{_id: string; image: string | null; ocrText: string | null}>>(
          `*[_type == "receiptScan" && _id in $ids]{_id, image, ocrText}`,
          {ids: scanIds},
          {tag: 'vouch.desk.scans', timeout: TIMEOUT_MS},
        )
      : Promise.resolve([]),
  ])
  const scanById = new Map(scans.map((scan) => [scan._id, scan]))
  const now = Date.now()
  return {
    items: rows.map((row) => {
      const lifecycle = lifecycles.get(row.needId) ?? null
      return {...row, lifecycle, state: deskState(lifecycle, now)}
    }),
    proofs: proofRows.map((row) => {
      const lifecycle = lifecycles.get(row.needId) ?? null
      const scan = row.proof ? scanById.get(receiptScanId(row.proof._id)) : undefined
      return {...row, scan: scan ? {image: scan.image, ocrText: scan.ocrText} : null, lifecycle, state: deskState(lifecycle, now)}
    }),
    recent,
  }
}

export type DeskActionResult = {ok: true; message: string; stage: string | null} | {ok: false; message: string}

function readNeedId(value: unknown): string | null {
  return typeof value === 'string' && /^need-[A-Za-z0-9-]{1,80}$/.test(value) ? value : null
}

function readNote(value: unknown, required: boolean): {ok: true; note: string} | {ok: false; message: string} {
  const note = tidyStory(typeof value === 'string' ? value : '')
  if (required && note.length < 5) return {ok: false, message: 'Write a short note for the requester (at least 5 characters).'}
  if (note.length > MAX_NOTE) return {ok: false, message: `Keep the note under ${MAX_NOTE} characters.`}
  if (looksLikeContactInfo(note)) return {ok: false, message: CONTACT_MESSAGE}
  return {ok: true, note}
}

const OUTCOMES: Record<string, string> = {
  open: 'Published: it is verified and live on the feed now.',
  sent_back: 'Sent back. The requester sees your note on their private status page and can edit and resubmit.',
  rejected: 'Rejected. It stays a private draft; the requester sees your note.',
}

function engineRefusal(error: unknown): string | null {
  if (error instanceof ActionDisabledError || error instanceof ContractViolationError) {
    return 'This request is not waiting for that decision anymore (another verifier may have decided). Reload the desk.'
  }
  return null
}

export async function decide(verifier: Verifier, raw: unknown): Promise<DeskActionResult> {
  const input = isRecord(raw) ? raw : {}
  const needId = readNeedId(input.needId)
  const decision = input.decision
  if (!needId || (decision !== 'approve' && decision !== 'send_back' && decision !== 'reject')) {
    return {ok: false, message: 'That is not a valid decision.'}
  }
  const note = readNote(input.note, decision !== 'approve')
  if (!note.ok) return note

  const client = getWriteClient()
  const draft = await client.getDocument<{_rev: string}>(`drafts.${needId}`)
  if (!draft) return {ok: false, message: 'This request is no longer a private draft. Reload the desk.'}
  if (decision === 'approve' && draft._rev !== input.rev) {
    return {ok: false, message: 'The request changed since you opened the desk. Reload and look at it again before approving.'}
  }
  const instance = await readLifecycle(needId)
  if (!instance) return {ok: false, message: 'This request has no lifecycle yet. Use "Start the lifecycle" first.'}
  if (instance.currentStage !== 'review') {
    return {ok: false, message: `This request is in "${instance.currentStage}", not waiting for a verifier.`}
  }

  const action = {approve: ACTIONS.review.approve, send_back: ACTIONS.review.sendBack, reject: ACTIONS.review.reject}[decision]
  const params: Record<string, unknown> = {
    reviewer: verifier.name,
    ...(note.note ? {note: note.note} : {}),
    ...(decision === 'approve' ? {rev: draft._rev} : {}),
  }
  try {
    await fireLifecycle(needId, ACTIONS.review.activity, action, params)
  } catch (error) {
    return {ok: false, message: engineRefusal(error) ?? `The lifecycle refused the decision: ${errorMessage(error)}`}
  }

  // Run the queued effect now (publish, or record the review) so the verifier sees the real outcome.
  try {
    const {instance: after, drain} = await drainLifecycle(needId)
    const outcome = OUTCOMES[after.currentStage]
    if (outcome) return {ok: true, message: outcome, stage: after.currentStage}
    if (after.currentStage === 'review') {
      const why =
        drain.failed[0]?.name ??
        (await client.getDocument<{triage?: {reasons?: string[]}}>(`drafts.${needId}`))?.triage?.reasons?.[0] ??
        'an automatic step failed'
      return {ok: false, message: `Your decision was recorded, but it didn't go through: ${why}. It is back in the inbox.`}
    }
    return {ok: true, message: `Recorded. The lifecycle is now in "${after.currentStage}".`, stage: after.currentStage}
  } catch (error) {
    return {
      ok: false,
      message: `Your decision was recorded, but running its effect failed (${errorMessage(error)}). Use "Retry automatic steps" on this request.`,
    }
  }
}

const PROOF_ID = /^proof-[0-9a-f-]{36}$/

const PROOF_OUTCOMES: Record<string, string> = {
  fulfilled: 'Accepted: the certificate is issued and the request is marked fulfilled.',
  open: 'Declined: the request collects pledges again. Your note is shown with the receipt on the public page.',
}

/** Accept or decline a receipt at `proof_review`, as an action on the request's lifecycle. */
export async function decideProof(verifier: Verifier, raw: unknown): Promise<DeskActionResult> {
  const input = isRecord(raw) ? raw : {}
  const needId = readNeedId(input.needId)
  const decision = input.decision
  const proofId = typeof input.proofId === 'string' && PROOF_ID.test(input.proofId) ? input.proofId : null
  if (!needId || !proofId || (decision !== 'accept' && decision !== 'decline')) {
    return {ok: false, message: 'That is not a valid receipt decision.'}
  }
  const instance = await readLifecycle(needId)
  if (!instance) return {ok: false, message: 'This request has no lifecycle.'}
  if (instance.currentStage !== 'proof_review') {
    return {ok: false, message: `This request is in "${instance.currentStage}", not waiting for a receipt decision.`}
  }
  const underReview = instance.fields.find((field) => field.name === 'proofId')?.value as unknown
  if (underReview !== proofId) return {ok: false, message: 'A different receipt is under review now. Reload the desk.'}

  // Accepting a receipt that doesn't show the whole checklist marks the request fulfilled anyway,
  // so the verifier says why, in a note shown publicly with the receipt.
  let coverage: number | null
  try {
    coverage = await getWriteClient().fetch<number | null>(`*[_type == "proof" && _id == $id][0].coverage`, {id: proofId}, {
      tag: 'vouch.desk.proof',
      timeout: TIMEOUT_MS,
    })
  } catch (error) {
    return {ok: false, message: `Couldn't read the receipt from Sanity, so nothing was decided: ${errorMessage(error)}`}
  }
  const incomplete = typeof coverage !== 'number' || coverage < 1
  const note = readNote(input.note, decision === 'decline' || incomplete)
  if (!note.ok) {
    const missing = tidyStory(typeof input.note === 'string' ? input.note : '').length < 5
    return decision === 'accept' && incomplete && missing
      ? {
          ok: false,
          message:
            "This receipt doesn't show everything on the checklist. Write a short note on why you accept it anyway (for example, what the photo shows): it's shown publicly with the receipt.",
        }
      : note
  }

  const action = decision === 'accept' ? ACTIONS.proofReview.accept : ACTIONS.proofReview.decline
  try {
    await fireLifecycle(needId, ACTIONS.proofReview.activity, action, {reviewer: verifier.name, ...(note.note ? {note: note.note} : {})})
  } catch (error) {
    return {ok: false, message: engineRefusal(error) ?? `The lifecycle refused the decision: ${errorMessage(error)}`}
  }
  try {
    const {instance: after, drain} = await drainLifecycle(needId)
    const outcome = PROOF_OUTCOMES[after.currentStage]
    if (outcome) return {ok: true, message: outcome, stage: after.currentStage}
    const failed = drain.failed.map((effect) => effect.name)
    return failed.length > 0
      ? {ok: false, message: `Your decision was recorded, but a step failed (${failed.join(', ')}). The lifecycle is in "${after.currentStage}".`}
      : {ok: true, message: `Recorded. The lifecycle is now in "${after.currentStage}".`, stage: after.currentStage}
  } catch (error) {
    return {
      ok: false,
      message: `Your decision was recorded, but running its effect failed (${errorMessage(error)}). Use "Retry automatic steps" on this request.`,
    }
  }
}

/** Re-run queued effects of a stuck lifecycle (a failed drain, an expired claim). */
export async function retryAutomaticSteps(raw: unknown): Promise<DeskActionResult> {
  const needId = readNeedId(isRecord(raw) ? raw.needId : null)
  if (!needId) return {ok: false, message: 'That is not a valid request.'}
  try {
    const {instance, drain} = await drainLifecycle(needId)
    const failed = drain.failed.map((effect) => effect.name)
    return failed.length > 0
      ? {ok: false, message: `These steps failed again: ${failed.join(', ')}. The lifecycle is in "${instance.currentStage}".`}
      : {ok: true, message: `Done. The lifecycle is now in "${instance.currentStage}".`, stage: instance.currentStage}
  } catch (error) {
    return {ok: false, message: `Retrying failed: ${errorMessage(error)}`}
  }
}

/** For a private draft that has no lifecycle instance: adopt it at review, or check it from scratch. */
export async function startMissingLifecycle(raw: unknown): Promise<DeskActionResult> {
  const needId = readNeedId(isRecord(raw) ? raw.needId : null)
  if (!needId) return {ok: false, message: 'That is not a valid request.'}
  const draft = await getWriteClient().getDocument<{stage?: string}>(`drafts.${needId}`)
  if (!draft) return {ok: false, message: 'This request is no longer a private draft.'}
  if (await readLifecycle(needId)) return {ok: false, message: 'This request already has a lifecycle. Reload the desk.'}
  try {
    await startLifecycle(needId, draft.stage === 'review' ? 'review' : undefined)
    const {instance} = await drainLifecycle(needId)
    return {ok: true, message: `Started. The lifecycle is now in "${instance.currentStage}".`, stage: instance.currentStage}
  } catch (error) {
    return {ok: false, message: `Starting the lifecycle failed: ${errorMessage(error)}`}
  }
}
