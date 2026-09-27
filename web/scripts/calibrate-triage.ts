/**
 * Calibrate the triage thresholds on synthetic pleas (scripts/calibration-pleas.ts).
 *
 * It uses the exact question builder and gate the app uses (src/lib/triage.ts), the live policy and
 * categories from Sanity (published, read anonymously) and real Jev calls. Only the synthetic pleas
 * are sent, never a real person's words, and nothing is written to Sanity.
 *
 * Run from web/:  node --env-file=.env.local scripts/calibrate-triage.ts
 * Writes ../handoff/calibration/triage-<timestamp>.json and prints a summary.
 */
import {mkdirSync, writeFileSync} from 'node:fs'
import {TypeSafeClient, type Questions, type SystemOneResult} from '@typesafe-ai/sdk'
import {
  buildTriageQuestions,
  gateTriage,
  parsePolicy,
  triageState,
  type CategoryOption,
  type Policy,
  type TriageVerdict,
} from '../src/lib/triage.ts'
import {LANGUAGE_LABELS} from '../src/lib/vocab.ts'
import {PLEAS, type CalibrationPlea} from './calibration-pleas.ts'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
if (!projectId || !dataset || !process.env.TYPESAFE_API_KEY) {
  console.error('Run with --env-file=.env.local (needs the Sanity project id, dataset and TYPESAFE_API_KEY).')
  process.exit(1)
}

async function groq<T>(query: string): Promise<T> {
  const url = `https://${projectId}.api.sanity.io/v2026-09-01/data/query/${dataset}?query=${encodeURIComponent(query)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Sanity query failed with HTTP ${response.status}`)
  return ((await response.json()) as {result: T}).result
}

const rawPolicy = await groq<unknown>(`*[_id == "policy"][0]{thresholds, urgencyLevels, flagQuestions, emergencyResources}`)
const parsed = parsePolicy(rawPolicy)
if (!parsed.ok) throw new Error(parsed.problem)
const policy = parsed.policy
const categories = await groq<CategoryOption[]>(
  `*[_type == "category"] | order(order asc){_id, "slug": slug.current, title, description}`,
)
const questions = buildTriageQuestions(policy, categories, LANGUAGE_LABELS)
type Answers = SystemOneResult<Questions>['answers']

const client = new TypeSafeClient({timeout: 20_000, retry: {maxRetries: 2}, logLevel: 'off'})

type Row = {plea: CalibrationPlea; answers: Answers; model: string; latencyMs: number; inputTokens: number}

async function run(plea: CalibrationPlea): Promise<Row> {
  const started = performance.now()
  const result = await client.systemOne({state: triageState(plea), questions})
  return {
    plea,
    answers: result.answers,
    model: result.model,
    latencyMs: Math.round(performance.now() - started),
    inputTokens: result.usage.input_tokens,
  }
}

// A few at a time: well under the rate limit, and fast enough.
const rows: Row[] = []
for (let i = 0; i < PLEAS.length; i += 4) {
  rows.push(...(await Promise.all(PLEAS.slice(i, i + 4).map(run))))
}

function verdictWith(row: Row, thresholds: Partial<Policy['thresholds']>): TriageVerdict {
  return gateTriage(row.answers, {...policy, thresholds: {...policy.thresholds, ...thresholds}}, categories, LANGUAGE_LABELS)
}

const f2 = (n: number | null | undefined) => (typeof n === 'number' ? n.toFixed(2) : '–')
const expected = (row: Row) => row.plea.expect
const agrees = (row: Row, route: string) => expected(row) === 'either' || expected(row) === route

console.log(
  `\nPolicy: triageMinConfidence ${policy.thresholds.triageMinConfidence}, maxFlagProbability ${policy.thresholds.maxFlagProbability}. ${rows.length} pleas, model ${rows[0]?.model}.`,
)
console.log(
  `Latency: median ${[...rows].map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(rows.length / 2)]} ms; input tokens per call ~${Math.round(rows.reduce((s, r) => s + r.inputTokens, 0) / rows.length)}.\n`,
)
console.log('| plea | expect | gate | category (conf) | urgency (conf) | language (conf) | flags ≥ 0.10 |')
console.log('|---|---|---|---|---|---|---|')
for (const row of rows) {
  const v = verdictWith(row, {})
  const flags = v.flags
    .filter((f) => f.probability >= 0.1)
    .map((f) => `${f.code} ${f.probability.toFixed(2)}`)
    .join(', ')
  const category = row.answers.category as {choice: string; confidence: number}
  const mark = agrees(row, v.route) ? '' : ' ✗'
  console.log(
    `| ${row.plea.id} | ${row.plea.expect} | ${v.route}${mark} | ${category.choice} (${f2(category.confidence)}) | ${f2(v.urgency?.score)} (${f2(v.urgency?.confidence)}) | ${v.language?.code ?? '–'} (${f2(v.language?.confidence)}) | ${flags || '–'} |`,
  )
}

// Threshold grid: how many pleas would the gate route differently from a careful volunteer?
// "Wrongly published" (a plea that needed a person went live) is the error that matters most.
console.log('\nThreshold grid (wrongly published / needlessly reviewed / emergency missed):')
const confidences = [0.5, 0.6, 0.7, 0.8, 0.9]
const flagCuts = [0.2, 0.3, 0.35, 0.4, 0.5, 0.6]
console.log(`| minConf \\ maxFlag | ${flagCuts.join(' | ')} |`)
console.log(`|---|${flagCuts.map(() => '---').join('|')}|`)
for (const minConf of confidences) {
  const cells = flagCuts.map((cut) => {
    let wronglyPublished = 0
    let needlesslyReviewed = 0
    let emergencyMissed = 0
    for (const row of rows) {
      const route = verdictWith(row, {triageMinConfidence: minConf, maxFlagProbability: cut}).route
      if (row.plea.expect === 'either') continue
      if (route === 'publish' && row.plea.expect !== 'publish') wronglyPublished++
      if (route !== 'publish' && row.plea.expect === 'publish') needlesslyReviewed++
      if (row.plea.expect === 'emergency' && route !== 'emergency') emergencyMissed++
    }
    return `${wronglyPublished}/${needlesslyReviewed}/${emergencyMissed}`
  })
  console.log(`| ${minConf} | ${cells.join(' | ')} |`)
}

const outDir = new URL('../../handoff/calibration/', import.meta.url)
mkdirSync(outDir, {recursive: true})
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outFile = new URL(`triage-${stamp}.json`, outDir)
writeFileSync(
  outFile,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      model: rows[0]?.model,
      thresholds: policy.thresholds,
      questions,
      results: rows.map((row) => ({
        id: row.plea.id,
        expect: row.plea.expect,
        note: row.plea.note,
        gate: verdictWith(row, {}).route,
        reasons: verdictWith(row, {}).reasons,
        latencyMs: row.latencyMs,
        inputTokens: row.inputTokens,
        answers: row.answers,
      })),
    },
    null,
    2,
  ),
)
console.log(`\nWrote ${outFile.pathname}`)
