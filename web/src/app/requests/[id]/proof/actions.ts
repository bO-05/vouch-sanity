'use server'

import {readProofStatus, submitProof, type ProofStatus, type SubmitProofResult} from '@/lib/proofs'

/**
 * Server Actions behind the receipt page. Like any Server Action they are public POST endpoints,
 * so `lib/proofs.ts` re-validates everything against Sanity; nothing from the browser is trusted.
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
  return submitProof(input)
}

export async function proofStatusAction(input: {needId: string; proofId: string}): Promise<ProofStatus> {
  return readProofStatus(input)
}
