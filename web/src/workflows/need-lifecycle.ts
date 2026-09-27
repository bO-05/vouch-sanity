/**
 * The request lifecycle as a Sanity Workflows definition (@sanity/workflow-engine, early access).
 *
 * A request is born as a private draft. Jev (an agent that can only answer typed questions) moves it
 * forward, and a volunteer verifier approves it through the SAME transitions: both the automatic pass
 * and a verifier's approval enter `publishing`, whose effect publishes the draft (published = verified).
 *
 *   triage ──passed──▶ publishing ──▶ open ──proof──▶ proof_check ──▶ certifying ──▶ fulfilled
 *     │                   ▲   │                           │              ▲
 *     ▼                   │   ▼ (publish failed)          ▼              │
 *   review ──approve──────┘ review                   proof_review ──accept
 *     │  └──send back──▶ sent_back ──resubmit──▶ triage       └──decline──▶ open
 *     └──reject──▶ rejected
 *
 * The engine is a library, not a service: Vouch's server code calls it (start, fire an action, drain
 * the queued effects) and registers the effect handlers (src/lib/lifecycle/). Every engine check is
 * advisory; the server checks the verifier passcode and the requester's status token before it fires
 * anything. Pure module (no runtime imports besides the definition helpers), so scripts/ can deploy it.
 */
import {
  defineAction,
  defineActivity,
  defineEffect,
  defineField,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflow-engine/define'

export const NEED_LIFECYCLE = 'need-lifecycle'

/** The engine's environment partition for everything Vouch runs (definitions and instances). */
export const WORKFLOW_TAG = 'prod'

/** One instance per request, with an id derived from the request id (no lookup, idempotent start). */
export function lifecycleInstanceId(needId: string, tag: string = WORKFLOW_TAG): string {
  return `${tag}.wf-instance.${needId.replace(/^need-/, '').replace(/[^a-zA-Z0-9]/g, '')}`
}

/**
 * Effect names. A name is the registry key and must be unique within the definition, so each
 * recorded human decision has its own effect; they share one handler (src/lib/lifecycle/effects.ts).
 * An approval has no record effect: the publish effect records it in the same transaction that
 * publishes, so "approved" and "live" can't disagree.
 */
export const EFFECTS = {
  triage: 'jev-triage',
  publish: 'publish-need',
  proof: 'jev-proof',
  certificate: 'issue-certificate',
} as const

export const RECORD_EFFECTS = {
  send_back: 'record-send-back',
  reject: 'record-rejection',
  accept_proof: 'record-proof-accepted',
  decline_proof: 'record-proof-declined',
} as const

/** What a record effect writes: the `review.action` and what the review is about. */
export type RecordInput = {action: 'approve' | 'send_back' | 'reject'; target: 'need' | 'proof'}

/** Caller-fired actions, by stage. The server fires them; nobody else holds the token. */
export const ACTIONS = {
  review: {activity: 'verify', approve: 'approve', sendBack: 'send-back', reject: 'reject'},
  sentBack: {activity: 'revise', resubmit: 'resubmit'},
  open: {activity: 'collect', submitProof: 'submit-proof'},
  proofReview: {activity: 'verify-proof', accept: 'accept', decline: 'decline'},
} as const

const subject = {subject: '$fields.subject._id'}

/** A verifier's decision: the reviewer's display name and a note for the requester. */
const reviewerParams = (noteRequired: boolean) => [
  {type: 'string' as const, name: 'reviewer', title: 'Reviewer display name', required: true},
  {type: 'string' as const, name: 'note', title: 'Note for the requester', required: noteRequired},
]

type RecordKind = keyof typeof RECORD_EFFECTS

const RECORD_INPUT: Record<RecordKind, RecordInput> = {
  send_back: {action: 'send_back', target: 'need'},
  reject: {action: 'reject', target: 'need'},
  accept_proof: {action: 'approve', target: 'proof'},
  decline_proof: {action: 'reject', target: 'proof'},
}

const recordReview = (kind: RecordKind) =>
  defineEffect({
    name: RECORD_EFFECTS[kind],
    title: 'Record the human review',
    bindings: {
      ...subject,
      reviewer: '$params.reviewer',
      note: '$params.note',
      ...(RECORD_INPUT[kind].target === 'proof' ? {proof: '$fields.proofId'} : {}),
    },
    input: RECORD_INPUT[kind],
  })

// One decision per stage visit: once `decision` is set, the other decision actions don't exist.
const undecided = '!defined($fields.decision)'
const setDecision = (value: string) =>
  ({type: 'field.set', target: {field: 'decision'}, value: {type: 'literal', value}}) as const

/** A decision that is recorded by its own effect (send back, reject, proof decisions). */
const decide = (name: string, title: string, kind: RecordKind, noteRequired: boolean) =>
  defineAction({
    name,
    title,
    filter: undecided,
    params: reviewerParams(noteRequired),
    ops: [setDecision(kind)],
    effects: [recordReview(kind)],
  })

/** Resolves a decision activity once its review is recorded; a failed recording re-opens the decision. */
const decisionBookkeeping = (kinds: RecordKind[]) => {
  const statuses = `[${kinds.map((kind) => `$effectStatus['${RECORD_EFFECTS[kind]}']`).join(', ')}]`
  return [
    defineAction({name: 'recorded', title: 'Review recorded', when: `count(${statuses}[@ == 'done']) > 0`, status: 'done'}),
    defineAction({
      name: 'recording-failed',
      title: 'Recording the review failed: decide again',
      when: `count(${statuses}[@ == 'failed']) > 0`,
      ops: [{type: 'field.unset', target: {field: 'decision'}}],
    }),
  ]
}

const routeTo = (decision: string) => `$allActivitiesDone && coalesce($fields.decision, '') == '${decision}'`

export const needLifecycle = defineWorkflow({
  name: NEED_LIFECYCLE,
  title: 'Request lifecycle',
  description:
    "A neighbor's request, from private draft to verified (published) to fulfilled. Jev checks every request; a volunteer verifier decides whenever Jev's answers don't clear Vouch's policy.",
  start: {kind: 'autonomous'},
  initialStage: 'triage',
  fields: [
    defineField({
      type: 'subject',
      name: 'subject',
      title: 'Request',
      types: ['need'],
      required: true,
      initialValue: {type: 'input'},
      description: 'The request (base id; it stays a private draft until it is published).',
    }),
    defineField({
      type: 'string',
      name: 'publishRev',
      title: 'Revision to publish',
      description:
        'The draft revision that may go live: the one Jev checked, or the one the verifier saw. Publishing fails if the draft changed since.',
    }),
    defineField({
      type: 'string',
      name: 'adoptAt',
      title: 'Adopt at stage',
      description:
        'Only for requests that existed before this lifecycle: their triage (or review) already happened, so the instance starts at that stage instead of asking Jev again. Cleared on resubmit.',
      options: {list: [{title: 'Review', value: 'review'}, {title: 'Open', value: 'open'}]},
      initialValue: {type: 'input'},
    }),
    defineField({type: 'string', name: 'approvedBy', title: 'Approved by (verifier display name)'}),
    defineField({type: 'string', name: 'approvalNote', title: "Verifier's approval note"}),
    defineField({type: 'string', name: 'proofId', title: 'Receipt (proof) under review'}),
  ],
  stages: [
    defineStage({
      name: 'triage',
      title: 'Triage: Jev checks the request',
      activities: [
        defineActivity({
          name: 'jev-check',
          title: 'Jev answers the triage questions; code gates them against the policy',
          actions: [
            defineAction({
              name: 'ask-jev',
              title: 'Ask Jev',
              filter: '!defined($fields.adoptAt)',
              when: 'true',
              // A fresh check: an approval from an earlier round never rides along into this one.
              ops: [
                {type: 'field.unset', target: {field: 'approvedBy'}},
                {type: 'field.unset', target: {field: 'approvalNote'}},
              ],
              effects: [
                defineEffect({
                  name: EFFECTS.triage,
                  title: 'Jev triage + policy gate',
                  bindings: subject,
                  outputs: [{type: 'string', name: 'route'}],
                }),
              ],
            }),
            defineAction({
              name: 'checked',
              title: 'Triage finished',
              when: `defined($effectStatus['${EFFECTS.triage}'])`,
              status: 'done',
            }),
          ],
        }),
      ],
      transitions: [
        // Pre-lifecycle requests (see `adoptAt`). Guarded with coalesce: a null condition would stop selection.
        defineTransition({
          name: 'adopted-review',
          title: 'Adopted: already waiting for a verifier',
          to: 'review',
          when: "coalesce($fields.adoptAt, '') == 'review'",
        }),
        defineTransition({
          name: 'adopted-open',
          title: 'Adopted: already verified and published',
          to: 'open',
          when: "coalesce($fields.adoptAt, '') == 'open'",
        }),
        defineTransition({
          name: 'passed',
          title: 'Nothing needs a person: publish',
          to: 'publishing',
          when: `$allActivitiesDone && $effectStatus['${EFFECTS.triage}'] == 'done' && coalesce($effects['${EFFECTS.triage}'].route, '') == 'publish'`,
        }),
        // Flagged, emergency, Jev down, a broken policy, a failed handler: a person decides.
        defineTransition({name: 'to-verifier', title: 'A volunteer verifier decides', to: 'review', when: '$allActivitiesDone'}),
      ],
    }),

    defineStage({
      name: 'review',
      title: 'Review: a volunteer verifier decides',
      fields: [defineField({type: 'string', name: 'decision'})],
      activities: [
        defineActivity({
          name: ACTIONS.review.activity,
          title: 'Approve, send back with a question, or reject',
          actions: [
            defineAction({
              name: ACTIONS.review.approve,
              title: 'Approve and publish',
              filter: undecided,
              params: [
                ...reviewerParams(false),
                {type: 'string', name: 'rev', title: 'Draft revision the verifier saw', required: true},
              ],
              // Publishing records the approval (same transaction), so the decision resolves here.
              ops: [
                setDecision('approve'),
                {type: 'field.set', target: {field: 'publishRev'}, value: {type: 'param', param: 'rev'}},
                {type: 'field.set', target: {field: 'approvedBy'}, value: {type: 'param', param: 'reviewer'}},
                {type: 'field.set', target: {field: 'approvalNote'}, value: {type: 'param', param: 'note'}},
              ],
              status: 'done',
            }),
            decide(ACTIONS.review.sendBack, 'Send back to the requester', 'send_back', true),
            decide(ACTIONS.review.reject, 'Reject', 'reject', true),
            ...decisionBookkeeping(['send_back', 'reject']),
          ],
        }),
      ],
      transitions: [
        defineTransition({name: 'approved', title: 'Approved: publish', to: 'publishing', when: routeTo('approve')}),
        defineTransition({name: 'sent-back', title: 'Back to the requester', to: 'sent_back', when: routeTo('send_back')}),
        defineTransition({name: 'rejected', title: 'Rejected', to: 'rejected', when: routeTo('reject')}),
      ],
    }),

    defineStage({
      name: 'sent_back',
      title: 'Sent back: the requester answers on their private status page',
      activities: [
        defineActivity({
          name: ACTIONS.sentBack.activity,
          title: 'The requester edits the request and resubmits it',
          actions: [
            defineAction({
              name: ACTIONS.sentBack.resubmit,
              title: 'Resubmit',
              // The edited request is checked from scratch, adopted or not.
              ops: [{type: 'field.unset', target: {field: 'adoptAt'}}],
              status: 'done',
            }),
          ],
        }),
      ],
      transitions: [defineTransition({name: 'resubmitted', title: 'Check again', to: 'triage', when: '$allActivitiesDone'})],
    }),

    defineStage({
      name: 'publishing',
      title: 'Publishing: the draft becomes the verified request',
      activities: [
        defineActivity({
          name: 'publish',
          title: 'Publish the exact revision that was checked',
          actions: [
            defineAction({
              name: 'publish',
              title: 'Publish',
              when: 'true',
              effects: [
                defineEffect({
                  name: EFFECTS.publish,
                  title: 'Revision-guarded publish transaction',
                  bindings: {
                    ...subject,
                    rev: '$fields.publishRev',
                    approvedBy: '$fields.approvedBy',
                    approvalNote: '$fields.approvalNote',
                  },
                  outputs: [{type: 'boolean', name: 'published'}],
                }),
              ],
            }),
            defineAction({
              name: 'attempted',
              title: 'Publish attempted',
              when: `defined($effectStatus['${EFFECTS.publish}'])`,
              status: 'done',
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({
          name: 'live',
          title: 'Verified and live',
          to: 'open',
          when: `$allActivitiesDone && $effectStatus['${EFFECTS.publish}'] == 'done' && coalesce($effects['${EFFECTS.publish}'].published, false)`,
        }),
        defineTransition({name: 'publish-failed', title: 'Publishing failed: a verifier decides', to: 'review', when: '$allActivitiesDone'}),
      ],
    }),

    defineStage({
      name: 'open',
      title: 'Open: neighbors pledge checklist items',
      activities: [
        defineActivity({
          name: ACTIONS.open.activity,
          title: 'Collect pledges until a receipt is uploaded',
          actions: [
            defineAction({
              name: ACTIONS.open.submitProof,
              title: 'A receipt was uploaded',
              params: [{type: 'string', name: 'proofId', title: 'Proof document id', required: true}],
              ops: [{type: 'field.set', target: {field: 'proofId'}, value: {type: 'param', param: 'proofId'}}],
              status: 'done',
            }),
          ],
        }),
      ],
      transitions: [defineTransition({name: 'proof-submitted', title: 'Check the receipt', to: 'proof_check', when: '$allActivitiesDone'})],
    }),

    defineStage({
      name: 'proof_check',
      title: 'Proof check: Jev matches the receipt to the checklist',
      activities: [
        defineActivity({
          name: 'jev-proof',
          title: 'Jev scores receipt lines against checklist lines; code assigns and computes coverage',
          actions: [
            defineAction({
              name: 'match',
              title: 'Match the receipt',
              when: 'true',
              effects: [
                defineEffect({
                  name: EFFECTS.proof,
                  title: 'Jev proof match',
                  bindings: {...subject, proof: '$fields.proofId'},
                  outputs: [{type: 'string', name: 'verdict'}],
                }),
              ],
            }),
            defineAction({
              name: 'matched',
              title: 'Proof check finished',
              when: `defined($effectStatus['${EFFECTS.proof}'])`,
              status: 'done',
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({
          name: 'auto-verified',
          title: 'The receipt covers the checklist',
          to: 'certifying',
          when: `$allActivitiesDone && $effectStatus['${EFFECTS.proof}'] == 'done' && coalesce($effects['${EFFECTS.proof}'].verdict, '') == 'auto_verified'`,
        }),
        defineTransition({name: 'to-verifier', title: 'A verifier checks the receipt', to: 'proof_review', when: '$allActivitiesDone'}),
      ],
    }),

    defineStage({
      name: 'proof_review',
      title: 'Proof review: a verifier checks the receipt',
      fields: [defineField({type: 'string', name: 'decision'})],
      activities: [
        defineActivity({
          name: ACTIONS.proofReview.activity,
          title: 'Accept or decline the receipt',
          actions: [
            decide(ACTIONS.proofReview.accept, 'Accept the receipt', 'accept_proof', false),
            decide(ACTIONS.proofReview.decline, 'Decline the receipt', 'decline_proof', true),
            ...decisionBookkeeping(['accept_proof', 'decline_proof']),
          ],
        }),
      ],
      transitions: [
        defineTransition({name: 'accepted', title: 'Accepted: issue the certificate', to: 'certifying', when: routeTo('accept_proof')}),
        defineTransition({name: 'declined', title: 'Declined: back to collecting', to: 'open', when: routeTo('decline_proof')}),
      ],
    }),

    defineStage({
      name: 'certifying',
      title: 'Certifying: the fulfilment certificate is issued',
      activities: [
        defineActivity({
          name: 'certify',
          title: 'Issue the certificate (canonical payload + SHA-256)',
          actions: [
            defineAction({
              name: 'issue',
              title: 'Issue the certificate',
              when: 'true',
              effects: [defineEffect({name: EFFECTS.certificate, title: 'Issue certificate', bindings: {...subject, proof: '$fields.proofId'}})],
            }),
            defineAction({
              name: 'issued',
              title: 'Certificate attempted',
              when: `defined($effectStatus['${EFFECTS.certificate}'])`,
              status: 'done',
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({
          name: 'certified',
          title: 'Fulfilled',
          to: 'fulfilled',
          when: `$allActivitiesDone && $effectStatus['${EFFECTS.certificate}'] == 'done'`,
        }),
        defineTransition({name: 'certify-failed', title: 'Certificate failed: a verifier looks', to: 'proof_review', when: '$allActivitiesDone'}),
      ],
    }),

    defineStage({name: 'fulfilled', title: 'Fulfilled'}),
    defineStage({name: 'rejected', title: 'Rejected (the draft stays private)'}),
  ],
})
