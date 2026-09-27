import 'server-only'

import type {CatalogItem} from '@/lib/catalog-match'
import {CATALOG_QUERY, CATEGORY_OPTIONS_QUERY, POLICY_QUERY} from '@/lib/queries'
import {fetchPublished} from '@/lib/sanity/live'
import {parsePolicy, type CategoryOption, type Policy} from '@/lib/triage'

/** What intake and triage read from Sanity: the catalog, the categories and the published policy. */
export type IntakeContext = {
  catalog: CatalogItem[]
  categories: CategoryOption[]
  policy: {ok: true; policy: Policy} | {ok: false; problem: string}
}

export async function loadIntakeContext(): Promise<IntakeContext> {
  const [catalog, categories, rawPolicy] = await Promise.all([
    fetchPublished<CatalogItem[]>(CATALOG_QUERY),
    fetchPublished<CategoryOption[]>(CATEGORY_OPTIONS_QUERY),
    fetchPublished<unknown>(POLICY_QUERY),
  ])
  return {catalog, categories, policy: parsePolicy(rawPolicy)}
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isConflict(error: unknown): boolean {
  return isRecord(error) && error.statusCode === 409
}
