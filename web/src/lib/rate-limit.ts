import 'server-only'

import {createHash, createHmac} from 'node:crypto'
import type {SanityClient} from 'next-sanity'
import {headers} from 'next/headers'
import {after} from 'next/server'
import {errorMessage} from '@/lib/intake-context'
import {getWriteClient} from '@/lib/sanity/write-client'

/**
 * Per-network rate limits on the public endpoints that cost something: a Jev call, a private draft a
 * volunteer has to read, a pledge on someone's checklist, a photo stored in Sanity, a passcode guess.
 *
 * The counts live in Sanity, so every serverless instance shares them. (An in-memory counter resets on
 * each cold start and differs per instance.) Each (limit, network, window) is one private document,
 * `ratelimit.<limit>-<seconds>.<window start>.<network hash>`. One transaction creates it if needed and
 * increments it, and Sanity's response carries the new count. Checked on Day 6: 10 concurrent
 * increments came back as 3…12. The id has a dot, so the public dataset never serves it.
 *
 * No IP address is stored. The network (an IPv4 address, or an IPv6 /64) is hashed with an HMAC key
 * derived from the server's Sanity token, and counters are deleted after their window ends.
 * These are fixed windows: a burst across a window boundary can reach twice a limit, which is fine here.
 * If Sanity can't count, the action is refused: an unchecked limit is not a limit.
 */

type Window = {seconds: number; max: number}
type Limit = {what: string; windows: readonly Window[]}

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const RATE_LIMITS = {
  /** One Jev call each. */
  catalogMatch: {what: 'checklist suggestions', windows: [{seconds: HOUR, max: 40}]},
  /** Each one is a private draft for a volunteer, a Jev triage call and a lifecycle instance. */
  submit: {what: 'new requests', windows: [{seconds: HOUR, max: 10}, {seconds: DAY, max: 25}]},
  /** Fake pledges could fill a checklist and turn real donors away. */
  pledge: {what: 'pledges', windows: [{seconds: HOUR, max: 60}]},
  /** A Jev call and up to about 1.2 MB in Sanity each. */
  receipt: {what: 'receipt uploads', windows: [{seconds: HOUR, max: 10}, {seconds: DAY, max: 25}]},
  /** The desk sign-in and the Jev health check share it: every passcode guess counts. */
  passcode: {what: 'passcode attempts', windows: [{seconds: 15 * MINUTE, max: 10}]},
} as const satisfies Record<string, Limit>

export type RateLimitName = keyof typeof RATE_LIMITS

export type RateLimitVerdict =
  | {ok: true}
  | {ok: false; reason: 'limited' | 'unchecked'; message: string; retryAfterSeconds: number}

const TIMEOUT_MS = 10_000

/**
 * Counts one attempt for this network and says whether it's within every window of the limit.
 * Call it first in the action, before any other work. Refused attempts count too, so a flood stays refused.
 */
export async function checkRateLimit(name: RateLimitName, requestHeaders?: Headers): Promise<RateLimitVerdict> {
  const limit: Limit = RATE_LIMITS[name]
  let client: SanityClient
  let networkHash: string
  try {
    client = getWriteClient()
    networkHash = hashNetwork(clientNetwork(requestHeaders ?? (await headers())))
  } catch (error) {
    return unchecked(error)
  }

  const nowMs = Date.now()
  const windows = limit.windows.map((window) => {
    const start = Math.floor(nowMs / 1000 / window.seconds) * window.seconds
    return {
      ...window,
      _id: `ratelimit.${name}-${window.seconds}.${start}.${networkHash}`,
      start: new Date(start * 1000).toISOString(),
      endMs: (start + window.seconds) * 1000,
    }
  })

  let counts: Map<string, number>
  try {
    let transaction = client.transaction()
    for (const window of windows) {
      transaction = transaction
        .createIfNotExists({
          _id: window._id,
          _type: 'rateLimit',
          limit: name,
          windowSeconds: window.seconds,
          windowStart: window.start,
          expiresAt: new Date(window.endMs).toISOString(),
          count: 0,
        })
        .patch(window._id, (patch) => patch.inc({count: 1}))
    }
    const docs = await transaction.commit({
      returnDocuments: true,
      visibility: 'async',
      tag: `vouch.ratelimit.${name}`,
      timeout: TIMEOUT_MS,
    })
    counts = new Map(docs.map((doc) => [doc._id, Number(doc.count)]))
  } catch (error) {
    return unchecked(error)
  }

  let worst: (typeof windows)[number] | null = null
  for (const window of windows) {
    const count = counts.get(window._id)
    if (count === undefined || !Number.isInteger(count)) {
      return unchecked(new Error('Sanity returned no count'))
    }
    if (count > window.max && (!worst || window.endMs > worst.endMs)) worst = window
  }
  // A counter that was just created means an earlier window has ended somewhere: tidy up afterwards.
  if (windows.some((window) => counts.get(window._id) === 1)) deleteExpiredLater(client)
  if (!worst) return {ok: true}

  const retryAfterSeconds = Math.max(1, Math.ceil((worst.endMs - Date.now()) / 1000))
  return {
    ok: false,
    reason: 'limited',
    retryAfterSeconds,
    message: `Too many ${limit.what} from your network: the limit is ${worst.max} per ${period(worst.seconds)}. Please try again in ${wait(retryAfterSeconds)}.`,
  }
}

function unchecked(error: unknown): RateLimitVerdict {
  return {
    ok: false,
    reason: 'unchecked',
    retryAfterSeconds: 60,
    message: `Vouch couldn't check its rate limit in Sanity (${errorMessage(error)}), so nothing was done. Please try again in a minute.`,
  }
}

function deleteExpiredLater(client: SanityClient): void {
  after(async () => {
    await client
      .delete(
        {query: `*[_type == "rateLimit" && expiresAt < $now][0...500]`, params: {now: new Date().toISOString()}},
        {visibility: 'async', tag: 'vouch.ratelimit.cleanup'},
      )
      .catch((error: unknown) => console.warn(`[rate-limit] cleanup failed: ${errorMessage(error)}`))
  })
}

// ---------------------------------------------------------------------------------------------
// The network: who is asking, without storing who they are
// ---------------------------------------------------------------------------------------------

/** On Vercel, `x-real-ip` and `x-forwarded-for` are set by the platform; a client can't spoof them there. */
function clientNetwork(requestHeaders: Headers): string {
  const ip = requestHeaders.get('x-real-ip') ?? requestHeaders.get('x-forwarded-for')?.split(',')[0] ?? ''
  return networkOf(ip)
}

/** An IPv4 address as is; an IPv6 address as its /64 (one household or phone usually gets a whole /64). */
function networkOf(rawIp: string): string {
  const ip = rawIp.trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '').toLowerCase()
  if (!ip) return 'unknown'
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip)
  if (mapped) return mapped[1]
  if (!ip.includes(':')) return ip
  const [head, tail] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}

function hashNetwork(network: string): string {
  const secret = process.env.SANITY_API_WRITE_TOKEN?.trim()
  if (!secret) throw new Error('SANITY_API_WRITE_TOKEN is not configured on this server.')
  const key = createHash('sha256').update(`vouch-rate-limit\0${secret}`).digest()
  return createHmac('sha256', key).update(network).digest('hex').slice(0, 24)
}

function period(seconds: number): string {
  if (seconds === HOUR) return 'hour'
  if (seconds === DAY) return 'day'
  return seconds % HOUR === 0 ? `${seconds / HOUR} hours` : `${Math.round(seconds / MINUTE)} minutes`
}

function wait(seconds: number): string {
  if (seconds <= MINUTE) return 'a minute'
  const minutes = Math.ceil(seconds / MINUTE)
  return minutes < 90 ? `${minutes} minutes` : `about ${Math.round(minutes / 60)} hours`
}
