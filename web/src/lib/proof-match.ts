import type {ChoiceResponse, EntryType, NoulResponse, Questions, SystemOneResult} from '@typesafe-ai/sdk'

/**
 * Proof match: does an uploaded receipt show that the checklist was bought?
 *
 * The uploader's browser reads the photo with Tesseract.js and the uploader corrects the lines.
 * Jev then answers narrow questions about those lines, and code decides:
 * - one yes/no question: are these the lines of a receipt at all?
 * - one choice per receipt line: which checklist item did it buy, "another product", or "not a
 *   product" (store name, totals, payment...). Jev can only pick from what code offers.
 * Code gives each receipt line at most one checklist item, reads how many units it bought, computes
 * the coverage (the share of the checklist's units the receipt shows) and gates everything against
 * the policy. Jev only ever sees text, so code also checks
 * that every matched line is close to a line OCR read from the photo: a line the uploader typed or
 * rewrote goes to a volunteer, who compares it with the photo.
 *
 * Quantities are read by code, never by Jev (see readQuantity): only a quantity the receipt states
 * ("3 @ 18.99", "3 x 18.99", "QTY 3", "x3") or that its arithmetic proves ("3 72.500 217.500"), on
 * the line or on a quantity-only line right below it. A line without one counts as one unit. A
 * quantity counts only if OCR read the same one in the photo and quantity × unit price is the line's
 * total; otherwise the line counts as one unit and a volunteer checks it.
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
  /** Index of the OCR line (or the first of two joined OCR lines) this line was compared with. */
  ocrLine?: number | null
  /** The quantity code reads in that OCR text (null: none stated). */
  ocrQuantity?: number | null
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

export type ProofMatch = {
  lineIndex: number
  itemKey: string
  probability: number
  /** Units this receipt line counts for: the quantity code read and trusted, otherwise 1. */
  quantity: number
  /** The line the quantity was read from (this line, or a quantity line right below it). Null: none stated. */
  quantityLine: number | null
}

/** How many units of one checklist line the receipt shows. `shown` may exceed `needed`. */
export type ItemQuantity = {itemKey: string; needed: number; shown: number}

export type ProofVerdict = {
  verdict: 'auto_verified' | 'needs_review'
  /** Why it went to a person. Composed by code from the answers and the policy. */
  reasons: string[]
  receiptProbability: number | null
  matches: ProofMatch[]
  quantities: ItemQuantity[]
  /** Share of the checklist's units the receipt shows, each line counted up to its quantity. */
  coverage: number
  /** Names of the checklist items no receipt line matched. */
  missing: string[]
  /** Checklist items the receipt shows fewer of than the checklist asks for. */
  short: Array<{name: string; shown: number; needed: number}>
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
// Quantities: code reads them, Jev never counts
// ---------------------------------------------------------------------------------------------

/** A money amount as receipts print it: 4.97, 1,756.00, 72.500 (rupiah thousands). */
const MONEY = String.raw`(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2,3})`
const moneyTokens = () => new RegExp(String.raw`(?<![\d.,])${MONEY}(?!\d)`, 'g')

type QuantityPattern = 'at' | 'times' | 'qty' | 'x' | 'columns' | 'at_noisy'

const QUANTITY_PATTERNS: Array<[QuantityPattern, RegExp]> = [
  // "3 @ 18.99", "3@18.99", "3 AT 18.99"
  ['at', new RegExp(String.raw`(?:^|\s)(\d{1,2})\s*(?:@|AT(?=\s))\s*\$?\s*(${MONEY})(?!\d)`, 'i')],
  // "3 x 18.99", "3X18.99", "3 × 18.99"
  ['times', new RegExp(String.raw`(?:^|\s)(\d{1,2})\s*[x×]\s*\$?\s*(${MONEY})(?!\d)`, 'i')],
  // "QTY 3", "Qty: 3"
  ['qty', /\bQTY\.?\s*:?\s*(\d{1,2})\b/i],
  // "x3", "X 3"
  ['x', /(?:^|\s)[x×]\s?(\d{1,2})(?=\s|$)/i],
  // A bare number, a unit price and a total at the end of the line: "3 72.500 217.500".
  // Counts only when the arithmetic proves it (3 × 72.500 = 217.500).
  ['columns', new RegExp(String.raw`(?:^|\s)(\d{1,2})\s+\$?(${MONEY})\s+\$?(${MONEY})\s*[A-Z*]{0,2}\s*$`, 'i')],
  // "3 Q@ 6.99", "3 © 6.99": OCR noise around the @. Trusted only when the arithmetic proves it.
  ['at_noisy', new RegExp(String.raw`(?:^|\s)(\d{1,2})\s*[^\s\d]?\s*[@©®]\s*[^\s\d$]?\s*\$?\s*(${MONEY})(?!\d)`, 'i')],
]

export type QuantityReading = {
  quantity: number
  pattern: QuantityPattern
  /** Where the quantity statement is in the line: [start, end). */
  span: [number, number]
  unitPrice: string | null
  /** The line total the arithmetic was checked against, if the receipt prints one. */
  total: string | null
  arithmetic: 'adds_up' | 'does_not_add_up' | 'not_checked'
  /** Read through OCR noise ("3 Q@ 6.99"): counts only if the arithmetic adds up. */
  noisy: boolean
}

function minorUnits(token: string): {value: number; decimals: number} {
  const separator = Math.max(token.lastIndexOf('.'), token.lastIndexOf(','))
  return {value: Number(token.replace(/\D/g, '')), decimals: separator < 0 ? 0 : token.length - separator - 1}
}

/**
 * quantity × unit price = total, allowing only for how the printed numbers were rounded (a unit
 * price printed to the cent can be off by half a cent per unit).
 */
function addsUp(quantity: number, unitPrice: string, total: string): boolean {
  const unit = minorUnits(unitPrice)
  const sum = minorUnits(total)
  const decimals = Math.max(unit.decimals, sum.decimals)
  const left = quantity * unit.value * 10 ** (decimals - unit.decimals)
  const right = sum.value * 10 ** (decimals - sum.decimals)
  const rounding = 0.5 * quantity * 10 ** (decimals - unit.decimals) + 0.5 * 10 ** (decimals - sum.decimals)
  return Math.abs(left - right) <= rounding + 1e-9
}

/** Another amount on the line than the quantity statement: the first one after it, else the last one before it. */
function otherAmount(text: string, [start, end]: [number, number]): string | null {
  const tokens = [...text.matchAll(moneyTokens())].map((match) => ({token: match[0], at: match.index ?? 0}))
  const after = tokens.find((token) => token.at >= end)
  if (after) return after.token
  const before = tokens.filter((token) => token.at + token.token.length <= start)
  return before.length > 0 ? before[before.length - 1].token : null
}

/** The last amount printed on a line (the line total on most receipts). */
export function lastAmount(text: string): string | null {
  const tokens = text.match(moneyTokens())
  return tokens && tokens.length > 0 ? tokens[tokens.length - 1] : null
}

/**
 * The quantity a receipt line states, read by code. Only explicit forms count; sizes and pack
 * counts ("12OZ", "40CT", "4PK") never do. `fallbackTotal` is the item line's amount, for a
 * quantity-only line ("3 @ 18.99") below it that prints no total of its own.
 */
export function readQuantity(text: string, fallbackTotal: string | null = null): QuantityReading | null {
  for (const [pattern, regex] of QUANTITY_PATTERNS) {
    const match = regex.exec(text)
    if (!match) continue
    const quantity = Number(match[1])
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) continue
    const lead = match[0].length - match[0].trimStart().length
    const span: [number, number] = [match.index + lead, match.index + match[0].trimEnd().length]
    if (pattern === 'columns') {
      if (!addsUp(quantity, match[2], match[3])) continue // a bare number is a quantity only if the arithmetic proves it
      return {quantity, pattern, span, unitPrice: match[2], total: match[3], arithmetic: 'adds_up', noisy: false}
    }
    const unitPrice = pattern === 'at' || pattern === 'times' || pattern === 'at_noisy' ? match[2] : null
    const total = otherAmount(text, span) ?? fallbackTotal
    const arithmetic = unitPrice && total ? (addsUp(quantity, unitPrice, total) ? 'adds_up' : 'does_not_add_up') : 'not_checked'
    return {quantity, pattern, span, unitPrice, total, arithmetic, noisy: pattern === 'at_noisy'}
  }
  return null
}

/** A line that only states a quantity ("3 @ 18.99", "QTY 3"): it belongs to the item line above it. */
export function isQuantityLine(text: string): boolean {
  const reading = readQuantity(text)
  if (!reading) return false
  const rest = `${text.slice(0, reading.span[0])} ${text.slice(reading.span[1])}`
    .replace(moneyTokens(), ' ')
    .replace(/\b(?:EA|EACH|PCS?|UNITS?)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
  return rest.length <= 1 // a tax flag such as "F" may remain
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

export type OcrAnchor = {
  /** Best similarity (0-1) to what OCR read. */
  similarity: number
  /** The OCR line it was compared with (the first of two, when two neighbouring lines were joined). */
  ocrLine: number | null
  /** The quantity code reads in that OCR text (null: none stated). */
  quantity: number | null
}

/**
 * For each corrected line, the text OCR read from the photo that it is closest to: any OCR line, or
 * two neighbouring OCR lines joined (OCR often splits a product and its price across two lines).
 * Among equally close OCR lines, one no earlier line was compared with wins: a receipt that really
 * lists the same thing twice anchors both lines, a line the uploader duplicated anchors only once.
 */
export function ocrAnchors(lines: ReceiptLine[], ocrText: string): OcrAnchor[] {
  const read = ocrText.split(/\r?\n/).map(tidyLineText).filter(Boolean)
  const candidates = [
    ...read.map((text, index) => ({text, first: index})),
    ...read.slice(1).map((line, index) => ({text: `${read[index]} ${line}`, first: index})),
  ]
  const used = new Set<number>()
  return lines.map((line) => {
    let best: {similarity: number; candidate: (typeof candidates)[number] | null} = {similarity: 0, candidate: null}
    for (const candidate of candidates) {
      const value = similarity(line.text, candidate.text)
      const better = value > best.similarity + 1e-9
      const tieButFree =
        Math.abs(value - best.similarity) <= 1e-9 && best.candidate !== null && used.has(best.candidate.first) && !used.has(candidate.first)
      if (better || tieButFree) best = {similarity: value, candidate}
    }
    if (!best.candidate || best.similarity === 0) return {similarity: 0, ocrLine: null, quantity: null}
    used.add(best.candidate.first)
    return {similarity: best.similarity, ocrLine: best.candidate.first, quantity: readQuantity(best.candidate.text)?.quantity ?? null}
  })
}

/** For each corrected line, its best similarity to what OCR read (see ocrAnchors). */
export function ocrSimilarities(lines: ReceiptLine[], ocrText: string): number[] {
  return ocrAnchors(lines, ocrText).map((anchor) => anchor.similarity)
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
  lines.forEach((line, index) => {
    // A line that only states a quantity ("3 @ 18.99") belongs to the line above; code reads it.
    if (isQuantityLine(line.text)) return
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

  const nameOf = (itemKey: string) => checklist.find((entry) => entry.key === itemKey)?.name ?? 'a checklist item'
  const quoted = (index: number) => `line ${index + 1} (“${lines[index].text}”)`

  // Each line Jev was asked about → the checklist item it put at or above the threshold (the most
  // probable one, if several). Quantity-only lines weren't asked: they belong to the line above.
  const quantityLines = new Set(lines.flatMap((line, index) => (isQuantityLine(line.text) ? [index] : [])))
  const matched: Array<{lineIndex: number; itemKey: string; probability: number}> = []
  let unanswered = 0
  lines.forEach((_, lineIndex) => {
    if (quantityLines.has(lineIndex)) return
    const answer = answers[lineQuestionId(lineIndex)] as ChoiceResponse | undefined
    if (answer?.type !== 'choice') {
      unanswered++
      return
    }
    let best: (typeof matched)[number] | null = null
    for (const item of checklist) {
      const probability = answer.probabilities[item.option]
      if (typeof probability === 'number' && probability >= minMatch && (!best || probability > best.probability)) {
        best = {lineIndex, itemKey: item.key, probability}
      }
    }
    if (best) matched.push(best)
  })
  if (unanswered > 0) reasons.push(`Jev gave no answer for ${unanswered} receipt line${unanswered === 1 ? '' : 's'}.`)

  // Jev read text, not the photo: a matched line must be (close to) what OCR read from the photo.
  for (const match of matched) {
    const line = lines[match.lineIndex]
    if (line.ocrSimilarity < proofMinOcrSimilarity) {
      reasons.push(
        `The line matched to ${nameOf(match.itemKey)} (“${line.text}”) differs from what OCR read in the photo (similarity ${p2(line.ocrSimilarity)}; the policy needs ${p2(proofMinOcrSimilarity)}), so a volunteer compares it with the photo.`,
      )
    }
  }

  // A line that repeats a line of the photo already counted for the same item counts once.
  const anchorsByItem = new Map<string, Set<number>>()
  const counted = matched.filter((match) => {
    const anchor = lines[match.lineIndex].ocrLine
    if (typeof anchor !== 'number') return true
    const seen = anchorsByItem.get(match.itemKey) ?? new Set<number>()
    anchorsByItem.set(match.itemKey, seen)
    if (seen.has(anchor)) {
      reasons.push(
        `Receipt ${quoted(match.lineIndex)} repeats a line of the photo that already counts for ${nameOf(match.itemKey)}, so it isn't counted twice and a volunteer compares it with the photo.`,
      )
      return false
    }
    seen.add(anchor)
    return true
  })

  // Quantities: code reads them from the line, or from a quantity-only line right below it.
  const usedQuantityAnchors = new Set<number>()
  const matches: ProofMatch[] = counted.map((match) => {
    const line = lines[match.lineIndex]
    let source = match.lineIndex
    let reading = readQuantity(line.text)
    if (!reading && quantityLines.has(match.lineIndex + 1)) {
      source = match.lineIndex + 1
      reading = readQuantity(lines[source].text, lastAmount(line.text))
    }
    if (!reading) return {...match, quantity: 1, quantityLine: null}

    const sourceLine = lines[source]
    const photoQuantity = sourceLine.ocrQuantity ?? null
    const problems: string[] = []
    if (photoQuantity !== reading.quantity) {
      problems.push(`says ${reading.quantity}, but OCR read ${photoQuantity === null ? 'no quantity' : photoQuantity} there in the photo`)
    } else if (source !== match.lineIndex && sourceLine.ocrSimilarity < proofMinOcrSimilarity) {
      problems.push(`differs from what OCR read in the photo (similarity ${p2(sourceLine.ocrSimilarity)})`)
    }
    if (reading.arithmetic === 'does_not_add_up') {
      problems.push(`says ${reading.quantity} × ${reading.unitPrice}, which isn't the line's total ${reading.total}`)
    } else if (reading.noisy && reading.arithmetic !== 'adds_up') {
      problems.push("isn't printed clearly, and no line total confirms it")
    }
    if (source !== match.lineIndex && typeof sourceLine.ocrLine === 'number') {
      if (usedQuantityAnchors.has(sourceLine.ocrLine)) problems.push('repeats a quantity line of the photo that another item already uses')
      usedQuantityAnchors.add(sourceLine.ocrLine)
    }
    if (problems.length > 0) {
      reasons.push(
        `The quantity for ${nameOf(match.itemKey)} on receipt ${quoted(source)} ${problems.join(', and ')}, so it counts as one unit and a volunteer compares it with the photo.`,
      )
      return {...match, quantity: 1, quantityLine: source}
    }
    return {...match, quantity: reading.quantity, quantityLine: source}
  })

  const quantities: ItemQuantity[] = checklist.map((item) => ({
    itemKey: item.key,
    needed: item.quantity,
    shown: matches.filter((match) => match.itemKey === item.key).reduce((sum, match) => sum + match.quantity, 0),
  }))
  const neededUnits = quantities.reduce((sum, entry) => sum + entry.needed, 0)
  const shownUnits = quantities.reduce((sum, entry) => sum + Math.min(entry.shown, entry.needed), 0)
  const coverage = neededUnits > 0 ? shownUnits / neededUnits : 0
  const missing = quantities.filter((entry) => entry.shown === 0).map((entry) => nameOf(entry.itemKey))
  const short = quantities
    .filter((entry) => entry.shown > 0 && entry.shown < entry.needed)
    .map((entry) => ({name: nameOf(entry.itemKey), shown: entry.shown, needed: entry.needed}))
  if (checklist.length === 0) {
    reasons.push('The request has no checklist to compare the receipt with.')
  } else if (coverage < minCoverage) {
    const fewer = short.length > 0 ? ` Fewer than asked for: ${short.map((entry) => `${entry.name} (${entry.shown} of ${entry.needed})`).join(', ')}.` : ''
    const absent = missing.length > 0 ? ` Not on the receipt: ${missing.join(', ')}.` : ''
    reasons.push(
      `The receipt shows ${shownUnits} of the ${neededUnits} units on the checklist (${percent(coverage)}; the policy needs ${percent(minCoverage)} to verify it automatically).${fewer}${absent}`,
    )
  }

  return {
    verdict: reasons.length === 0 ? 'auto_verified' : 'needs_review',
    reasons,
    receiptProbability,
    matches,
    quantities,
    coverage,
    missing,
    short,
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
