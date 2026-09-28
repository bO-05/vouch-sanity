/**
 * Labels documents the Vouch team wrote while testing (requests, pledges, proofs) as demo data:
 * sets `isDemo: true`, so the app shows the "Demo" chip ("written by the Vouch team, not a real
 * person"). Their trails stay as they are: they went through the real pipeline.
 *
 * Only pass ids you wrote yourself; never label a real visitor's request.
 * Run from web/:  node --env-file=.env.local scripts/label-demo.ts <id> [<id> …] [--dry-run]
 */
import {createClient} from '@sanity/client'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const token = process.env.SANITY_API_WRITE_TOKEN
if (!projectId || !dataset || !token) {
  console.error('Run with --env-file=.env.local (needs the Sanity project id, dataset and write token).')
  process.exit(1)
}
const dryRun = process.argv.includes('--dry-run')
const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
if (ids.length === 0) {
  console.error('Pass the ids to label.')
  process.exit(1)
}

// Raw perspective: sees drafts.
const raw = createClient({projectId, dataset, apiVersion: 'v2021-06-07', token, useCdn: false})
type Doc = {_id: string; _type: string; _rev: string; isDemo?: boolean | null; label?: string | null}
const docs = await raw.fetch<Doc[]>(
  `*[_id in $ids && _type in ["need", "pledge", "proof"]]{_id, _type, _rev, isDemo, "label": coalesce(title, donorDisplayName, uploaderDisplayName)}`,
  {ids},
)
const missing = ids.filter((id) => !docs.some((d) => d._id === id))
if (missing.length > 0) {
  console.error(`Not found (or not a request, pledge or proof): ${missing.join(', ')}`)
  process.exit(1)
}
for (const doc of docs) console.log(`${dryRun ? 'would label' : 'label'}  ${doc._type.padEnd(7)} ${doc._id}  ${doc.label ?? ''}${doc.isDemo ? ' (already demo)' : ''}`)
if (dryRun) process.exit(0)

let tx = raw.transaction()
for (const doc of docs.filter((d) => !d.isDemo)) tx = tx.patch(doc._id, (p) => p.ifRevisionId(doc._rev).set({isDemo: true}))
const result = await tx.commit()
console.log(`Labeled ${result.results.length} documents as demo.`)
