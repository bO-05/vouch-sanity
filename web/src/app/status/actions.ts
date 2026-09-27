'use server'

import {resubmitRequest, type ResubmitResult} from '@/lib/intake'
import {lookupStatus, type StatusLookup} from '@/lib/status'
import type {SubmitInput} from '../ask/actions'

/** Public endpoints, but useless without a 256-bit token (only its SHA-256 is stored). */
export async function statusAction(token: string): Promise<StatusLookup> {
  return lookupStatus(token)
}

export type ResubmitInput = Omit<SubmitInput, 'ticket'>

/** The requester answers a verifier's send-back: edited words and checklist, checked again from scratch. */
export async function resubmitAction(token: string, input: ResubmitInput): Promise<ResubmitResult> {
  return resubmitRequest(token, input)
}
