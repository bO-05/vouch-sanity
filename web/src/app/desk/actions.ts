'use server'

import {decide, decideProof, retryAutomaticSteps, startMissingLifecycle, type DeskActionResult} from '@/lib/desk'
import {checkRateLimit} from '@/lib/rate-limit'
import {endVerifierSession, readVerifier, startVerifierSession} from '@/lib/verifier'

/**
 * The verifier desk's Server Actions. Like every Server Action they are public POST endpoints, so
 * each one checks the signed verifier cookie itself before touching anything.
 */

export type SignInState = {ok: boolean; message: string | null}

/** Every attempt counts against the network's passcode limit (shared with the Jev health check). */
export async function signInAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const limit = await checkRateLimit('passcode')
  if (!limit.ok) return {ok: false, message: limit.message}
  const result = await startVerifierSession(formData.get('passcode'), formData.get('name'))
  return result.ok ? {ok: true, message: null} : {ok: false, message: result.message}
}

export async function signOutAction(): Promise<void> {
  await endVerifierSession()
}

const SIGN_IN_FIRST: DeskActionResult = {ok: false, message: 'Sign in to the verifier desk first (your session may have expired).'}

export type DecideInput = {needId: string; decision: 'approve' | 'send_back' | 'reject'; note: string; rev: string}

export async function decideAction(input: DecideInput): Promise<DeskActionResult> {
  const verifier = await readVerifier()
  return verifier ? decide(verifier, input) : SIGN_IN_FIRST
}

export type DecideProofInput = {needId: string; proofId: string; decision: 'accept' | 'decline'; note: string}

export async function decideProofAction(input: DecideProofInput): Promise<DeskActionResult> {
  const verifier = await readVerifier()
  return verifier ? decideProof(verifier, input) : SIGN_IN_FIRST
}

export async function retryAction(input: {needId: string}): Promise<DeskActionResult> {
  return (await readVerifier()) ? retryAutomaticSteps(input) : SIGN_IN_FIRST
}

export async function startAction(input: {needId: string}): Promise<DeskActionResult> {
  return (await readVerifier()) ? startMissingLifecycle(input) : SIGN_IN_FIRST
}
