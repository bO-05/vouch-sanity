import {BulbOutlineIcon} from '@sanity/icons/BulbOutline'
import {UserIcon} from '@sanity/icons/User'
import {defineField, defineType} from 'sanity'
import {DECISION_KINDS, REVIEW_ACTIONS} from './constants'
import {noContactInfo} from './validation'

/**
 * One call to Jev (TypeSafe's System One model): the typed questions, the typed answers with
 * probabilities, and what the code did with them. Every call is recorded, including failures.
 *
 * Privacy: the state sent to Jev contains the requester's words, which stay private until the
 * request is verified. So the state is NOT copied here, only its SHA-256 digest. The subject
 * reference is weak because the request may still be a draft.
 */
export const decision = defineType({
  name: 'decision',
  title: 'Jev decision',
  type: 'document',
  icon: BulbOutlineIcon,
  readOnly: true,
  fields: [
    defineField({
      name: 'kind',
      type: 'string',
      options: {list: DECISION_KINDS},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'subject',
      type: 'reference',
      to: [{type: 'need'}, {type: 'proof'}],
      weak: true,
      description: 'Weak reference: the request may still be a private draft.',
    }),
    defineField({
      name: 'model',
      type: 'string',
      description: 'Model id reported by the API response, e.g. jev-1.13.0.',
    }),
    defineField({
      name: 'questions',
      type: 'text',
      rows: 8,
      description: 'The exact typed questions sent (JSON).',
    }),
    defineField({
      name: 'answers',
      type: 'text',
      rows: 8,
      description: 'The exact typed answers received, with probabilities (JSON). Empty when the call failed.',
    }),
    defineField({
      name: 'stateDigest',
      type: 'string',
      description:
        'SHA-256 of the exact state sent to Jev. The state itself is not copied here, so unverified requests stay private.',
    }),
    defineField({
      name: 'outcome',
      type: 'string',
      description: 'What the code did with the answers, e.g. auto_published or needs_review.',
    }),
    defineField({
      name: 'error',
      type: 'string',
      description: 'Why the call failed, if it did. Failures route to a human; nothing is guessed.',
    }),
    defineField({name: 'latencyMs', title: 'Latency (ms)', type: 'number'}),
    defineField({name: 'inputTokens', type: 'number'}),
    defineField({name: 'createdAt', type: 'datetime'}),
  ],
  orderings: [{title: 'Newest first', name: 'createdDesc', by: [{field: 'createdAt', direction: 'desc'}]}],
  preview: {
    select: {
      kind: 'kind',
      outcome: 'outcome',
      model: 'model',
      latencyMs: 'latencyMs',
      error: 'error',
    },
    prepare: ({kind, outcome, model, latencyMs, error}) => ({
      title: `${kind ?? 'decision'} → ${error ? 'error' : (outcome ?? '…')}`,
      subtitle: [model, typeof latencyMs === 'number' ? `${latencyMs} ms` : null]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})

/** A volunteer verifier's decision on a request or a proof, kept next to the Jev decisions. */
export const review = defineType({
  name: 'review',
  title: 'Human review',
  type: 'document',
  icon: UserIcon,
  readOnly: true,
  fields: [
    defineField({
      name: 'subject',
      type: 'reference',
      to: [{type: 'need'}, {type: 'proof'}],
      weak: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'proof',
      title: 'Receipt (for receipt reviews)',
      type: 'reference',
      to: [{type: 'proof'}],
      weak: true,
      description: 'Set when the verifier accepted or declined a receipt: approve = accepted, reject = declined.',
    }),
    defineField({
      name: 'action',
      type: 'string',
      options: {list: REVIEW_ACTIONS},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'note',
      type: 'text',
      rows: 3,
      description: 'Shown to the requester when a request is sent back. No personal details.',
      validation: (rule) => [rule.max(500), rule.custom(noContactInfo).warning()],
    }),
    defineField({
      name: 'reviewerName',
      title: 'Reviewer display name',
      type: 'string',
      validation: (rule) => rule.required().max(40),
    }),
    defineField({name: 'createdAt', type: 'datetime'}),
  ],
  orderings: [{title: 'Newest first', name: 'createdDesc', by: [{field: 'createdAt', direction: 'desc'}]}],
  preview: {
    select: {action: 'action', reviewerName: 'reviewerName', note: 'note'},
    prepare: ({action, reviewerName, note}) => ({
      title: `${reviewerName ?? 'Verifier'}: ${action ?? '…'}`,
      subtitle: note,
    }),
  },
})
