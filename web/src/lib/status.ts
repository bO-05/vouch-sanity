import 'server-only'

import {createHash} from 'node:crypto'
import {POLICY_QUERY} from '@/lib/queries'
import {fetchPublished} from '@/lib/sanity/live'
import {getWriteClient} from '@/lib/sanity/write-client'

/**
 * The requester's private status page. The link carries a random 256-bit token in the URL
 * fragment (browsers never send fragments to servers, so it stays out of logs); the page posts it
 * here. Only the token's SHA-256 is stored on the request, so the dataset can't reveal the link.
 */

const TOKEN = /^[A-Za-z0-9_-]{43}$/

export type StatusItem = {_key: string; quantity: number; pledged: number; name: string | null; unit: string | null}

export type RequestStatus = {
  needId: string
  published: boolean
  stage: string
  title: string
  story: string
  language: string | null
  displayName: string
  city: string
  country: string
  submittedAt: string | null
  publishedAt: string | null
  triage: {outcome: string | null; reasons: string[] | null} | null
  items: StatusItem[]
  reviews: Array<{_id: string; action: string; note: string | null; reviewerName: string; createdAt: string | null}>
  /** Only when triage showed them (emergency flag). */
  emergencyResources: string | null
}

export type StatusLookup = {ok: true; status: RequestStatus} | {ok: false; message: string}

type Row = Omit<RequestStatus, 'needId' | 'published' | 'reviews' | 'emergencyResources'> & {_id: string}

const STATUS_QUERY = `*[_type == "need" && statusTokenHash == $hash]{
  _id, stage, title, story, language, displayName, city, country, submittedAt, publishedAt,
  triage{outcome, reasons},
  "items": coalesce(items[]{
    _key, quantity, "pledged": coalesce(pledgedQty, 0), "name": supplyItem->name, "unit": supplyItem->unit
  }, [])
}`

const REVIEWS_QUERY = `*[_type == "review" && subject._ref == $id] | order(createdAt asc){
  _id, action, note, reviewerName, createdAt
}`

export async function lookupStatus(token: unknown): Promise<StatusLookup> {
  if (typeof token !== 'string' || !TOKEN.test(token)) {
    return {ok: false, message: 'This status link is incomplete. Copy the whole link, including the part after #.'}
  }
  const hash = createHash('sha256').update(token).digest('hex')
  try {
    const client = getWriteClient()
    const rows = await client.fetch<Row[]>(STATUS_QUERY, {hash}, {tag: 'vouch.status', timeout: 15_000})
    // After publishing only the published document exists; prefer it if both ever do.
    const row = rows.find((r) => !r._id.startsWith('drafts.')) ?? rows[0]
    if (!row) return {ok: false, message: 'No request matches this link.'}

    const needId = row._id.replace(/^drafts\./, '')
    const [reviews, emergencyResources] = await Promise.all([
      client.fetch<RequestStatus['reviews']>(REVIEWS_QUERY, {id: needId}, {timeout: 15_000}),
      row.triage?.outcome === 'emergency'
        ? fetchPublished<{emergencyResources?: string} | null>(POLICY_QUERY).then((p) => p?.emergencyResources ?? null)
        : Promise.resolve(null),
    ])
    const {_id, ...rest} = row
    return {
      ok: true,
      status: {...rest, needId, published: !_id.startsWith('drafts.'), reviews, emergencyResources},
    }
  } catch (error) {
    return {
      ok: false,
      message: `Couldn't load the request from Sanity: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
