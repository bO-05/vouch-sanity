'use server'

import {matchCatalog, submitRequest, type CatalogMatchResult, type SubmitResult} from '@/lib/intake'
import {checkRateLimit} from '@/lib/rate-limit'

/**
 * Server Actions behind the "Ask for help" form. Like any Server Action they are public POST
 * endpoints, so `lib/intake.ts` re-validates everything; nothing from the browser is trusted.
 * Both cost a Jev call, so both are rate-limited per network first (`lib/rate-limit.ts`).
 */

export type MatchInput = {title: string; story: string}

export type SubmitInput = {
  ticket: string | null
  title: string
  story: string
  displayName: string
  city: string
  country: string
  language: string
  lines: Array<{supplyItemId: string; quantity: number}>
}

export async function matchCatalogAction(input: MatchInput): Promise<CatalogMatchResult> {
  const limit = await checkRateLimit('catalogMatch')
  if (!limit.ok) {
    return {ok: false, message: `${limit.message} You can still pick items from the catalog yourself.`, decisionId: null}
  }
  return matchCatalog(input)
}

export async function submitRequestAction(input: SubmitInput): Promise<SubmitResult> {
  const limit = await checkRateLimit('submit')
  if (!limit.ok) return {ok: false, message: `${limit.message} Your request was not sent; your words are still here.`}
  return submitRequest(input)
}
