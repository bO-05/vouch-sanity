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
import {errorMessage, isConflict, isRecord, loadIntakeContext, type IntakeContext} from '@/lib/intake-context'
import {askFieldProblem, tidyFields, type AskFields} from '@/lib/intake-rules'
import {askJev} from '@/lib/jev'
import {advanceLater} from '@/lib/lifecycle/advance'
import {fireLifecycle, readLifecycle} from '@/lib/lifecycle/engine'
import {getWriteClient} from '@/lib/sanity/write-client'
import {hashStatusToken} from '@/lib/status'
import {ACTIONS} from '@/workflows/need-lifecycle'

/**
 * Intake: a neighbor's request goes from words to a private draft, and into the lifecycle.
 *
 * 1. Catalog match (optional UX assist): Jev proposes checklist lines from the catalog.
 * 2. Submit: code validates everything and creates a private DRAFT. The `need-lifecycle` workflow
 *    (src/workflows/need-lifecycle.ts) takes it from there: Jev triage, the policy gate in code,
 *    then publishing (published = verified) or a volunteer verifier. Any failure → a volunteer.
 * 3. Resubmit: after a verifier sends a request back, the requester edits it on their private
 *    status page and the lifecycle checks it again from scratch.
 * Every Jev call is recorded as a `decision` by `askJev`.
 */

const REQUEST_TIMEOUT_MS = 15_000

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
    context = await loadIntakeContext()
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
// 2. Submit: validate, create the private draft, hand it to the lifecycle
// ---------------------------------------------------------------------------------------------

export type SubmitResult =
  | {
      ok: true
      needId: string
      /** The private status token. Only its SHA-256 is stored; this is the only copy. */
      statusToken: string
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

function checklistItems(lines: Line[]) {
  return lines.map((line) => ({
    _key: randomBytes(6).toString('hex'),
    _type: 'needItem' as const,
    supplyItem: {_type: 'reference' as const, _ref: line.supplyItemId},
    quantity: line.quantity,
    pledgedQty: 0,
  }))
}

/** Everything the requester controls, validated in code (a Server Action is a public endpoint). */
async function readRequest(
  input: Record<string, unknown>,
): Promise<{ok: true; fields: AskFields; lines: Line[]} | {ok: false; message: string}> {
  const fields = readFields(input)
  const problem = askFieldProblem(fields)
  if (problem) return {ok: false, message: problem.message}
  let context: IntakeContext
  try {
    context = await loadIntakeContext()
  } catch (error) {
    return {ok: false, message: `Requests can't be submitted right now: ${errorMessage(error)}`}
  }
  const parsed = readLines(input.lines, context.catalog)
  return parsed.ok ? {ok: true, fields, lines: parsed.lines} : parsed
}

export async function submitRequest(raw: unknown): Promise<SubmitResult> {
  const input = isRecord(raw) ? raw : {}
  const request = await readRequest(input)
  if (!request.ok) return request

  let client: ReturnType<typeof getWriteClient>
  try {
    client = getWriteClient()
  } catch (error) {
    return {ok: false, message: `Requests can't be submitted right now: ${errorMessage(error)}`}
  }

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

  const statusToken = randomBytes(32).toString('base64url')
  try {
    // The private draft: only the server, the requester (with the link) and verifiers can see it.
    // Sync visibility, so the status page finds it by its link on the first look.
    await client.create(
      {
        _id: `drafts.${needId}`,
        _type: 'need',
        ...request.fields,
        items: checklistItems(request.lines),
        stage: 'triage',
        statusTokenHash: createHash('sha256').update(statusToken).digest('hex'),
        submittedAt: new Date().toISOString(),
        isDemo: false,
      },
      {visibility: 'sync', tag: 'vouch.intake.draft', timeout: REQUEST_TIMEOUT_MS},
    )
  } catch (error) {
    return {ok: false, message: `Sanity didn't accept the request, so nothing was saved: ${errorMessage(error)}`}
  }

  // Jev triage, the gate and (maybe) publishing run in the lifecycle, after this response.
  advanceLater(needId, 'start')
  return {ok: true, needId, statusToken}
}

// ---------------------------------------------------------------------------------------------
// 3. Resubmit after a verifier sent the request back
// ---------------------------------------------------------------------------------------------

export type ResubmitResult = {ok: true} | {ok: false; message: string}

export async function resubmitRequest(token: unknown, raw: unknown): Promise<ResubmitResult> {
  const hash = hashStatusToken(token)
  if (!hash) return {ok: false, message: 'This status link is incomplete. Copy the whole link, including the part after #.'}
  const request = await readRequest(isRecord(raw) ? raw : {})
  if (!request.ok) return request

  const client = getWriteClient()
  const draft = await client
    .fetch<{_id: string; _rev: string; stage: string} | null>(
      `*[_type == "need" && statusTokenHash == $hash && _id in path("drafts.**")][0]{_id, _rev, stage}`,
      {hash},
      {tag: 'vouch.intake.resubmit', timeout: REQUEST_TIMEOUT_MS},
    )
    .catch(() => null)
  if (!draft) return {ok: false, message: 'No private request matches this link.'}
  if (draft.stage !== 'sent_back') return {ok: false, message: "This request isn't waiting for your changes right now."}

  const needId = draft._id.replace(/^drafts\./, '')
  const instance = await readLifecycle(needId).catch(() => null)
  if (!instance || instance.currentStage !== 'sent_back') {
    return {ok: false, message: "Vouch's lifecycle isn't waiting for your changes right now, so nothing was changed."}
  }

  // The edit and the new stage in one revision-guarded patch. The previous verdict is removed so the
  // page never shows old reasons while Jev checks the new words.
  try {
    await client
      .patch(draft._id)
      .ifRevisionId(draft._rev)
      .set({...request.fields, items: checklistItems(request.lines), stage: 'triage'})
      .unset(['triage', 'category', 'urgency'])
      .commit({visibility: 'sync', tag: 'vouch.intake.resubmit', timeout: REQUEST_TIMEOUT_MS})
  } catch (error) {
    return {
      ok: false,
      message: isConflict(error)
        ? 'Your request changed in the meantime. Reload the page and try again.'
        : `Sanity didn't accept the changes: ${errorMessage(error)}`,
    }
  }

  try {
    await fireLifecycle(needId, ACTIONS.sentBack.activity, ACTIONS.sentBack.resubmit)
  } catch (error) {
    // Put the stage back so the page and the desk tell the truth; the edited words stay saved.
    await client.patch(draft._id).set({stage: 'sent_back'}).commit({visibility: 'sync'}).catch(() => {})
    return {ok: false, message: `Your changes are saved, but the check couldn't start (${errorMessage(error)}). Please try again.`}
  }

  advanceLater(needId, 'drain')
  return {ok: true}
}
