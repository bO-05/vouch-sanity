/**
 * Deploy the request lifecycle (src/workflows/need-lifecycle.ts) to Sanity Workflows, with the same
 * engine version the app runs (@sanity/workflow-engine 0.35.0). This is the programmatic equivalent of
 * `sanity-workflows deploy`: the CLI bundled with @sanity/cli is 0.32, and @sanity/workflow-cli 0.35
 * needs TypeScript 6+ through a peer dependency.
 *
 * Idempotent: identical content keeps the deployed version; a changed definition becomes the next
 * version (instances already running stay pinned to the version they started on).
 *
 * Run from web/:  node --env-file=.env.local scripts/workflow-deploy.ts [--tag prod]
 */
import {createClient} from '@sanity/client'
import {createEngine, ENGINE_API_VERSION} from '@sanity/workflow-engine'
import {needLifecycle, WORKFLOW_TAG} from '../src/workflows/need-lifecycle.ts'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const token = process.env.SANITY_API_WRITE_TOKEN
if (!projectId || !dataset || !token) {
  console.error('Run with --env-file=.env.local (needs the Sanity project id, dataset and write token).')
  process.exit(1)
}

const tagIndex = process.argv.indexOf('--tag')
const tag = tagIndex > 0 ? process.argv[tagIndex + 1] : WORKFLOW_TAG

const engine = createEngine({
  client: createClient({projectId, dataset, apiVersion: ENGINE_API_VERSION, token, useCdn: false}),
  workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`},
  tag,
})

const started = performance.now()
const result = await engine.deployDefinitions({expectedMinReaderModel: 10, definitions: [needLifecycle]})
console.log(`Deployed to ${projectId}.${dataset}, tag "${tag}" in ${Math.round(performance.now() - started)} ms:`)
for (const entry of result.results) console.log(`  ${JSON.stringify(entry)}`)
