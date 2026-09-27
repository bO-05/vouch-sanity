import type {QueryParams} from 'next-sanity'
import {defineLive} from 'next-sanity/live'
import {client} from './client'

/**
 * Live updates through Sanity's Live Content API.
 *
 * `<SanityLive action="refresh" />` (rendered in the root layout) keeps an EventSource open to the
 * Live Content API for published content only, and refreshes the router when content changes.
 * Pages that show pledges render per request and read with `fetchPublished`, so a refresh always
 * re-reads the Content Lake. We don't lean on Next's data cache here: `revalidateTag(tag, 'max')`
 * serves stale data on the next read, and a pledge count must never look fresher or older than it is.
 *
 * No tokens: the browser only ever sees published (= verified) content.
 */
export const {SanityLive} = defineLive({client, serverToken: false, browserToken: false})

const uncached = client.withConfig({useCdn: false})

/** Read published documents straight from the Content Lake API (no CDN, no Next.js data cache). */
export function fetchPublished<T>(query: string, params: QueryParams = {}): Promise<T> {
  return uncached.fetch<T>(query, params, {cache: 'no-store'})
}
