import {createClient} from 'next-sanity'
import {apiVersion, dataset, projectId} from './config'

/**
 * Public, token-less client. It can only ever see published documents, and in Vouch
 * "published" means "verified": unverified requests stay drafts and are invisible here.
 */
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  perspective: 'published',
})
