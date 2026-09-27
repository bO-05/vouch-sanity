/**
 * Day 4 probe, part 2: WHY are engine calls slow? Counts the HTTP requests each verb makes
 * (by wrapping node:https) and times one plain round trip for comparison. Tag `dev`, stub handlers,
 * cleans up after itself. Run from web/:  node --env-file=.env.local scripts/workflow-probe-requests.ts
 */
import https from 'node:https'
import {createClient} from '@sanity/client'
import {createEngine, ENGINE_API_VERSION, refDataset, type EffectHandler} from '@sanity/workflow-engine'
import {EFFECTS, NEED_LIFECYCLE, needLifecycle, RECORD_EFFECTS} from '../src/workflows/need-lifecycle.ts'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!
const token = process.env.SANITY_API_WRITE_TOKEN!

let log: string[] = []
const originalRequest = https.request
// @ts-expect-error: wrapping for measurement only
https.request = function (...args: Parameters<typeof https.request>) {
  const [first, second] = args
  const options = (typeof first === 'object' && !(first instanceof URL) ? first : second) as https.RequestOptions | undefined
  const url = first instanceof URL ? first : typeof first === 'string' ? new URL(first) : null
  const method = options?.method ?? 'GET'
  const path = url ? url.pathname + url.search : (options?.path ?? '?')
  log.push(`${method} ${decodeURIComponent(path).replace(/\s+/g, ' ').slice(0, 150)}`)
  return originalRequest.apply(this, args as never)
}

const TAG = 'dev'
const client = createClient({projectId, dataset, apiVersion: ENGINE_API_VERSION, token, useCdn: false})
const raw = client.withConfig({apiVersion: 'v2021-06-07'})

const noop: EffectHandler = async () => {}
const handlers: Record<string, EffectHandler> = {
  [EFFECTS.triage]: async () => ({outputs: {route: 'review'}}),
  [EFFECTS.publish]: async () => ({outputs: {published: true}}),
  ...Object.fromEntries(Object.values(RECORD_EFFECTS).map((name) => [name, noop])),
}
const engine = createEngine({client, workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`}, tag: TAG, effects: {handlers}})

async function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
  log = []
  const start = performance.now()
  const result = await fn()
  const ms = Math.round(performance.now() - start)
  console.log(`\n${label}: ${ms} ms, ${log.length} HTTP requests`)
  const counts = new Map<string, number>()
  for (const line of log) {
    const key = line.replace(/\?.*$/, '').replace(/(wf-instance|need-probe)[\w.-]*/g, '$1…')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [key, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(count).padStart(3)} × ${key}`)
  return result
}

const id = `need-probe-r-${Math.random().toString(36).slice(2, 8)}`
try {
  await measure('one plain fetch (round trip)', () => client.fetch('1'))
  await measure('deployDefinitions', () => engine.deployDefinitions({expectedMinReaderModel: 10, definitions: [needLifecycle]}))
  await raw.create({_id: `drafts.${id}`, _type: 'need', title: 'Workflow probe r', stage: 'triage', isDemo: true})
  const started = await measure('startInstance', () =>
    engine.startInstance({
      definition: NEED_LIFECYCLE,
      instanceId: `${TAG}.wf-instance.${id.replace(/[^a-z0-9]/gi, '')}`,
      initialFields: [{type: 'subject', name: 'subject', value: refDataset({projectId, dataset, documentId: id, type: 'need'})}],
    }),
  )
  const instanceId = started.instance._id
  await measure('drainEffects (triage → review)', () => engine.drainEffects({instanceId}))
  await measure('fireAction approve', () =>
    engine.fireAction({instanceId, activity: 'verify', action: 'approve', params: {reviewer: 'Probe', rev: 'x'}}),
  )
  await measure('drainEffects (record → publishing → publish → open)', () => engine.drainEffects({instanceId}))
  await measure('getInstance', () => engine.getInstance({instanceId}))
} finally {
  const engineIds = await raw.fetch<string[]>(`*[_id in path("${TAG}.**")]._id`)
  let tx = raw.transaction().delete(`drafts.${id}`)
  for (const engineId of engineIds) tx = tx.delete(engineId)
  await tx.commit()
  console.log(`\nCleanup: deleted ${engineIds.length + 1} documents.`)
}
