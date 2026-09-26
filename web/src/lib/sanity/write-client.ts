import 'server-only'

import {createClient, type SanityClient} from 'next-sanity'
import {apiVersion, dataset, projectId} from './config'

let cached: SanityClient | null = null

export function isWriteClientConfigured(): boolean {
  return Boolean(process.env.SANITY_API_WRITE_TOKEN?.trim())
}

/**
 * Server-only client with an editor token. It can read drafts and write documents.
 * Never import this from a client component (the `server-only` import enforces that).
 */
export function getWriteClient(): SanityClient {
  const token = process.env.SANITY_API_WRITE_TOKEN?.trim()
  if (!token) {
    throw new Error('SANITY_API_WRITE_TOKEN is not configured on this server.')
  }
  cached ??= createClient({
    projectId,
    dataset,
    apiVersion,
    token,
    useCdn: false,
    perspective: 'raw',
  })
  return cached
}
