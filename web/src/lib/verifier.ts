import 'server-only'

import {createHash, createHmac, timingSafeEqual} from 'node:crypto'
import {cookies} from 'next/headers'
import {looksLikeContactInfo} from '@/lib/contact'
import {tidyLine} from '@/lib/intake-rules'

/**
 * Demo verifier auth: one shared passcode (VERIFIER_PASSCODE, given to judges in the DEV post)
 * plus a display name, exchanged for an HMAC-signed, httpOnly cookie. Every desk action re-checks
 * the cookie on the server. Rotating the passcode invalidates every session.
 */

export function isVerifierConfigured(): boolean {
  return Boolean(process.env.VERIFIER_PASSCODE?.trim())
}

/** Constant-time comparison of a supplied passcode with VERIFIER_PASSCODE. */
export function isValidVerifierPasscode(candidate: string | null | undefined): boolean {
  const expected = process.env.VERIFIER_PASSCODE?.trim()
  if (!expected || !candidate) return false
  const a = createHash('sha256').update(candidate.trim()).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

const COOKIE = 'vouch_verifier'
const SESSION_SECONDS = 8 * 60 * 60
export const MAX_REVIEWER_NAME = 40

export type Verifier = {name: string}

function sessionKey(): Buffer | null {
  const passcode = process.env.VERIFIER_PASSCODE?.trim()
  return passcode ? createHash('sha256').update(`vouch-verifier-session\0${passcode}`).digest() : null
}

function sign(payload: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update(payload).digest()
}

export function reviewerNameProblem(name: string): string | null {
  if (name.length < 1) return 'Add the name volunteers and requesters will see (a first name or nickname).'
  if (name.length > MAX_REVIEWER_NAME) return `Keep the name under ${MAX_REVIEWER_NAME} characters.`
  if (looksLikeContactInfo(name)) return 'A display name only, please: no contact details.'
  return null
}

/** The signed-in verifier, or null. Call it at the top of every desk page and action. */
export async function readVerifier(): Promise<Verifier | null> {
  const key = sessionKey()
  const value = (await cookies()).get(COOKIE)?.value
  if (!key || !value) return null
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload, key)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {n?: unknown; e?: unknown}
    if (typeof session.n !== 'string' || typeof session.e !== 'number' || session.e < Date.now()) return null
    return reviewerNameProblem(session.n) ? null : {name: session.n}
  } catch {
    return null
  }
}

export async function startVerifierSession(
  passcode: unknown,
  rawName: unknown,
): Promise<{ok: true; verifier: Verifier} | {ok: false; message: string}> {
  const key = sessionKey()
  if (!key) return {ok: false, message: "The verifier desk isn't configured on this server."}
  if (!isValidVerifierPasscode(typeof passcode === 'string' ? passcode : null)) {
    return {ok: false, message: "That passcode isn't right."}
  }
  const name = tidyLine(typeof rawName === 'string' ? rawName : '')
  const problem = reviewerNameProblem(name)
  if (problem) return {ok: false, message: problem}

  const payload = Buffer.from(JSON.stringify({n: name, e: Date.now() + SESSION_SECONDS * 1000})).toString('base64url')
  ;(await cookies()).set(COOKIE, `${payload}.${sign(payload, key).toString('base64url')}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_SECONDS,
  })
  return {ok: true, verifier: {name}}
}

export async function endVerifierSession(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}
