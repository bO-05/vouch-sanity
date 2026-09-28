/**
 * Demo reset: puts the dataset back to the seeded demo state (before the full production run, and
 * before judging). DRY RUN BY DEFAULT: it only lists what it would do. Pass --yes to do it.
 *
 * In one transaction, it deletes:
 * - Every request that isn't a seeded demo request, published or draft. Also the wrong variant of a
 *   seeded one: a published copy of a demo draft (need-demo-09 was approved on Day 4) or a draft of
 *   a published demo request.
 * - Every pledge that isn't a seeded demo pledge.
 * - Every proof, receipt scan (private), certificate and review (private).
 * - Every rate-limit counter (private).
 * - Every lifecycle engine document on the `prod` tag except the definition (so all instances).
 * - Decisions, by --decisions=<mode>:
 *   - `test` (default): all except the health checks (Day 1's first real Jev calls, no subject).
 *   - `all`: every decision.
 *   - `keep`: none.
 *
 * Then it runs `npm run seed` (resets the 10 demo requests and 5 demo pledges; the policy is kept)
 * and scripts/workflow-migrate.ts (01-08 adopted at `open`; 09-10 started at triage, where the Jev
 * triage waits for the desk's "Retry automatic steps"). Last, it checks the result.
 *
 * Before deleting, every document it deletes or the seed replaces is written to
 * web/.reset-backups/<time>.ndjson (git-ignored).
 *
 * Run from web/:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.local scripts/demo-reset.ts [--yes] [--decisions=test|all|keep]
 */
import {spawnSync} from 'node:child_process'
import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createClient} from '@sanity/client'
import {WORKFLOW_TAG} from '../src/workflows/need-lifecycle.ts'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const token = process.env.SANITY_API_WRITE_TOKEN
if (!projectId || !dataset || !token) {
  console.error('Run with --env-file=.env.local (needs the Sanity project id, dataset and write token).')
  process.exit(1)
}

const apply = process.argv.includes('--yes')
const decisionsArg = process.argv.find((arg) => arg.startsWith('--decisions='))?.split('=')[1] ?? 'test'
if (!['test', 'all', 'keep'].includes(decisionsArg)) {
  console.error(`--decisions must be test, all or keep (got "${decisionsArg}").`)
  process.exit(1)
}
const decisionsMode = decisionsArg as 'test' | 'all' | 'keep'

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(webDir, '..')

// Raw perspective (old API version): sees drafts and dotted (private) ids.
const raw = createClient({projectId, dataset, apiVersion: 'v2021-06-07', token, useCdn: false})
const anon = createClient({projectId, dataset, apiVersion: '2026-09-01', useCdn: false})

// The seeded ids, as in studio/scripts/seed.ts (NEEDS and PLEDGES). Keep the two in step.
const range = (prefix: string, n: number, from = 1) =>
  Array.from({length: n}, (_, i) => `${prefix}${String(from + i).padStart(2, '0')}`)
const DEMO_PUBLISHED = range('need-demo-', 8)
const DEMO_DRAFTS = range('need-demo-', 2, 9)
const DEMO_PLEDGES = range('pledge-demo-', 5)
const SEEDED_IDS = new Set([...DEMO_PUBLISHED, ...DEMO_DRAFTS.map((id) => `drafts.${id}`), ...DEMO_PLEDGES])

type Row = {_id: string; _type: string; label?: string | null; extra?: string | null}

async function plan() {
  const [needs, pledges, fulfilment, counters, engine, decisions] = await Promise.all([
    raw.fetch<Row[]>(`*[_type == "need"]{_id, _type, "label": title, "extra": stage} | order(_id asc)`),
    raw.fetch<Row[]>(
      `*[_type == "pledge"]{_id, _type, "label": donorDisplayName + " × " + string(quantity), "extra": need._ref} | order(_id asc)`,
    ),
    raw.fetch<Row[]>(
      `*[_type in ["proof", "receiptScan", "certificate", "review"] || _id in path("receipt-scan.**") || _id in path("review.**")]{
        _id, _type,
        "label": coalesce(verdict, action, sha256),
        "extra": coalesce(need._ref, subject._ref)
      } | order(_type asc, _id asc)`,
    ),
    raw.fetch<Row[]>(`*[_type == "rateLimit" || _id in path("ratelimit.**")]{_id, _type} | order(_id asc)`),
    raw.fetch<Row[]>(
      `*[_id in path($enginePath) && _type != "sanity.workflow.definition"]{_id, _type, "label": currentStage} | order(_id asc)`,
      {enginePath: `${WORKFLOW_TAG}.**`},
    ),
    raw.fetch<Row[]>(
      `*[_type == "decision"]{_id, _type, "label": kind + ": " + coalesce(outcome, "?"), "extra": coalesce(subject._ref, "(no subject)"), createdAt}
        | order(createdAt asc)`,
    ),
  ])
  const deletedDecisions =
    decisionsMode === 'keep' ? [] : decisionsMode === 'all' ? decisions : decisions.filter((d) => !d.label?.startsWith('health_check'))
  return {
    groups: [
      {title: 'Requests that are not seeded demo requests (or the wrong draft/published copy of one)', rows: needs.filter((n) => !SEEDED_IDS.has(n._id))},
      {title: 'Pledges that are not seeded demo pledges', rows: pledges.filter((p) => !SEEDED_IDS.has(p._id))},
      {title: 'Proofs, receipt scans, certificates and reviews', rows: fulfilment},
      {title: 'Rate-limit counters', rows: counters},
      {title: `Lifecycle engine documents on tag "${WORKFLOW_TAG}" (the definition stays)`, rows: engine},
      {title: `Decisions (--decisions=${decisionsMode})`, rows: deletedDecisions},
    ],
    keptDecisions: decisions.filter((d) => !deletedDecisions.includes(d)),
    replacedBySeed: needs.filter((n) => SEEDED_IDS.has(n._id)).concat(pledges.filter((p) => SEEDED_IDS.has(p._id))),
  }
}

function print(rows: Row[]) {
  for (const row of rows) {
    const details = [row.label, row.extra].filter(Boolean).join(' · ')
    console.log(`    ${row._id.padEnd(58)} ${details}`)
  }
}

const {groups, keptDecisions, replacedBySeed} = await plan()
const toDelete = groups.flatMap((g) => g.rows)

console.log(apply ? 'DEMO RESET (applying)\n' : 'DEMO RESET: DRY RUN (nothing is changed; pass --yes to apply)\n')
console.log(`${apply ? 'Deleting' : 'Would delete'} ${toDelete.length} documents:`)
for (const group of groups) {
  console.log(`\n  ${group.title}: ${group.rows.length}`)
  print(group.rows)
}
console.log(`\nKept decisions: ${keptDecisions.length}`)
print(keptDecisions)
console.log(`\nReset by the seed afterwards (createOrReplace): ${replacedBySeed.length}`)
print(replacedBySeed)
console.log(`
Then:
  1. npm run seed: categories, catalog and the 10 demo requests + 5 demo pledges (policy kept as edited).
  2. scripts/workflow-migrate.ts: ${DEMO_PUBLISHED.length} published demo requests adopted at "open"; ${DEMO_DRAFTS.join(', ')} started at triage
     (their Jev triage waits for the desk's "Retry automatic steps").
  3. Checks: anonymous counts, the pledge invariant, instance stages.`)

if (!apply) process.exit(0)

// ---------------------------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------------------------

const backupIds = [...toDelete, ...replacedBySeed].map((row) => row._id)
const backup = await raw.fetch<Array<Record<string, unknown>>>(`*[_id in $ids]`, {ids: backupIds})
const backupDir = join(webDir, '.reset-backups')
mkdirSync(backupDir, {recursive: true})
const backupFile = join(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`)
writeFileSync(backupFile, backup.map((doc) => JSON.stringify(doc)).join('\n') + '\n')
console.log(`\nBackup: ${backup.length} documents → ${backupFile}`)

if (toDelete.length > 0) {
  // One transaction, so strong references (pledge/proof/certificate → request) never dangle midway.
  let tx = raw.transaction()
  for (const row of toDelete) tx = tx.delete(row._id)
  const result = await tx.commit({visibility: 'sync'})
  console.log(`Deleted ${result.results.length} documents (transaction ${result.transactionId}).`)
}

function run(label: string, command: string, args: string[], cwd: string) {
  console.log(`\n${label}`)
  const result = spawnSync(command, args, {cwd, stdio: 'inherit', shell: process.platform === 'win32'})
  if (result.status !== 0) {
    console.error(`${label} failed (exit ${result.status ?? result.signal}). Stopping; the backup is in ${backupFile}.`)
    process.exit(1)
  }
}

run('Seeding (npm run seed)…', 'npm', ['run', 'seed'], repoDir)
run(
  'Adopting the demo requests into the lifecycle (workflow-migrate.ts)…',
  process.platform === 'win32' ? `"${process.execPath}"` : process.execPath, // the shell needs the quotes
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--env-file=.env.local', 'scripts/workflow-migrate.ts'],
  webDir,
)

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

const [publicCounts, privateCounts, invariant] = await Promise.all([
  anon.fetch<Record<string, number>>(`{
    "published requests": count(*[_type == "need"]),
    "pledges": count(*[_type == "pledge"]),
    "proofs": count(*[_type == "proof"]),
    "certificates": count(*[_type == "certificate"]),
    "drafts": count(*[_id in path("drafts.**")]),
    "reviews": count(*[_type == "review"]),
    "receipt scans": count(*[_type == "receiptScan"]),
    "rate-limit counters": count(*[_type == "rateLimit"])
  }`),
  raw.fetch<{drafts: string[]; instances: Array<{_id: string; currentStage: string}>}>(
    `{
      "drafts": *[_type == "need" && _id in path("drafts.**")]._id,
      "instances": *[_type == "sanity.workflow.instance" && tag == $workflowTag]{_id, currentStage} | order(_id asc)
    }`,
    {workflowTag: WORKFLOW_TAG},
  ),
  anon.fetch<unknown[]>(
    `*[_type == 'need']{_id, 'bad': items[coalesce(pledgedQty, 0) != coalesce(math::sum(*[_type == 'pledge' && status != 'cancelled' && need._ref == ^.^._id && itemKey == ^._key].quantity), 0)]._key}[count(bad) > 0]`,
  ),
])

const expected: Record<string, number> = {
  'published requests': DEMO_PUBLISHED.length,
  pledges: DEMO_PLEDGES.length,
  proofs: 0,
  certificates: 0,
  drafts: 0,
  reviews: 0,
  'receipt scans': 0,
  'rate-limit counters': 0,
}
const stages = privateCounts.instances.reduce<Record<string, number>>((acc, i) => {
  acc[i.currentStage] = (acc[i.currentStage] ?? 0) + 1
  return acc
}, {})
const checks: Array<[string, boolean, string]> = [
  ...Object.entries(expected).map(
    ([name, want]): [string, boolean, string] => [`anonymous ${name}`, publicCounts[name] === want, `${publicCounts[name]} (want ${want})`],
  ),
  ['private request drafts', privateCounts.drafts.length === DEMO_DRAFTS.length, privateCounts.drafts.join(', ')],
  [
    'lifecycle instances',
    privateCounts.instances.length === DEMO_PUBLISHED.length + DEMO_DRAFTS.length &&
      stages.open === DEMO_PUBLISHED.length &&
      stages.triage === DEMO_DRAFTS.length,
    Object.entries(stages).map(([stage, n]) => `${n} at ${stage}`).join(', '),
  ],
  ['pledge invariant', invariant.length === 0, invariant.length === 0 ? '[]' : JSON.stringify(invariant)],
]
console.log('\nChecks:')
for (const [name, ok, detail] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(32)} ${detail}`)
if (checks.some(([, ok]) => !ok)) process.exit(1)
