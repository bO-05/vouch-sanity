'use server'

import {readProofStatus, submitProof, type ProofStatus, type SubmitProofResult} from '@/lib/proofs'
import {checkRateLimit} from '@/lib/rate-limit'

/**
 * Server Actions behind the receipt page. Like any Server Action they are public POST endpoints,
 * so `lib/proofs.ts` re-validates everything against Sanity; nothing from the browser is trusted.
 * An upload costs a Jev call and a photo in Sanity, so it's rate-limited per network first. The
 * status read is not: the page polls it while the check runs.
 */

export type SubmitProofInput = {
  needId: string
  uploaderDisplayName: string
  lines: string[]
  ocrText: string
  /** The downscaled photo as a JPEG data URL. */
  image: string
}

export async function submitProofAction(input: SubmitProofInput): Promise<SubmitProofResult> {
  const limit = await checkRateLimit('receipt')
  if (!limit.ok) return {ok: false, message: `${limit.message} The receipt was not saved.`}
  return submitProof(input)
}

export async function proofStatusAction(input: {needId: string; proofId: string}): Promise<ProofStatus> {
  return readProofStatus(input)
}
