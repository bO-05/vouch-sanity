/**
 * Calibrate the proof-match questions and thresholds on synthetic receipts.
 *
 * Uses the exact question builder and gate the app uses (src/lib/proof-match.ts), the live policy
 * and the checklists of the seeded demo requests (published, read anonymously), and real Jev calls.
 * The receipts are typed here as OCR would read them (every line counts as read from the photo).
 * Nothing is written to Sanity.
 *
 * Run from web/:  node --env-file=.env.local scripts/calibrate-proof.ts
 * Writes ../handoff/calibration/proof-<timestamp>.json and prints a summary.
 */
import {mkdirSync, writeFileSync} from 'node:fs'
import {TypeSafeClient, type ChoiceResponse, type Questions, type SystemOneResult} from '@typesafe-ai/sdk'
import {
  buildProofQuestions,
  gateProof,
  lineQuestionId,
  proofState,
  RECEIPT_QUESTION,
  splitOcrText,
  type ProofChecklistLine,
  type ProofThresholds,
  type ProofVerdict,
} from '../src/lib/proof-match.ts'

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

type RawNeed = {
  _id: string
  items: Array<{_key: string; quantity: number; supplyId: string; name: string; unit: string | null; synonyms: string[] | null}>
}

const needs = await groq<RawNeed[]>(`*[_type == "need" && _id in ["need-demo-01", "need-demo-04", "need-demo-05", "need-demo-06", "need-demo-08"]]{
  _id, "items": items[]{_key, quantity, "supplyId": supplyItem._ref, "name": supplyItem->name, "unit": supplyItem->unit, "synonyms": supplyItem->synonyms}
}`)
const policy = await groq<{thresholds: Record<string, number>}>(`*[_id == "policy"][0]{thresholds}`)
const thresholds: ProofThresholds = {
  proofMinMatchProbability: policy.thresholds.proofMinMatchProbability,
  proofMinCoverage: policy.thresholds.proofMinCoverage,
  receiptMinProbability: policy.thresholds.receiptMinProbability,
  proofMinOcrSimilarity: policy.thresholds.proofMinOcrSimilarity ?? 0.6,
}

function checklistOf(needId: string): ProofChecklistLine[] {
  const need = needs.find((n) => n._id === needId)
  if (!need) throw new Error(`${needId} is not published`)
  return need.items.map((item) => ({
    key: item._key,
    option: item.supplyId.replace(/^supply-/, ''),
    name: item.name,
    unit: item.unit,
    synonyms: item.synonyms ?? [],
    quantity: item.quantity,
  }))
}

/** `either`: going to a volunteer is an acceptable (conservative) answer, e.g. heavy OCR noise. */
type Case = {name: string; needId: string; expect: 'auto_verified' | 'needs_review' | 'either'; text: string}

const GROCERY = `FRESHWAY MARKET
STORE 0142 HOUSTON TX
09/27/26 14:32 REG 03
LONG GRAIN RICE 5LB 2 @ 4.97 9.94
PINTO BEANS 2LB 2 @ 2.48 4.96
SPAGHETTI 16OZ 4 @ 1.25 5.00
CREAMY PEANUT BUTTER 16OZ 2 @ 3.48 6.96
BANANAS 2.10 LB 1.24
SUBTOTAL 28.10
TAX 0.00
TOTAL 28.10
DEBIT CARD ************0000 28.10
THANK YOU FOR SHOPPING WITH US`

const CASES: Case[] = [
  {name: 'groceries → demo-01 (all 4 items)', needId: 'need-demo-01', expect: 'auto_verified', text: GROCERY},
  {name: 'groceries → demo-08 (rice only)', needId: 'need-demo-08', expect: 'needs_review', text: GROCERY},
  {
    name: 'groceries, OCR noise → demo-01',
    needId: 'need-demo-01',
    expect: 'either',
    text: `FRESHWAY MARKET\n09/27/26 14:32\nL0NG GRA1N R1CE 5LB 9.94\nP1NT0 BEANS 2LB 4.96\nSPAGHETT1 16OZ 5.00\nCRMY PNT BUTTR 16OZ 6.96\nSUBT0TAL 27.86\nT0TAL 27.86`,
  },
  {
    name: 'partial groceries → demo-01 (2 of 4)',
    needId: 'need-demo-01',
    expect: 'needs_review',
    text: `FRESHWAY MARKET\n09/27/26 10:05\nLONG GRAIN RICE 5LB 9.94\nSPAGHETTI 16OZ 5.00\nMILK 1 GAL 3.89\nTOTAL 18.83\nCASH 20.00\nCHANGE 1.17`,
  },
  {
    name: 'household → demo-05',
    needId: 'need-demo-05',
    expect: 'auto_verified',
    text: `SM HYPERMARKET\nMAKATI CITY\n09/27/2026 11:20\nTIDE LIQUID DETERGENT 1.5L 2 x 289.00 578.00\nLYSOL MULTI-SURFACE CLEANER 2 x 199.00 398.00\nHEFTY TRASH BAGS 40CT 2 x 245.00 490.00\nSAFEGUARD BAR SOAP 4PK 2 x 145.00 290.00\nTOTAL 1756.00\nCASH 2000.00\nCHANGE 244.00`,
  },
  {
    name: 'baby → demo-04 (brand names)',
    needId: 'need-demo-04',
    expect: 'auto_verified',
    text: `DROGA RAIA\nSAO PAULO SP\n27/09/2026 09:14\nSIMILAC PRO-ADVANCE 12.4OZ 3 x 18.99 56.97\nPAMPERS SWADDLERS SZ1 40CT 2 x 12.49 24.98\nHUGGIES NATURAL CARE WIPES 80CT 2 x 3.99 7.98\nTOTAL 89.93\nVISA ****0000`,
  },
  {
    name: 'pharmacy → demo-06 (UK brands)',
    needId: 'need-demo-06',
    expect: 'auto_verified',
    text: `BOOTS\nGLASGOW ARGYLE ST\n27/09/2026 16:40\nBOOTS DIGITAL THERMOMETER 7.99\nCALPOL INFANT SUSPENSION 100ML 4.49\nELASTOPLAST FABRIC PLASTERS 40PK 3.29\nTOTAL 15.77\nCONTACTLESS 15.77`,
  },
  {
    name: 'Indonesian minimarket → demo-08',
    needId: 'need-demo-08',
    expect: 'auto_verified',
    text: `INDOMARET JAKARTA SELATAN\n27.09.2026 08:02\nBERAS PANDAN WANGI 5KG 3 72.500 217.500\nMINYAK GORENG BIMOLI 1L 2 23.000 46.000\nTELUR AYAM 1 LUSIN 2 28.000 56.000\nTOTAL 319.500\nTUNAI 320.000\nKEMBALI 500`,
  },
  {
    name: 'electronics → demo-01 (nothing matches)',
    needId: 'need-demo-01',
    expect: 'needs_review',
    text: `TECH CORNER\n09/27/26 18:11\nUSB-C CABLE 2M 12.99\nPHONE CASE CLEAR 9.99\nWIRELESS EARBUDS 39.99\nSUBTOTAL 62.97\nTAX 5.20\nTOTAL 68.17\nVISA ****0000`,
  },
  {
    name: 'decoys that only sound like the checklist → demo-01',
    needId: 'need-demo-01',
    expect: 'needs_review',
    text: `CORNER DELI\n09/27/26 12:30\nRICE CAKES CARAMEL 4.29\nPEANUT BUTTER COOKIES 3.99\nPASTA SAUCE MARINARA 2.99\nJELLY BEANS 1.49\nTOTAL 12.76\nCASH 15.00\nCHANGE 2.24`,
  },
  {
    name: 'thank-you note, not a receipt → demo-01',
    needId: 'need-demo-01',
    expect: 'needs_review',
    text: `Dear neighbor,\nthank you so much for the rice\nand the beans and the pasta.\nThe kids love the peanut butter!\nSee you soon, Maria`,
  },
]

type Answers = SystemOneResult<Questions>['answers']
const client = new TypeSafeClient({timeout: 20_000, retry: {maxRetries: 2}, logLevel: 'off'})

type Row = {
  case: Case
  verdict: ProofVerdict
  answers: Answers
  model: string
  latencyMs: number
  inputTokens: number
  questionCount: number
}

async function run(testCase: Case): Promise<Row> {
  const checklist = checklistOf(testCase.needId)
  const lines = splitOcrText(testCase.text)
  const questions = buildProofQuestions(lines, checklist)
  const started = performance.now()
  const result = await client.systemOne({state: proofState(lines, checklist), questions})
  const latencyMs = Math.round(performance.now() - started)
  const checked = lines.map((line) => ({...line, ocrSimilarity: 1}))
  return {
    case: testCase,
    verdict: gateProof(result.answers, checked, checklist, thresholds),
    answers: result.answers,
    model: result.model,
    latencyMs,
    inputTokens: result.usage.input_tokens,
    questionCount: Object.keys(questions).length,
  }
}

const rows: Row[] = []
for (let i = 0; i < CASES.length; i += 3) rows.push(...(await Promise.all(CASES.slice(i, i + 3).map(run))))

const f2 = (n: number | null | undefined) => (typeof n === 'number' ? n.toFixed(2) : '–')
console.log(
  `\nThresholds: match ${thresholds.proofMinMatchProbability}, coverage ${thresholds.proofMinCoverage}, receipt ${thresholds.receiptMinProbability}. Model ${rows[0]?.model}.\n`,
)
let agree = 0
for (const row of rows) {
  const ok = row.case.expect === 'either' || row.verdict.verdict === row.case.expect
  if (ok) agree++
  console.log(
    `${ok ? 'OK  ' : 'MISS'} ${row.case.name}: ${row.verdict.verdict} · coverage ${f2(row.verdict.coverage)} · receipt p ${f2(row.verdict.receiptProbability)} · ${row.questionCount} questions · ${row.inputTokens} tokens · ${row.latencyMs} ms`,
  )
  const lines = splitOcrText(row.case.text)
  lines.forEach((line, index) => {
    const answer = row.answers[lineQuestionId(index)] as ChoiceResponse | undefined
    if (!answer) return
    const top = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1])[0]
    console.log(`       ${String(index + 1).padStart(2)} ${line.text.padEnd(46).slice(0, 46)} → ${answer.choice} (p ${f2(top?.[1])})`)
  })
  if (row.verdict.reasons.length) console.log(`       reasons: ${row.verdict.reasons.join(' | ')}`)
}
console.log(`\n${agree}/${rows.length} as expected. "${RECEIPT_QUESTION}" is the receipt question.`)

mkdirSync('../handoff/calibration', {recursive: true})
const file = `../handoff/calibration/proof-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
writeFileSync(
  file,
  JSON.stringify(
    {
      thresholds,
      model: rows[0]?.model,
      rows: rows.map((row) => ({
        name: row.case.name,
        needId: row.case.needId,
        expect: row.case.expect,
        verdict: row.verdict,
        latencyMs: row.latencyMs,
        inputTokens: row.inputTokens,
        answers: row.answers,
      })),
    },
    null,
    2,
  ),
)
console.log(`Wrote ${file}`)
