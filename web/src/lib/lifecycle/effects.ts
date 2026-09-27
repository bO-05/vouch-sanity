import 'server-only'

import {extractDocumentId, type EffectHandler} from '@sanity/workflow-engine'
import {EFFECTS, RECORD_EFFECTS, type RecordInput} from '@/workflows/need-lifecycle'
import {publishDraft, recordReview} from './publish-step'
import {runTriage} from './triage-step'

/**
 * Effect handlers for the `need-lifecycle` workflow. The definition names the effects; this is the
 * code that runs them when Vouch's server drains the queue. Handlers may run more than once for the
 * same queued effect (at-least-once delivery), so every write is idempotent or revision-guarded.
 *
 * Not registered yet (Day 5): `jev-proof`, `issue-certificate` and the proof review records. The
 * lifecycle can't reach them until receipts can be uploaded.
 */

function needIdFrom(params: Record<string, unknown>): string {
  if (typeof params.subject !== 'string') throw new Error('The effect has no subject reference.')
  const id = extractDocumentId(params.subject)
  if (!/^need-[\w-]+$/.test(id)) throw new Error(`Unexpected subject id: ${id}`)
  return id
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const triage: EffectHandler = async (params) => {
  const result = await runTriage(needIdFrom(params))
  return {
    outputs: {route: result.route},
    ...(result.checkedRev
      ? {
          ops: [
            {type: 'field.set', target: {scope: 'workflow', field: 'publishRev'}, value: {type: 'literal', value: result.checkedRev}},
          ],
        }
      : {}),
  }
}

const publish: EffectHandler = async (params, ctx) => {
  const result = await publishDraft({
    needId: needIdFrom(params),
    rev: text(params.rev),
    approvedBy: text(params.approvedBy),
    approvalNote: text(params.approvalNote),
    effectKey: ctx.effectKey,
  })
  if (result.reason) ctx.log(result.reason)
  return {outputs: {published: result.published}}
}

const record: EffectHandler = async (params, ctx) => {
  const action = (params as Partial<RecordInput>).action
  if (action !== 'send_back' && action !== 'reject') throw new Error(`Unsupported review action: ${String(action)}`)
  const reviewer = text(params.reviewer)
  if (!reviewer) throw new Error('A review needs the reviewer display name.')
  await recordReview({needId: needIdFrom(params), action, reviewer, note: text(params.note), effectKey: ctx.effectKey})
}

export const effectHandlers: Record<string, EffectHandler> = {
  [EFFECTS.triage]: triage,
  [EFFECTS.publish]: publish,
  [RECORD_EFFECTS.send_back]: record,
  [RECORD_EFFECTS.reject]: record,
}
