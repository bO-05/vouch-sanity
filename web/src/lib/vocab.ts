/** Mirrors studio/schemaTypes/constants.ts. Keep them in sync. */

export const URGENCY_LABELS: Record<number, string> = {
  0: 'Can wait',
  1: 'Soon',
  2: 'Urgent',
  3: 'Critical',
}

export const STAGE_LABELS: Record<string, string> = {
  intake: 'Written, not yet checked',
  triage: 'Being checked',
  review: 'Waiting for a volunteer verifier',
  sent_back: 'Sent back to the requester',
  open: 'Collecting pledges',
  proof_check: 'Checking a receipt',
  proof_review: 'Receipt waiting for a verifier',
  fulfilled: 'Fulfilled',
  rejected: 'Rejected',
}

export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  uk: 'Ukrainian',
  fr: 'French',
  pt: 'Portuguese',
  ar: 'Arabic',
  tl: 'Tagalog',
  id: 'Indonesian',
  sw: 'Swahili',
  other: 'Other',
}

export const DECISION_KIND_LABELS: Record<string, string> = {
  catalog_match: 'Catalog match',
  triage: 'Triage',
  duplicate: 'Duplicate check',
  proof_match: 'Proof match',
  health_check: 'Health check',
}

/** What happened to a request at triage (the need's `triage.outcome`). */
export const TRIAGE_OUTCOME_LABELS: Record<string, string> = {
  auto_published: 'Passed triage: published automatically',
  needs_review: 'Sent to a volunteer verifier',
  emergency: 'Emergency resources shown, sent to a volunteer verifier',
  error: 'Something failed, so it was sent to a volunteer verifier',
}

/** What code decided from Jev's answers (the decision's `outcome`). */
export const DECISION_OUTCOME_LABELS: Record<string, string> = {
  passed_gate: 'passed the gate',
  needs_review: 'needs a volunteer',
  emergency: 'possible emergency',
  health_check_ok: 'health check ok',
  error: 'error',
}

export const REVIEW_ACTION_LABELS: Record<string, string> = {
  approve: 'Approved',
  send_back: 'Sent back',
  reject: 'Rejected',
}

export const PLEDGE_STATUS_LABELS: Record<string, string> = {
  pledged: 'Pledged',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

/** Only requests in this stage accept new pledges. */
export const PLEDGEABLE_STAGE = 'open'
