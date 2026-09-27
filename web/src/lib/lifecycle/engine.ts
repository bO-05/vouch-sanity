import 'server-only'

import {
  createEngine,
  ENGINE_API_VERSION,
  InstanceNotFoundError,
  refDataset,
  type DrainEffectsResult,
  type Engine,
  type WorkflowInstance,
} from '@sanity/workflow-engine'
import {createClient} from 'next-sanity'
import {dataset, projectId} from '@/lib/sanity/config'
import {getWriteClient} from '@/lib/sanity/write-client'
import {lifecycleInstanceId, NEED_LIFECYCLE, WORKFLOW_TAG} from '@/workflows/need-lifecycle'
import {effectHandlers} from './effects'

export {lifecycleInstanceId, WORKFLOW_TAG}

/**
 * Vouch's runtime for the Sanity Workflows engine. The engine is a library, not a service: nothing
 * moves unless this server calls it. We start an instance per request, fire the human actions, and
 * drain the queued effects (Jev triage, publishing, recording reviews) right away.
 *
 * Engine documents (`prod.need-lifecycle.v1`, `prod.wf-instance.*`) have dotted ids, so the public
 * dataset never exposes them.
 */

let cached: Engine | null = null

export function getEngine(): Engine {
  if (cached) return cached
  const token = process.env.SANITY_API_WRITE_TOKEN?.trim()
  if (!token) throw new Error('SANITY_API_WRITE_TOKEN is not configured on this server.')
  cached = createEngine({
    client: createClient({projectId, dataset, apiVersion: ENGINE_API_VERSION, token, useCdn: false}),
    workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`},
    tag: WORKFLOW_TAG,
    // Longer than the slowest handler (a Jev call plus two Sanity writes), shorter than a function timeout.
    effects: {handlers: effectHandlers, leaseMs: 120_000},
  })
  return cached
}

export type AdoptStage = 'review' | 'open'

/** Starts the lifecycle for a request. Idempotent: the instance id is the start's idempotency key. */
export async function startLifecycle(needId: string, adoptAt?: AdoptStage): Promise<WorkflowInstance> {
  const result = await getEngine().startInstance({
    definition: NEED_LIFECYCLE,
    instanceId: lifecycleInstanceId(needId),
    initialFields: [
      {type: 'subject', name: 'subject', value: refDataset({projectId, dataset, documentId: needId, type: 'need'})},
      ...(adoptAt ? [{type: 'string' as const, name: 'adoptAt', value: adoptAt}] : []),
    ],
  })
  return result.instance
}

/** Runs every queued effect (and the ones their completions queue) until the lifecycle waits again. */
export async function drainLifecycle(needId: string): Promise<{instance: WorkflowInstance; drain: DrainEffectsResult}> {
  const engine = getEngine()
  const instanceId = lifecycleInstanceId(needId)
  const drain = await engine.drainEffects({instanceId})
  return {instance: await engine.getInstance({instanceId}), drain}
}

export async function fireLifecycle(
  needId: string,
  activity: string,
  action: string,
  params?: Record<string, unknown>,
): Promise<WorkflowInstance> {
  const result = await getEngine().fireAction({instanceId: lifecycleInstanceId(needId), activity, action, params})
  return result.instance
}

export async function readLifecycle(needId: string): Promise<WorkflowInstance | null> {
  try {
    return await getEngine().getInstance({instanceId: lifecycleInstanceId(needId)})
  } catch (error) {
    if (error instanceof InstanceNotFoundError) return null
    throw error
  }
}

/** A compact, display-safe view of an instance (no params, no notes). */
export type LifecycleView = {
  instanceId: string
  stage: string
  completed: boolean
  /** `exitedBy`: the transition that left the stage (e.g. `passed`, `adopted-open`), from the instance history. */
  stages: Array<{name: string; enteredAt: string; exitedAt: string | null; exitedBy: string | null}>
  pending: Array<{name: string; queuedAt: string; claimed: boolean}>
  failed: Array<{name: string; ranAt: string; error: string | null}>
}

type InstanceRow = Pick<WorkflowInstance, '_id' | 'currentStage' | 'completedAt' | 'stages' | 'pendingEffects' | 'effectHistory'> & {
  history: Array<{_type: string; stage?: string; at?: string; transition?: string}>
}

export function viewLifecycle(instance: InstanceRow): LifecycleView {
  const currentEntry = instance.stages.at(-1)?.enteredAt ?? ''
  const entered = instance.history.filter((event) => event._type === 'stageEntered')
  return {
    instanceId: instance._id,
    stage: instance.currentStage,
    completed: Boolean(instance.completedAt),
    stages: instance.stages.map((entry, index) => {
      const next = instance.stages[index + 1]
      const exit = next ? entered.find((event) => event.stage === next.name && event.at === next.enteredAt) : undefined
      return {name: entry.name, enteredAt: entry.enteredAt, exitedAt: entry.exitedAt ?? null, exitedBy: exit?.transition ?? null}
    }),
    pending: instance.pendingEffects.map((effect) => ({name: effect.name, queuedAt: effect.queuedAt, claimed: Boolean(effect.claim)})),
    // Only failures in the current stage visit matter for "what's wrong now".
    failed: instance.effectHistory
      .filter((run) => run.status === 'failed' && run.ranAt >= currentEntry)
      .map((run) => ({name: run.name, ranAt: run.ranAt, error: run.error?.message ?? run.detail ?? null})),
  }
}

/** Many instances in one query (the desk). Missing ids simply have no entry. */
export async function readLifecycles(needIds: string[]): Promise<Map<string, LifecycleView>> {
  if (needIds.length === 0) return new Map()
  const ids = needIds.map((needId) => lifecycleInstanceId(needId))
  const rows = await getWriteClient().fetch<InstanceRow[]>(
    `*[_type == "sanity.workflow.instance" && _id in $ids]{_id, currentStage, completedAt, stages[]{name, enteredAt, exitedAt}, pendingEffects[]{name, queuedAt, claim}, effectHistory[]{name, ranAt, status, detail, error}, "history": history[_type == "stageEntered"]{_type, stage, at, transition}}`,
    {ids},
    {tag: 'vouch.lifecycle.read', timeout: 15_000},
  )
  const byInstance = new Map(rows.map((row) => [row._id, row]))
  const views = new Map<string, LifecycleView>()
  for (const needId of needIds) {
    const row = byInstance.get(lifecycleInstanceId(needId))
    if (row) {
      views.set(
        needId,
        viewLifecycle({
          ...row,
          stages: row.stages ?? [],
          pendingEffects: row.pendingEffects ?? [],
          effectHistory: row.effectHistory ?? [],
          history: row.history ?? [],
        }),
      )
    }
  }
  return views
}
