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
  auto_verified: 'receipt verified',
  error: 'error',
}

export const REVIEW_ACTION_LABELS: Record<string, string> = {
  approve: 'Approved',
  send_back: 'Sent back',
  reject: 'Rejected',
}

/** A review with a `proof` reference is about a receipt: approve = accepted, reject = declined. */
export const PROOF_REVIEW_ACTION_LABELS: Record<string, string> = {
  approve: 'Accepted the receipt',
  reject: 'Declined the receipt',
}

export const PROOF_VERDICT_LABELS: Record<string, string> = {
  pending: 'Being checked by Jev',
  auto_verified: 'Verified automatically (Jev’s answers cleared the policy)',
  needs_review: 'Waiting for a volunteer verifier',
  verified: 'Accepted by a volunteer verifier',
  rejected: 'Declined by a volunteer verifier',
}

export const PLEDGE_STATUS_LABELS: Record<string, string> = {
  pledged: 'Pledged',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

/** Only requests in this stage accept new pledges. */
export const PLEDGEABLE_STAGE = 'open'

/** Stages of the `need-lifecycle` workflow (src/workflows/need-lifecycle.ts), in plain words. */
export const LIFECYCLE_STAGE_LABELS: Record<string, string> = {
  triage: 'Jev checks it against the policy',
  review: 'A volunteer verifier decides',
  sent_back: 'Back with the requester for changes',
  publishing: 'Publishing the checked words',
  open: 'Verified and live',
  proof_check: 'Jev matches a receipt',
  proof_review: 'A verifier checks the receipt',
  certifying: 'Issuing the certificate',
  fulfilled: 'Fulfilled',
  rejected: 'Rejected (stays private)',
}

/** Effects of the lifecycle, in plain words. */
export const LIFECYCLE_EFFECT_LABELS: Record<string, string> = {
  'jev-triage': 'Jev triage',
  'publish-need': 'publishing',
  'record-send-back': 'recording the send-back',
  'record-rejection': 'recording the rejection',
  'jev-proof': 'Jev proof match',
  'issue-certificate': 'issuing the certificate',
  'record-proof-accepted': 'recording the receipt acceptance',
  'record-proof-declined': 'recording the receipt decline',
}
