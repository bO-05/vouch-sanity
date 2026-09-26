import 'server-only'

import {createHash, timingSafeEqual} from 'node:crypto'

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
