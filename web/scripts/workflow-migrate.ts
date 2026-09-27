/**
 * Adopt the requests that existed before the lifecycle into it. Idempotent: requests that already
 * have an instance are skipped.
 *
 * - Published requests (verified; stage `open`) → adopted at `open` (the `adopted-open` transition).
 * - Private drafts in `review` (triaged on Day 3, waiting for a verifier) → adopted at `review`.
 * - Private drafts that were never checked (seeded in `intake`) → moved to `triage` and started
 *   normally. Their `jev-triage` effect waits in the queue; the desk shows them as stuck and a
 *   verifier's "Retry automatic steps" runs the real Jev triage in the app.
 *
 * Adoption queues no effects: the instance history records `adoptAt`, nothing pretends Jev ran.
 * Run from web/:  node --env-file=.env.local scripts/workflow-migrate.ts [--dry-run]
 */
import {createClient} from '@sanity/client'
import {createEngine, ENGINE_API_VERSION, refDataset} from '@sanity/workflow-engine'
import {lifecycleInstanceId, NEED_LIFECYCLE, WORKFLOW_TAG} from '../src/workflows/need-lifecycle.ts'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const token = process.env.SANITY_API_WRITE_TOKEN
if (!projectId || !dataset || !token) {
  console.error('Run with --env-file=.env.local (needs the Sanity project id, dataset and write token).')
  process.exit(1)
}
const dryRun = process.argv.includes('--dry-run')

const client = createClient({projectId, dataset, apiVersion: ENGINE_API_VERSION, token, useCdn: false})
const raw = client.withConfig({apiVersion: 'v2021-06-07'}) // raw perspective: sees drafts
const engine = createEngine({client, workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`}, tag: WORKFLOW_TAG})

type Need = {_id: string; _rev: string; stage: string; title: string}
const needs = await raw.fetch<Need[]>(`*[_type == "need"]{_id, _rev, stage, title} | order(_id asc)`)
const existing = new Set(
  // (`tag` is a reserved query-parameter name in @sanity/client, hence $workflowTag.)
  await raw.fetch<string[]>(`*[_type == "sanity.workflow.instance" && tag == $workflowTag]._id`, {workflowTag: WORKFLOW_TAG}),
)

for (const need of needs) {
  const isDraft = need._id.startsWith('drafts.')
  const needId = need._id.replace(/^drafts\./, '')
  const instanceId = lifecycleInstanceId(needId)
  if (existing.has(instanceId)) {
    console.log(`skip   ${needId} (already has ${instanceId})`)
    continue
  }
  const adoptAt = !isDraft ? 'open' : need.stage === 'review' ? 'review' : null
  if (isDraft && !adoptAt && need.stage !== 'intake' && need.stage !== 'triage') {
    console.log(`skip   ${needId}: draft in stage "${need.stage}" (not adoptable)`)
    continue
  }
  const plan = adoptAt ? `adopt at ${adoptAt}` : 'start at triage (Jev triage waits for a drain)'
  console.log(`${dryRun ? 'would ' : ''}${plan.padEnd(46)} ${needId}  "${need.title}"`)
  if (dryRun) continue

  if (isDraft && !adoptAt && need.stage === 'intake') {
    await raw.patch(need._id).ifRevisionId(need._rev).set({stage: 'triage'}).commit()
  }
  const started = performance.now()
  const result = await engine.startInstance({
    definition: NEED_LIFECYCLE,
    instanceId,
    initialFields: [
      {type: 'subject', name: 'subject', value: refDataset({projectId, dataset, documentId: needId, type: 'need'})},
      ...(adoptAt ? [{type: 'string' as const, name: 'adoptAt', value: adoptAt}] : []),
    ],
  })
  console.log(`       → ${result.instance._id} at ${result.instance.currentStage} (${Math.round(performance.now() - started)} ms)`)
}
