import 'server-only'

import {createHash} from 'node:crypto'
import {errorMessage, isConflict} from '@/lib/intake-context'
import {getWriteClient} from '@/lib/sanity/write-client'

/**
 * The effects that change what the public can see, and the human reviews.
 *
 * Published = verified. A draft becomes public only through `publishDraft`: one transaction guarded
 * by the exact revision that was checked (by Jev) or seen (by a verifier). `create` fails if a
 * published version already exists, so a stale draft can never overwrite a live request.
 *
 * Reviews live under a private path (`review.*`): they talk about requests that may still be private
 * drafts. The request page shows them (server-side) once the request is published.
 */

const TIMEOUT_MS = 15_000

/** Deterministic id per effect run, so an at-least-once redelivery writes the same review once. */
export function reviewDocId(effectKey: string): string {
  return `review.${createHash('sha256').update(`vouch-review\0${effectKey}`).digest('hex').slice(0, 32)}`
}

type Draft = Record<string, unknown> & {
  _id: string
  _rev: string
  triage?: {outcome?: string; reasons?: string[]} & Record<string, unknown>
}

export type PublishInput = {
  needId: string
  /** The revision that may go live. Anything else is refused. */
  rev: string | null
  /** Set when a verifier approved (the approval is recorded in the same transaction). */
  approvedBy: string | null
  approvalNote: string | null
  effectKey: string
}

export type PublishResult = {published: boolean; reason?: string}

export async function publishDraft(input: PublishInput): Promise<PublishResult> {
  const client = getWriteClient()
  const draftId = `drafts.${input.needId}`
  const [draft, published] = await Promise.all([
    client.getDocument<Draft>(draftId),
    client.getDocument<{_id: string}>(input.needId),
  ])

  if (!draft) {
    // At-least-once delivery: an earlier run of this same effect already published it.
    if (published) return {published: true}
    throw new Error(`There is no private draft ${draftId} to publish.`)
  }

  const backToReview = async (reason: string): Promise<PublishResult> => {
    const reasons = [reason, ...(draft.triage?.reasons ?? []).filter((r) => r !== reason)]
    await client
      .patch(draftId)
      .set({stage: 'review', 'triage.reasons': reasons, ...(draft.triage?.outcome === 'auto_published' ? {'triage.outcome': 'error'} : {})})
      .commit({visibility: 'async', tag: 'vouch.lifecycle.publish-failed', timeout: TIMEOUT_MS})
    return {published: false, reason}
  }

  if (published) {
    return backToReview('A published version of this request already exists, so this draft was not published over it.')
  }
  if (!input.rev || draft._rev !== input.rev) {
    return backToReview(
      input.approvedBy
        ? `The request changed after ${input.approvedBy} looked at it, so it was not published. Please look at it again.`
        : 'The request changed after Jev checked it, so a volunteer will review it.',
    )
  }

  const now = new Date().toISOString()
  const {_id, _rev, _createdAt, _updatedAt, ...content} = draft
  void _id
  void _rev
  void _createdAt
  void _updatedAt

  let transaction = client
    .transaction()
    .patch(draftId, (patch) => patch.ifRevisionId(input.rev as string).set({stage: 'open'}))
    .create({...content, _id: input.needId, _type: 'need', stage: 'open', publishedAt: now})
    .delete(draftId)
  if (input.approvedBy) {
    transaction = transaction.createIfNotExists({
      _id: reviewDocId(input.effectKey),
      _type: 'review',
      subject: {_type: 'reference', _ref: input.needId, _weak: true},
      action: 'approve',
      ...(input.approvalNote ? {note: input.approvalNote} : {}),
      reviewerName: input.approvedBy,
      createdAt: now,
    })
  }

  try {
    await transaction.commit({visibility: 'async', tag: 'vouch.lifecycle.publish', timeout: TIMEOUT_MS})
  } catch (error) {
    return backToReview(
      isConflict(error)
        ? 'The request changed while it was being published, so a volunteer will look at it again.'
        : `Publishing failed (${errorMessage(error)}), so a volunteer will look at it again.`,
    )
  }
  return {published: true}
}

export type RecordReviewInput = {
  needId: string
  action: 'send_back' | 'reject'
  reviewer: string
  note: string | null
  effectKey: string
}

/** Send back or reject: the review and the draft's new stage, in one transaction. */
export async function recordReview(input: RecordReviewInput): Promise<void> {
  const client = getWriteClient()
  const now = new Date().toISOString()
  await client
    .transaction()
    .createIfNotExists({
      _id: reviewDocId(input.effectKey),
      _type: 'review',
      subject: {_type: 'reference', _ref: input.needId, _weak: true},
      action: input.action,
      ...(input.note ? {note: input.note} : {}),
      reviewerName: input.reviewer,
      createdAt: now,
    })
    .patch(`drafts.${input.needId}`, (patch) => patch.set({stage: input.action === 'send_back' ? 'sent_back' : 'rejected'}))
    .commit({visibility: 'async', tag: 'vouch.lifecycle.review', timeout: TIMEOUT_MS})
}
