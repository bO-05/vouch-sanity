import 'server-only'

import {extractDocumentId, type EffectHandler} from '@sanity/workflow-engine'
import {EFFECTS, RECORD_EFFECTS, type RecordInput} from '@/workflows/need-lifecycle'
import {issueCertificate, recordProofReview, runProofMatch} from './proof-step'
import {publishDraft, recordReview} from './publish-step'
import {runTriage} from './triage-step'

/**
 * Effect handlers for the `need-lifecycle` workflow. The definition names the effects; this is the
 * code that runs them when Vouch's server drains the queue. Handlers may run more than once for the
 * same queued effect (at-least-once delivery), so every write is idempotent or revision-guarded.
 */

function needIdFrom(params: Record<string, unknown>): string {
  if (typeof params.subject !== 'string') throw new Error('The effect has no subject reference.')
  const id = extractDocumentId(params.subject)
  if (!/^need-[\w-]+$/.test(id)) throw new Error(`Unexpected subject id: ${id}`)
  return id
}

function proofIdFrom(params: Record<string, unknown>): string {
  const id = params.proof
  if (typeof id !== 'string' || !/^proof-[\w-]+$/.test(id)) throw new Error('The effect has no receipt (proof) id.')
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

const proofMatch: EffectHandler = async (params) => {
  const result = await runProofMatch(needIdFrom(params), proofIdFrom(params))
  return {outputs: {verdict: result.verdict}}
}

const certificate: EffectHandler = async (params, ctx) => {
  const result = await issueCertificate(needIdFrom(params), proofIdFrom(params))
  ctx.log(`Issued ${result.certificateId}`)
}

const record: EffectHandler = async (params, ctx) => {
  const {action, target} = params as Partial<RecordInput>
  const reviewer = text(params.reviewer)
  if (!reviewer) throw new Error('A review needs the reviewer display name.')
  const needId = needIdFrom(params)
  if (target === 'proof') {
    if (action !== 'approve' && action !== 'reject') throw new Error(`Unsupported receipt decision: ${String(action)}`)
    await recordProofReview({needId, proofId: proofIdFrom(params), action, reviewer, note: text(params.note), effectKey: ctx.effectKey})
    return
  }
  if (action !== 'send_back' && action !== 'reject') throw new Error(`Unsupported review action: ${String(action)}`)
  await recordReview({needId, action, reviewer, note: text(params.note), effectKey: ctx.effectKey})
}

export const effectHandlers: Record<string, EffectHandler> = {
  [EFFECTS.triage]: triage,
  [EFFECTS.publish]: publish,
  [EFFECTS.proof]: proofMatch,
  [EFFECTS.certificate]: certificate,
  [RECORD_EFFECTS.send_back]: record,
  [RECORD_EFFECTS.reject]: record,
  [RECORD_EFFECTS.accept_proof]: record,
  [RECORD_EFFECTS.decline_proof]: record,
}
