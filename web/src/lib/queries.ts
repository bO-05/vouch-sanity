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

/**
 * One published (= verified) request with everything its page shows. Drafts never match:
 * the public client only reads the published perspective, and `$id` is a base id.
 */
export const NEED_QUERY = defineQuery(`
  *[_type == "need" && _id == $id][0]{
    _id,
    title,
    story,
    language,
    displayName,
    city,
    country,
    urgency,
    stage,
    isDemo,
    submittedAt,
    publishedAt,
    fulfilledAt,
    "category": category->title,
    triage{outcome, reasons, minConfidence},
    "items": items[]{
      _key,
      quantity,
      "pledged": coalesce(pledgedQty, 0),
      "name": supplyItem->name,
      "unit": supplyItem->unit
    },
    "pledges": *[_type == "pledge" && need._ref == ^._id && status != "cancelled"]
      | order(pledgedAt desc) {_id, itemKey, quantity, donorDisplayName, status, pledgedAt, isDemo},
    "decisions": *[_type == "decision" && subject._ref == ^._id]
      | order(createdAt asc) {_id, kind, model, outcome, error, latencyMs, createdAt, answers},
    "reviews": *[_type == "review" && subject._ref == ^._id]
      | order(createdAt asc) {_id, action, note, reviewerName, createdAt}
  }
`)

export type NeedPledge = {
  _id: string
  itemKey: string
  quantity: number
  donorDisplayName: string
  status: string
  pledgedAt: string | null
  isDemo: boolean | null
}

export type NeedDecision = {
  _id: string
  kind: string
  model: string | null
  outcome: string | null
  error: string | null
  latencyMs: number | null
  createdAt: string | null
  /** The exact typed answers as JSON text (see lib/answers.ts). */
  answers: string | null
}

export type NeedReview = {
  _id: string
  action: string
  note: string | null
  reviewerName: string
  createdAt: string | null
}

export type NeedDetail = {
  _id: string
  title: string
  story: string
  language: string | null
  displayName: string
  city: string
  country: string
  urgency: number | null
  stage: string
  isDemo: boolean | null
  submittedAt: string | null
  publishedAt: string | null
  fulfilledAt: string | null
  category: string | null
  triage: {outcome: string | null; reasons: string[] | null; minConfidence: number | null} | null
  items: FeedItem[] | null
  pledges: NeedPledge[]
  decisions: NeedDecision[]
  reviews: NeedReview[]
}

export const CATEGORY_CRITERIA_QUERY = defineQuery(`
  *[_type == "category"] | order(order asc) {"slug": slug.current, description}
`)

export type CategoryCriterion = {slug: string; description: string}

/** Categories with their descriptions (Jev's option texts in triage). */
export const CATEGORY_OPTIONS_QUERY = defineQuery(`
  *[_type == "category"] | order(order asc) {_id, "slug": slug.current, title, description}
`)

/** Active supply items, the only things a checklist can contain. */
export const CATALOG_QUERY = defineQuery(`
  *[_type == "supplyItem" && active != false] | order(name asc) {
    _id, name, synonyms, unit, maxPerHousehold, "category": category->title
  }
`)

/** The published policy singleton. Drafts of it (unpublished Studio edits) never apply. */
export const POLICY_QUERY = defineQuery(`
  *[_id == "policy"][0]{thresholds, urgencyLevels, flagQuestions, emergencyResources}
`)

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
