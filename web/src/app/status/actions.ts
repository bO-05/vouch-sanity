'use server'

import {lookupStatus, type StatusLookup} from '@/lib/status'

/** Public endpoint, but useless without a 256-bit token (only its SHA-256 is stored). */
export async function statusAction(token: string): Promise<StatusLookup> {
  return lookupStatus(token)
}
