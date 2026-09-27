import 'server-only'

import {randomUUID} from 'node:crypto'
import {cleanDisplayName, looksLikeContactInfo} from '@/lib/contact'
import {isArrayKey, isPublicDocumentId} from '@/lib/ids'
import {getWriteClient} from '@/lib/sanity/write-client'
import {PLEDGEABLE_STAGE} from '@/lib/vocab'

/**
 * Pledges: a donor promises some units of one checklist line. Goods or money move off-platform.
 *
 * The rules live here, in code: the request must be published (= verified) and open, the line
 * must exist, and the quantity must fit in what's still needed. The pledge document and the
 * line's `pledgedQty` are written in ONE transaction, guarded by the request's revision id, so
 * two donors can never pledge the same last unit. On a revision conflict we re-read and re-check.
 */

export type PledgeRefusal =
  | 'invalid_input'
  | 'not_found'
  | 'not_open'
  | 'unknown_item'
  | 'fully_pledged'
  | 'over_pledge'
  | 'busy'
  | 'error'

export type PledgeOutcome =
  | {
      ok: true
      pledgeId: string
      donorDisplayName: string
      itemName: string
      quantity: number
      /** Units pledged on the line after this pledge. */
      pledged: number
      requested: number
      attempts: number
    }
  | {ok: false; reason: PledgeRefusal; message: string}

export const MAX_DONOR_NAME_LENGTH = 40
const MAX_UNITS_PER_PLEDGE = 50
const MAX_ATTEMPTS = 6
const REQUEST_TIMEOUT_MS = 15_000

type ValidInput = {needId: string; itemKey: string; quantity: number; donorDisplayName: string}

type NeedSnapshot = {
  _id: string
  _rev: string
  stage: string | null
  items: Array<{
    _key: string
    quantity: number | null
    pledgedQty: number | null
    name: string | null
    unit: string | null
  }> | null
} | null

// Raw perspective + exact base id: only the published document can match, never a draft.
const SNAPSHOT_QUERY = `*[_type == "need" && _id == $id][0]{
  _id, _rev, stage,
  "items": items[]{_key, quantity, pledgedQty, "name": supplyItem->name, "unit": supplyItem->unit}
}`

function refuse(reason: PledgeRefusal, message: string): PledgeOutcome {
  return {ok: false, reason, message}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseInput(raw: unknown): {ok: true; value: ValidInput} | {ok: false; message: string} {
  const input = isRecord(raw) ? raw : {}
  const {needId, itemKey} = input
  if (!isPublicDocumentId(needId)) return {ok: false, message: 'Unknown request.'}
  if (!isArrayKey(itemKey)) return {ok: false, message: 'Pick an item from the checklist.'}

  const quantity = typeof input.quantity === 'string' ? Number(input.quantity) : input.quantity
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_UNITS_PER_PLEDGE
  ) {
    return {ok: false, message: `Pledge a whole number of units, from 1 to ${MAX_UNITS_PER_PLEDGE}.`}
  }

  const donorDisplayName =
    typeof input.donorDisplayName === 'string' ? cleanDisplayName(input.donorDisplayName) : ''
  if (!donorDisplayName) return {ok: false, message: 'Add a display name (a first name or nickname).'}
  if (donorDisplayName.length > MAX_DONOR_NAME_LENGTH) {
    return {ok: false, message: `Keep the display name under ${MAX_DONOR_NAME_LENGTH} characters.`}
  }
  if (looksLikeContactInfo(donorDisplayName)) {
    return {
      ok: false,
      message:
        'That looks like contact details. Vouch only shows a display name, so use a first name or nickname.',
    }
  }
  return {ok: true, value: {needId, itemKey, quantity, donorDisplayName}}
}

/** Sanity answers a failed `ifRevisionId` guard with HTTP 409. */
function isRevisionConflict(error: unknown): boolean {
  return isRecord(error) && error.statusCode === 409
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function units(count: number, unit: string | null): string {
  return unit ? `${count} (${unit})` : String(count)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Pledges for the same request run one at a time inside this server instance, so donors on the
 * same instance queue instead of colliding. This is only a throughput aid: across instances the
 * `ifRevisionId` guard is what keeps the count right, and a conflict is retried after a re-read.
 */
const queues = new Map<string, Promise<void>>()

async function oneAtATime<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  let release: () => void = () => {}
  const done = new Promise<void>((resolve) => {
    release = resolve
  })
  const mine = previous.then(() => done)
  queues.set(key, mine)
  await previous
  try {
    return await task()
  } finally {
    release()
    if (queues.get(key) === mine) queues.delete(key)
  }
}

type Attempt = PledgeOutcome | {ok: 'conflict'}

async function attemptPledge(
  client: ReturnType<typeof getWriteClient>,
  {needId, itemKey, quantity, donorDisplayName}: ValidInput,
  attempt: number,
): Promise<Attempt> {
  let need: NeedSnapshot
  try {
    need = await client.fetch<NeedSnapshot>(
      SNAPSHOT_QUERY,
      {id: needId},
      {tag: 'vouch.pledge.read', timeout: REQUEST_TIMEOUT_MS},
    )
  } catch (error) {
    return refuse('error', `Couldn't read the request from Sanity: ${errorMessage(error)}`)
  }

  if (!need) {
    return refuse('not_found', 'This request is not public. Only verified requests accept pledges.')
  }
  if (need.stage !== PLEDGEABLE_STAGE) {
    return refuse('not_open', 'This request is no longer collecting pledges.')
  }
  const line = need.items?.find((item) => item._key === itemKey)
  if (!line || typeof line.quantity !== 'number') {
    return refuse('unknown_item', "That item isn't on this request's checklist.")
  }

  const itemName = line.name ?? 'this item'
  const alreadyPledged = line.pledgedQty ?? 0
  const remaining = Math.max(0, line.quantity - alreadyPledged)
  if (remaining === 0) {
    return refuse('fully_pledged', `${itemName} is already fully pledged. Thank you anyway!`)
  }
  if (quantity > remaining) {
    return refuse(
      'over_pledge',
      `Only ${units(remaining, line.unit)} of ${itemName} still needed, so a pledge of ${quantity} can't be accepted.`,
    )
  }

  const pledgeId = `pledge-${randomUUID()}`
  const path = `items[_key=="${itemKey}"].pledgedQty`
  try {
    await client
      .transaction()
      .create({
        _id: pledgeId,
        _type: 'pledge',
        need: {_type: 'reference', _ref: need._id},
        itemKey,
        quantity,
        donorDisplayName,
        status: 'pledged',
        pledgedAt: new Date().toISOString(),
        isDemo: false,
      })
      .patch(need._id, (patch) =>
        patch
          .ifRevisionId(need._rev)
          .setIfMissing({[path]: 0})
          .inc({[path]: quantity}),
      )
      .commit({visibility: 'sync', tag: 'vouch.pledge', timeout: REQUEST_TIMEOUT_MS})
  } catch (error) {
    if (isRevisionConflict(error)) {
      // Someone else changed the request between our read and our write. Nothing was written.
      console.info(`[pledge] ${need._id}: revision ${need._rev} changed before commit (attempt ${attempt})`)
      return {ok: 'conflict'}
    }
    return refuse('error', `Sanity didn't accept the pledge: ${errorMessage(error)}`)
  }

  return {
    ok: true,
    pledgeId,
    donorDisplayName,
    itemName,
    quantity,
    pledged: alreadyPledged + quantity,
    requested: line.quantity,
    attempts: attempt,
  }
}

export async function createPledge(raw: unknown): Promise<PledgeOutcome> {
  const parsed = parseInput(raw)
  if (!parsed.ok) return refuse('invalid_input', parsed.message)
  const input = parsed.value

  let client: ReturnType<typeof getWriteClient>
  try {
    client = getWriteClient()
  } catch (error) {
    return refuse('error', `Pledges are unavailable right now: ${errorMessage(error)}`)
  }

  return oneAtATime(input.needId, async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await attemptPledge(client, input, attempt)
      if (result.ok !== 'conflict') return result
      if (attempt < MAX_ATTEMPTS) {
        // Exponential backoff with jitter, so competing instances stop colliding.
        await sleep(Math.min(1_000, 50 * 2 ** attempt) * (0.5 + Math.random()))
      }
    }
    return refuse('busy', 'Several people pledged at the same moment. Please try again.')
  })
}
