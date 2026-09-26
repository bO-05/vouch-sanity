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
