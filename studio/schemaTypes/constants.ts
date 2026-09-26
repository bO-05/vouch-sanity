/**
 * Shared vocabularies for the Vouch content model.
 * The web app mirrors these values in web/src/lib/vocab.ts; keep them in sync.
 */

export const API_VERSION = '2026-09-01'

/** Lifecycle stages of a request. Only the server moves a request between stages. */
export const NEED_STAGES = [
  {title: 'Intake: written, not yet checked', value: 'intake'},
  {title: 'Triage: Jev is checking it', value: 'triage'},
  {title: 'Review: waiting for a volunteer verifier', value: 'review'},
  {title: 'Sent back to the requester', value: 'sent_back'},
  {title: 'Open: collecting pledges', value: 'open'},
  {title: 'Proof check: Jev is matching a receipt', value: 'proof_check'},
  {title: 'Proof review: waiting for a verifier', value: 'proof_review'},
  {title: 'Fulfilled', value: 'fulfilled'},
  {title: 'Rejected', value: 'rejected'},
]

/** Urgency scale (0-3). The wording Jev scores against lives in the Policy document. */
export const URGENCY_LEVELS = [
  {title: '0 · Can wait', value: 0},
  {title: '1 · Soon', value: 1},
  {title: '2 · Urgent', value: 2},
  {title: '3 · Critical', value: 3},
]

/** Language the request was written or spoken in (BCP 47 primary tags). */
export const LANGUAGES = [
  {title: 'English', value: 'en'},
  {title: 'Spanish', value: 'es'},
  {title: 'Ukrainian', value: 'uk'},
  {title: 'French', value: 'fr'},
  {title: 'Portuguese', value: 'pt'},
  {title: 'Arabic', value: 'ar'},
  {title: 'Tagalog', value: 'tl'},
  {title: 'Indonesian', value: 'id'},
  {title: 'Swahili', value: 'sw'},
  {title: 'Other', value: 'other'},
]

/** What a Jev call was for. */
export const DECISION_KINDS = [
  {title: 'Catalog match', value: 'catalog_match'},
  {title: 'Triage', value: 'triage'},
  {title: 'Duplicate check', value: 'duplicate'},
  {title: 'Proof match', value: 'proof_match'},
  {title: 'Health check', value: 'health_check'},
]

export const TRIAGE_OUTCOMES = [
  {title: 'Auto-published', value: 'auto_published'},
  {title: 'Needs human review', value: 'needs_review'},
  {title: 'Emergency resources shown', value: 'emergency'},
  {title: 'Error: routed to a human', value: 'error'},
]

export const PROOF_VERDICTS = [
  {title: 'Pending', value: 'pending'},
  {title: 'Auto-verified', value: 'auto_verified'},
  {title: 'Needs human review', value: 'needs_review'},
  {title: 'Verified by a human', value: 'verified'},
  {title: 'Rejected', value: 'rejected'},
]

export const REVIEW_ACTIONS = [
  {title: 'Approve', value: 'approve'},
  {title: 'Send back', value: 'send_back'},
  {title: 'Reject', value: 'reject'},
]

export const PLEDGE_STATUSES = [
  {title: 'Pledged', value: 'pledged'},
  {title: 'Delivered', value: 'delivered'},
  {title: 'Cancelled', value: 'cancelled'},
]

/** Where a triage flag sends a request when it fires. */
export const FLAG_ROUTES = [
  {title: 'Human review', value: 'review'},
  {title: 'Emergency resources, then human review', value: 'emergency'},
]
