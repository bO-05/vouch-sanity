import {defineQuery} from 'next-sanity'

/** Published (= verified) requests for the public feed, most urgent first. */
export const FEED_QUERY = defineQuery(`
  *[_type == "need" && stage in ["open", "proof_check", "proof_review", "fulfilled"]]
    | order(urgency desc, publishedAt desc) {
      _id,
      title,
      displayName,
      city,
      country,
      urgency,
      stage,
      isDemo,
      publishedAt,
      "category": category->title,
      "items": items[]{
        _key,
        quantity,
        "pledged": coalesce(pledgedQty, 0),
        "name": supplyItem->name,
        "unit": supplyItem->unit
      }
    }
`)

export type FeedItem = {
  _key: string
  quantity: number
  pledged: number
  name: string | null
  unit: string | null
}

export type FeedNeed = {
  _id: string
  title: string
  displayName: string
  city: string
  country: string
  urgency: number | null
  stage: string
  isDemo: boolean | null
  publishedAt: string | null
  category: string | null
  items: FeedItem[] | null
}

export const CATEGORY_CRITERIA_QUERY = defineQuery(`
  *[_type == "category"] | order(order asc) {"slug": slug.current, description}
`)

export type CategoryCriterion = {slug: string; description: string}

export const STATUS_COUNTS_QUERY = defineQuery(`{
  "publishedNeeds": count(*[_type == "need"]),
  "categories": count(*[_type == "category"]),
  "supplyItems": count(*[_type == "supplyItem" && active != false]),
  "policy": defined(*[_id == "policy"][0]._id)
}`)

export type StatusCounts = {
  publishedNeeds: number
  categories: number
  supplyItems: number
  policy: boolean
}
