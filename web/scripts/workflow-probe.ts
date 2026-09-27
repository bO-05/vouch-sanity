/**
 * Day 4 timebox probe: does the Sanity Workflows engine (0.35.0) carry Vouch's lifecycle?
 * Uses the REAL definition (src/workflows/need-lifecycle.ts) under a throwaway `dev` tag, with stub
 * effect handlers (no Jev calls, no publishing), then deletes everything it created.
 *
 * Run from web/:  node --env-file=.env.local scripts/workflow-probe.ts
 */
import {createClient} from '@sanity/client'
import {createEngine, ENGINE_API_VERSION, extractDocumentId, refDataset, type EffectHandler} from '@sanity/workflow-engine'
import {EFFECTS, NEED_LIFECYCLE, needLifecycle, RECORD_EFFECTS} from '../src/workflows/need-lifecycle.ts'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!
const token = process.env.SANITY_API_WRITE_TOKEN
if (!projectId || !dataset || !token) throw new Error('Run with --env-file=.env.local')

const TAG = 'dev'
const client = createClient({projectId, dataset, apiVersion: ENGINE_API_VERSION, token, useCdn: false})
const raw = client.withConfig({apiVersion: 'v2021-06-07'})
const calls: string[] = []
const routes = new Map<string, string>()

const handlers: Record<string, EffectHandler> = {
  [EFFECTS.triage]: async (params, ctx) => {
    const id = extractDocumentId(String(params.subject))
    calls.push(`${EFFECTS.triage}(${id}) key=${ctx.effectKey}`)
    const draft = await raw.getDocument(`drafts.${id}`)
    return {
      outputs: {route: routes.get(id) ?? 'publish'},
      ops: [{type: 'field.set', target: {scope: 'workflow', field: 'publishRev'}, value: {type: 'literal', value: draft?._rev ?? 'none'}}],
    }
  },
  [EFFECTS.publish]: async (params) => {
    calls.push(`${EFFECTS.publish}(${extractDocumentId(String(params.subject))}, rev=${String(params.rev)})`)
    return {outputs: {published: true}}
  },
  ...Object.fromEntries(
    Object.values(RECORD_EFFECTS).map((name) => [
      name,
      (async (params) => {
        calls.push(`${name}(${JSON.stringify(params)})`)
      }) satisfies EffectHandler,
    ]),
  ),
}

const engine = createEngine({
  client,
  workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`},
  tag: TAG,
  effects: {handlers},
})

const t = () => performance.now()
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = t()
  const result = await fn()
  console.log(`  ${label}: ${Math.round(t() - start)} ms`)
  return result
}

const created: string[] = []
async function probeNeed(label: string) {
  const id = `need-probe-${label}-${Math.random().toString(36).slice(2, 8)}`
  await raw.create({_id: `drafts.${id}`, _type: 'need', title: `Workflow probe ${label}`, stage: 'triage', isDemo: true})
  created.push(`drafts.${id}`)
  return id
}
const subjectOf = (id: string) => ({type: 'subject' as const, name: 'subject', value: refDataset({projectId, dataset, documentId: id, type: 'need'})})
const instanceIdFor = (id: string) => `${TAG}.wf-instance.${id.replace(/[^a-z0-9]/gi, '')}`

try {
  console.log('Deploy definition (tag dev):')
  const deployed = await timed('deployDefinitions', () => engine.deployDefinitions({expectedMinReaderModel: 10, definitions: [needLifecycle]}))
  console.log('  ', JSON.stringify(deployed.results))

  console.log('\nA. Clean request: triage → publishing → open in one drain')
  const a = await probeNeed('a')
  const startA = await timed('startInstance', () => engine.startInstance({definition: NEED_LIFECYCLE, instanceId: instanceIdFor(a), initialFields: [subjectOf(a)]}))
  console.log(`   instance ${startA.instance._id} at ${startA.instance.currentStage}, pending ${startA.instance.pendingEffects.length}`)
  const drainA = await timed('drainEffects', () => engine.drainEffects({instanceId: startA.instance._id}))
  console.log(`   drained ${drainA.drained.length}, failed ${drainA.failed.length}, skipped ${drainA.skipped.length}, lost ${drainA.lost.length}`)
  const afterA = await engine.getInstance({instanceId: startA.instance._id})
  console.log(`   now at ${afterA.currentStage}; publishRev=${JSON.stringify(afterA.fields.find((f) => f.name === 'publishRev'))}`)

  console.log('\nB. Flagged: review → send back → resubmit → triage → review → reject (terminal)')
  const b = await probeNeed('b')
  routes.set(b, 'review')
  const startB = await engine.startInstance({definition: NEED_LIFECYCLE, instanceId: instanceIdFor(b), initialFields: [subjectOf(b)]})
  await engine.drainEffects({instanceId: startB.instance._id})
  let inst = await engine.getInstance({instanceId: startB.instance._id})
  console.log(`   after triage: ${inst.currentStage}`)
  await timed('fireAction send-back', () =>
    engine.fireAction({instanceId: inst._id, activity: 'verify', action: 'send-back', params: {reviewer: 'Probe', note: 'Which size?'}}),
  )
  await timed('drainEffects', () => engine.drainEffects({instanceId: inst._id}))
  inst = await engine.getInstance({instanceId: inst._id})
  console.log(`   after send back: ${inst.currentStage}`)
  try {
    await engine.fireAction({instanceId: inst._id, activity: 'verify', action: 'approve', params: {reviewer: 'X', rev: 'r'}})
    console.log('   !! approve in sent_back was accepted')
  } catch (error) {
    console.log(`   approve in sent_back refused: ${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 140)}`)
  }
  await engine.fireAction({instanceId: inst._id, activity: 'revise', action: 'resubmit'})
  await engine.drainEffects({instanceId: inst._id})
  inst = await engine.getInstance({instanceId: inst._id})
  console.log(`   after resubmit + drain: ${inst.currentStage} (triage calls so far: ${calls.filter((c) => c.includes(b) && c.startsWith(EFFECTS.triage)).length})`)
  await engine.fireAction({instanceId: inst._id, activity: 'verify', action: 'reject', params: {reviewer: 'Probe', note: 'Not material aid'}})
  try {
    await engine.fireAction({instanceId: inst._id, activity: 'verify', action: 'approve', params: {reviewer: 'X', rev: 'r'}})
    console.log('   !! a second decision was accepted')
  } catch (error) {
    console.log(`   second decision refused: ${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 140)}`)
  }
  await engine.drainEffects({instanceId: inst._id})
  inst = await engine.getInstance({instanceId: inst._id})
  console.log(`   after reject + drain: ${inst.currentStage}, completedAt=${inst.completedAt ?? '-'}`)

  console.log('\nC. Flagged then approved: review → publishing → open')
  const c = await probeNeed('c')
  routes.set(c, 'review')
  const startC = await engine.startInstance({definition: NEED_LIFECYCLE, instanceId: instanceIdFor(c), initialFields: [subjectOf(c)]})
  await engine.drainEffects({instanceId: startC.instance._id})
  await timed('fireAction approve', () =>
    engine.fireAction({instanceId: startC.instance._id, activity: 'verify', action: 'approve', params: {reviewer: 'Probe', rev: 'rev-seen-by-verifier'}}),
  )
  await timed('drainEffects', () => engine.drainEffects({instanceId: startC.instance._id}))
  inst = await engine.getInstance({instanceId: startC.instance._id})
  console.log(`   after approve: ${inst.currentStage}`)

  console.log('\nHandler calls:')
  for (const call of calls) console.log(`   ${call}`)

  console.log('\nPrivacy: engine documents in the public dataset')
  const engineDocs = await raw.fetch<Array<{_id: string; _type: string}>>(`*[_id in path("${TAG}.**")]{_id, _type}`)
  console.log(`   with token: ${engineDocs.length} docs, types ${[...new Set(engineDocs.map((d) => d._type))].join(', ')}`)
  console.log(`   sample ids: ${engineDocs.slice(0, 4).map((d) => d._id).join(' | ')}`)
  const anon = createClient({projectId, dataset, apiVersion: '2026-09-01', useCdn: false})
  const visible = await anon.fetch<number>(`count(*[_id in $ids])`, {ids: engineDocs.map((d) => d._id)})
  const anyEngineType = await anon.fetch<number>(`count(*[_type in $types])`, {types: [...new Set(engineDocs.map((d) => d._type))]})
  console.log(`   anonymous: ${visible} of them visible by id, ${anyEngineType} visible by type`)
  const dotted = `review.probe-${Math.random().toString(36).slice(2, 8)}`
  await raw.create({_id: dotted, _type: 'review', action: 'approve', reviewerName: 'Probe'})
  created.push(dotted)
  console.log(`   a dotted-id review doc (${dotted}) visible anonymously: ${await anon.fetch<number>('count(*[_id == $id])', {id: dotted})}`)
} finally {
  const engineIds = await raw.fetch<string[]>(`*[_id in path("${TAG}.**")]._id`)
  const all = [...created, ...engineIds]
  if (all.length > 0) {
    let tx = raw.transaction()
    for (const id of all) tx = tx.delete(id)
    await tx.commit()
  }
  console.log(`\nCleanup: deleted ${all.length} documents (${created.length} probe docs + ${engineIds.length} engine docs).`)
}
