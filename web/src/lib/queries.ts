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
      },
      "receipt": select(stage == "fulfilled" => *[_type == "proof" && need._ref == ^._id && verdict in ["auto_verified", "verified"]]
        | order(submittedAt desc)[0]{verdict, "quantities": quantities[]{itemKey, needed, shown}, "matched": matches[].itemKey})
    }
`)

/** The receipt that fulfilled a request: what it shows per checklist line. */
export type FulfillingReceipt = {
  verdict: string | null
  /** Null for receipts checked before Vouch read quantities (Sep 28, 2026). */
  quantities: Array<{itemKey: string; needed: number; shown: number}> | null
  matched: string[] | null
}

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
  receipt: FulfillingReceipt | null
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
    "proofs": *[_type == "proof" && need._ref == ^._id] | order(submittedAt desc) {
      _id, verdict, coverage, reasons, uploaderDisplayName, submittedAt,
      "lines": lines[]{text}, "matches": matches[]{lineIndex, itemKey, probability, quantity, quantityLine},
      "quantities": quantities[]{itemKey, needed, shown}
    },
    "certificate": *[_type == "certificate" && need._ref == ^._id][0]{_id, sha256, issuedAt}
  }
`)

export type NeedProof = {
  _id: string
  verdict: string | null
  coverage: number | null
  reasons: string[] | null
  uploaderDisplayName: string | null
  submittedAt: string | null
  lines: Array<{text: string}> | null
  matches: Array<{lineIndex: number; itemKey: string; probability: number; quantity: number | null; quantityLine: number | null}> | null
  /** Null for receipts checked before Vouch read quantities (Sep 28, 2026). */
  quantities: Array<{itemKey: string; needed: number; shown: number}> | null
}

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

/** Human reviews live under the private `review.*` path; the server reads them (lib/trail.ts). */
export type NeedReview = {
  _id: string
  action: string
  note: string | null
  reviewerName: string
  createdAt: string | null
  /** Set when the review is about a receipt (accepted or declined). */
  proof: string | null
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
  proofs: NeedProof[]
  certificate: {_id: string; sha256: string; issuedAt: string | null} | null
}

/** What the receipt page needs: the published request and its checklist. */
export const PROOF_PAGE_QUERY = defineQuery(`
  *[_type == "need" && _id == $id][0]{
    _id, title, displayName, city, stage,
    "items": items[]{_key, quantity, "name": supplyItem->name, "unit": supplyItem->unit}
  }
`)

export type ProofPageNeed = {
  _id: string
  title: string
  displayName: string
  city: string
  stage: string
  items: Array<{_key: string; quantity: number; name: string | null; unit: string | null}> | null
}

/** A published certificate (public). The payload is the exact text that was hashed. */
export const CERTIFICATE_QUERY = defineQuery(`
  *[_type == "certificate" && _id == $id][0]{
    _id, payload, sha256, issuedAt, "need": need->{_id, title, displayName, city, country}
  }
`)

export type CertificateDetail = {
  _id: string
  payload: string
  sha256: string
  issuedAt: string | null
  need: {_id: string; title: string; displayName: string; city: string; country: string} | null
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
