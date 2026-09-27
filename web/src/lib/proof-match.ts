import type {ChoiceResponse, EntryType, NoulResponse, Questions, SystemOneResult} from '@typesafe-ai/sdk'

/**
 * Proof match: does an uploaded receipt show that the checklist was bought?
 *
 * The uploader's browser reads the photo with Tesseract.js and the uploader corrects the lines.
 * Jev then answers narrow questions about those lines, and code decides:
 * - one yes/no question: are these the lines of a receipt at all?
 * - one choice per receipt line: which checklist item did it buy, "another product", or "not a
 *   product" (store name, totals, payment...). Jev can only pick from what code offers.
 * Code assigns at most one receipt line per checklist item (highest probability first), computes the
 * coverage and gates everything against the policy. Jev only ever sees text, so code also checks
 * that every matched line is close to a line OCR read from the photo: a line the uploader typed or
 * rewrote goes to a volunteer, who compares it with the photo.
 *
 * Quantities are not checked: a line counts as "Rice" whether it bought one bag or three.
 *
 * Pure module (no runtime imports), shared by the server, the browser and scripts/.
 */

export const MAX_RECEIPT_LINES = 40
export const MAX_LINE_LENGTH = 120
export const MAX_OCR_TEXT_LENGTH = 12_000
export const OTHER_PRODUCT = 'other_product'
export const NOT_A_PRODUCT = 'not_a_product'
export const RECEIPT_QUESTION = 'store receipt'

export type ReceiptLine = {
  text: string
  /** Price printed at the end of the line, read by code (display only). */
  amount: number | null
}

export type CheckedReceiptLine = ReceiptLine & {
  /** Best character overlap (0-1) with a line OCR read from the photo. 1 = unchanged. */
  ocrSimilarity: number
}

/** A checklist line of the published request, with the catalog words Jev matches against. */
export type ProofChecklistLine = {
  key: string
  /** The choice label Jev picks (the catalog item's slug). */
  option: string
  name: string
  unit: string | null
  synonyms: string[]
  quantity: number
}

export type ProofThresholds = {
  proofMinMatchProbability: number
  proofMinCoverage: number
  receiptMinProbability: number
  proofMinOcrSimilarity: number
}

export type ProofMatch = {lineIndex: number; itemKey: string; probability: number}

export type ProofVerdict = {
  verdict: 'auto_verified' | 'needs_review'
  /** Why it went to a person. Composed by code from the answers and the policy. */
  reasons: string[]
  receiptProbability: number | null
  matches: ProofMatch[]
  /** Share of checklist lines matched to a receipt line. */
  coverage: number
  /** Names of the checklist items no receipt line matched. */
  missing: string[]
}

// ---------------------------------------------------------------------------------------------
// Reading lines (browser and server)
// ---------------------------------------------------------------------------------------------

// A price at the end of a line, as receipts print it: "4.97", "$4.97", "4,97", "4.97 F", "4.97-".
const TRAILING_PRICE = /(?:^|[\s$€£])(\d{1,5}[.,]\d{2})\s?(?:[A-Za-z*]{1,2})?-?\s*$/

export function readAmount(text: string): number | null {
  const match = TRAILING_PRICE.exec(text)
  if (!match) return null
  const value = Number(match[1].replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

export function tidyLineText(text: string): string {
  return text
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LINE_LENGTH)
}

/** Tesseract's text → candidate lines. The uploader edits them before anything is checked. */
export function splitOcrText(text: string): ReceiptLine[] {
  return text
    .split(/\r?\n/)
    .map(tidyLineText)
    .filter((line) => /[\p{L}\p{N}]{2}/u.test(line))
    .slice(0, MAX_RECEIPT_LINES)
    .map((line) => ({text: line, amount: readAmount(line)}))
}

// ---------------------------------------------------------------------------------------------
// How much of a corrected line came from the photo
// ---------------------------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Sørensen–Dice similarity of character pairs (0-1), after dropping case, spaces and punctuation. */
export function similarity(a: string, b: string): number {
  const x = normalize(a)
  const y = normalize(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return 0
  const pairs = new Map<string, number>()
  for (let i = 0; i < x.length - 1; i++) {
    const pair = x.slice(i, i + 2)
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
  }
  let shared = 0
  for (let i = 0; i < y.length - 1; i++) {
    const pair = y.slice(i, i + 2)
    const left = pairs.get(pair) ?? 0
    if (left > 0) {
      shared++
      pairs.set(pair, left - 1)
    }
  }
  return (2 * shared) / (x.length - 1 + (y.length - 1))
}

/**
 * For each corrected line, its best similarity to what OCR read: any OCR line, or two neighbouring
 * OCR lines joined (OCR often splits a product and its price across two lines).
 */
export function ocrSimilarities(lines: ReceiptLine[], ocrText: string): number[] {
  const read = ocrText.split(/\r?\n/).map(tidyLineText).filter(Boolean)
  const candidates = [...read, ...read.slice(1).map((line, index) => `${read[index]} ${line}`)]
  return lines.map((line) =>
    candidates.reduce((best, candidate) => Math.max(best, similarity(line.text, candidate)), 0),
  )
}

// ---------------------------------------------------------------------------------------------
// Questions and the gate
// ---------------------------------------------------------------------------------------------

export function lineQuestionId(index: number): string {
  return `receipt line ${index + 1}`
}

/**
 * Each receipt line is a NAMED field (`receipt.line_06`). Calibration showed that index paths
 * (`receipt.lines[5]`) get confused with their neighbours: Jev mixed 0- and 1-based positions.
 */
export function lineField(index: number): string {
  return `line_${String(index + 1).padStart(2, '0')}`
}

/**
 * The state Jev reads. The questions only point into it by name, so the stored `decision` (which is
 * public) never contains a word of the receipt; it keeps the state's SHA-256 only.
 */
export function proofState(lines: ReceiptLine[], checklist: ProofChecklistLine[]): EntryType {
  return {
    receipt: Object.fromEntries(lines.map((line, index) => [lineField(index), line.text])),
    checklist: checklist.map((line) => ({item: line.name, unit: line.unit ?? '', quantity: line.quantity})),
  }
}

function describeItem(line: ProofChecklistLine): string {
  const also = line.synonyms.length ? `; also sold as ${line.synonyms.join(', ')}` : ''
  return `${line.name}${line.unit ? ` (${line.unit})` : ''}${also}`
}

export function buildProofQuestions(lines: ReceiptLine[], checklist: ProofChecklistLine[]): Questions {
  const criteria: Record<string, string> = {}
  for (const line of checklist) criteria[line.option] = describeItem(line)
  criteria[OTHER_PRODUCT] = 'A product that is not in `checklist`'
  criteria[NOT_A_PRODUCT] =
    'Not a product: the store name or address, a date or time, a register or cashier line, a subtotal, total, tax, discount, payment or change line, or a message'

  const questions: Questions = {
    [RECEIPT_QUESTION]: {
      type: 'noul',
      instructions: 'Are the lines in `receipt` the lines of a receipt or invoice for a purchase, from a shop, a pharmacy or an online store?',
    },
  }
  lines.forEach((_, index) => {
    questions[lineQuestionId(index)] = {
      type: 'choice',
      instructions: `Which item from \`checklist\` did the receipt line \`receipt.${lineField(index)}\` buy, if any? The other lines in \`receipt\` can help.`,
      criteria,
    }
  })
  return questions
}

type Answers = SystemOneResult<Questions>['answers']

const p2 = (value: number) => value.toFixed(2)
const percent = (value: number) => `${Math.round(value * 100)}%`

/** The gate. Code owns every rule here; Jev only supplied the numbers. */
export function gateProof(
  answers: Answers,
  lines: CheckedReceiptLine[],
  checklist: ProofChecklistLine[],
  thresholds: ProofThresholds,
): ProofVerdict {
  const {proofMinMatchProbability: minMatch, proofMinCoverage: minCoverage, receiptMinProbability, proofMinOcrSimilarity} =
    thresholds
  const reasons: string[] = []

  let receiptProbability: number | null = null
  const receipt = answers[RECEIPT_QUESTION] as NoulResponse | undefined
  if (receipt?.type !== 'noul' || !Number.isFinite(receipt.noul)) {
    reasons.push('Jev gave no answer to “is this a receipt?”.')
  } else {
    receiptProbability = receipt.noul
    if (receipt.noul < receiptMinProbability) {
      reasons.push(
        `Jev isn't convinced these are the lines of a receipt (p = ${p2(receipt.noul)}; the policy needs ${p2(receiptMinProbability)}).`,
      )
    }
  }

  // Every (receipt line, checklist item) pair Jev put at or above the threshold.
  const candidates: ProofMatch[] = []
  let unanswered = 0
  lines.forEach((_, lineIndex) => {
    const answer = answers[lineQuestionId(lineIndex)] as ChoiceResponse | undefined
    if (answer?.type !== 'choice') {
      unanswered++
      return
    }
    for (const item of checklist) {
      const probability = answer.probabilities[item.option]
      if (typeof probability === 'number' && probability >= minMatch) {
        candidates.push({lineIndex, itemKey: item.key, probability})
      }
    }
  })
  if (unanswered > 0) reasons.push(`Jev gave no answer for ${unanswered} receipt line${unanswered === 1 ? '' : 's'}.`)

  // At most one receipt line per checklist item and one item per line, most probable first.
  const matches: ProofMatch[] = []
  const usedLines = new Set<number>()
  const usedItems = new Set<string>()
  for (const candidate of candidates.sort((a, b) => b.probability - a.probability || a.lineIndex - b.lineIndex)) {
    if (usedLines.has(candidate.lineIndex) || usedItems.has(candidate.itemKey)) continue
    usedLines.add(candidate.lineIndex)
    usedItems.add(candidate.itemKey)
    matches.push(candidate)
  }
  matches.sort((a, b) => a.lineIndex - b.lineIndex)

  // Jev read text, not the photo: a matched line must be (close to) what OCR read from the photo.
  for (const match of matches) {
    const line = lines[match.lineIndex]
    if (line.ocrSimilarity < proofMinOcrSimilarity) {
      const item = checklist.find((entry) => entry.key === match.itemKey)
      reasons.push(
        `The line matched to ${item?.name ?? 'a checklist item'} (“${line.text}”) differs from what OCR read in the photo (similarity ${p2(line.ocrSimilarity)}; the policy needs ${p2(proofMinOcrSimilarity)}), so a volunteer compares it with the photo.`,
      )
    }
  }

  const missing = checklist.filter((item) => !usedItems.has(item.key)).map((item) => item.name)
  const coverage = checklist.length > 0 ? usedItems.size / checklist.length : 0
  if (checklist.length === 0) {
    reasons.push('The request has no checklist to compare the receipt with.')
  } else if (coverage < minCoverage) {
    reasons.push(
      `The receipt shows ${usedItems.size} of ${checklist.length} checklist items (${percent(coverage)}; the policy needs ${percent(minCoverage)} to verify it automatically). Not found: ${missing.join(', ')}.`,
    )
  }

  return {
    verdict: reasons.length === 0 ? 'auto_verified' : 'needs_review',
    reasons,
    receiptProbability,
    matches,
    coverage,
    missing,
  }
}

/** Outcome label stored on the `decision`: what code decided from Jev's answers. */
export function proofDecisionOutcome(verdict: ProofVerdict): string {
  return verdict.verdict
}

// ---------------------------------------------------------------------------------------------
// Ids and certificates
// ---------------------------------------------------------------------------------------------

/** The private half of a proof (photo + raw OCR). A dotted id: never visible in the public dataset. */
export function receiptScanId(proofId: string): string {
  return `receipt-scan.${proofId.replace(/^proof-/, '').replace(/[^a-zA-Z0-9]/g, '')}`
}

/** One certificate per request, with an id derived from it (idempotent issuing, no lookup). */
export function certificateIdFor(needId: string): string {
  return `certificate-${needId.replace(/^need-/, '')}`
}

/**
 * Canonical JSON: object keys sorted (by UTF-16 code units), no whitespace, `undefined` dropped.
 * The same content always gives the same bytes, so anyone can recompute the certificate's SHA-256.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('A certificate cannot contain NaN or Infinity.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map((entry) => (entry === undefined ? 'null' : canonicalJson(entry))).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  }
  throw new Error(`A certificate cannot contain a ${typeof value}.`)
}
