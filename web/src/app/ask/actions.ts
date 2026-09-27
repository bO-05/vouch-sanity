'use server'

import {matchCatalog, submitRequest, type CatalogMatchResult, type SubmitResult} from '@/lib/intake'

/**
 * Server Actions behind the "Ask for help" form. Like any Server Action they are public POST
 * endpoints, so `lib/intake.ts` re-validates everything; nothing from the browser is trusted.
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
  return matchCatalog(input)
}

export async function submitRequestAction(input: SubmitInput): Promise<SubmitResult> {
  return submitRequest(input)
}
