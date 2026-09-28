/**
 * Offline checks for the receipt quantity rules in src/lib/proof-match.ts (no Jev, no Sanity):
 * what code reads as a quantity, which lines are quantity-only, how edited lines anchor to the OCR
 * text, and what the gate decides. Jev's answers are faked here: the point is the code around them.
 * Run from web/:  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-quantities.ts
 */
import type {Questions, SystemOneResult} from '@typesafe-ai/sdk'
import {receiptLineLooksLikeContactInfo} from '../src/lib/contact.ts'
import {
  gateProof,
  isQuantityLine,
  lineQuestionId,
  NOT_A_PRODUCT,
  ocrAnchors,
  OTHER_PRODUCT,
  RECEIPT_QUESTION,
  readQuantity,
  splitOcrText,
  type CheckedReceiptLine,
  type ProofChecklistLine,
  type ProofThresholds,
} from '../src/lib/proof-match.ts'

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`}`)
}

// 1. What counts as a quantity (and what doesn't).
const reads: Array<[string, number | null, string?]> = [
  ['3 @ 18.99', 3, 'not_checked'],
  ['  2 @ $4.97 9.94', 2, 'adds_up'],
  ['LONG GRAIN RICE 5LB 2 @ 4.97 9.94', 2, 'adds_up'],
  ['SIMILAC PRO-ADVANCE 12.4OZ 3 x 18.99 56.97', 3, 'adds_up'],
  ['TIDE LIQUID DETERGENT 1.5L 2 x 289.00 578.00', 2, 'adds_up'],
  ['PAMPERS 2 X 12.49 30.00', 2, 'does_not_add_up'],
  ['2 AT 4.97', 2, 'not_checked'],
  ['DIAPERS QTY 2 24.98', 2, 'not_checked'],
  ['DRY BEANS FOR MARIA x2', 2, 'not_checked'],
  ['BERAS PANDAN WANGI 5KG 3 72.500 217.500', 3, 'adds_up'],
  ['TELUR AYAM 1 LUSIN 2 28.000 56.000', 2, 'adds_up'],
  ['LAUNDRY 1,756.00 2 x 878.00', 2, 'adds_up'],
  ['RICE 5 4.97 9.94', null], // 5 × 4.97 isn't 9.94: a size, not a quantity
  ['INFANT FORMULA 12OZ 56.97', null],
  ['DIAPERS SIZE 1 40CT 24.98', null],
  ['BAR SOAP 4PK 7.98', null],
  ['BANANAS 2.10 LB 1.24', null],
  ['LARGE EGGS 12CT 6.98', null],
  ['09/28/26  14:32  REG 03', null],
  ['BOX 2.99', null],
]
for (const [text, quantity, arithmetic] of reads) {
  const reading = readQuantity(text)
  check(`reads “${text}”`, reading ? [reading.quantity, reading.arithmetic] : null, quantity === null ? null : [quantity, arithmetic])
}
check('a quantity line uses the item line total', readQuantity('3 @ 18.99', '56.97')?.arithmetic, 'adds_up')
check('…and catches a wrong one', readQuantity('3 @ 18.99', '50.00')?.arithmetic, 'does_not_add_up')
// Seen on production (Sep 28): the browser's Tesseract read the sample's "3 @ 6.99" as "3 Q@ 6.99".
const noisy = readQuantity('3 Q@ 6.99', '20.97')
check('OCR noise around the @ is still read…', [noisy?.quantity, noisy?.noisy, noisy?.arithmetic], [3, true, 'adds_up'])
check('…but without a total it is not confirmed', readQuantity('3 Q@ 6.99')?.arithmetic, 'not_checked')

// 1b. Receipt lines vs. the contact check.
const contact: Array<[string, boolean]> = [
  ['INFANT FORMULA 1202 56.97', false], // "12OZ" read as digits next to the price (seen on production)
  ['3@18.99', false], // not an email
  ['3 @18.99', false], // not a handle
  ['CALL 555 014 2231 4.99', true],
  ['VISA 4111 1111 1111 1111 12.99', true],
  ['ORDER help@shop.example 3.99', true],
]
for (const [text, want] of contact) check(`receipt contact check: “${text}”`, receiptLineLooksLikeContactInfo(text), want)

// 2. Quantity-only lines.
const quantityOnly: Array<[string, boolean]> = [
  ['3 @ 18.99', true],
  ['  2 @ 3.99 EA', true],
  ['2 x 28.000 56.000', true],
  ['QTY 3', true],
  ['3 @ 18.99 F', true],
  ['3 Q@ 6.99', true],
  ['INFANT FORMULA 12OZ 56.97', false],
  ['DIAPERS 2 @ 12.49 24.98', false],
  ['TOTAL 171.79', false],
]
for (const [text, want] of quantityOnly) check(`quantity-only: “${text}”`, isQuantityLine(text), want)

// 3. Anchoring edited lines to the OCR text.
const ocr = 'CORNER PHARMACY\nINFANT FORMULA 12OZ 56.97\n3 @ 18.99\nALL PURPOSE CLEANER 7.98\n2 @ 3.99\nBAR SOAP 4PK 7.98\n2 @ 3.99\nTOTAL 72.93'
const anchored = ocrAnchors(splitOcrText(ocr), ocr)
check('unchanged lines anchor to themselves', anchored.map((a) => a.ocrLine), [0, 1, 2, 3, 4, 5, 6, 7])
check('identical quantity lines anchor to different OCR lines', [anchored[4].ocrLine, anchored[6].ocrLine], [4, 6])
check('the photo’s quantity is read from the OCR text', anchored.map((a) => a.quantity), [null, null, 3, null, 2, null, 2, null])
const addedX3 = ocrAnchors([{text: 'INFANT FORMULA 12OZ 56.97 x3', amount: null}], ocr)[0]
check('a quantity the uploader added is not in the photo', [addedX3.ocrLine, addedX3.quantity], [1, null])

// 4. The gate, with faked Jev answers.
type Answers = SystemOneResult<Questions>['answers']
const thresholds: ProofThresholds = {proofMinMatchProbability: 0.7, proofMinCoverage: 1, receiptMinProbability: 0.6, proofMinOcrSimilarity: 0.6}
const checklist: ProofChecklistLine[] = [
  {key: 'l1', option: 'infant-formula', name: 'Infant formula', unit: '12 oz can', synonyms: [], quantity: 3},
  {key: 'l2', option: 'diapers', name: 'Diapers', unit: 'pack of 40', synonyms: [], quantity: 2},
]

/** Receipt lines as submitted, the OCR text of the photo, and Jev's pick for each non-quantity line. */
function gate(submitted: string[], photo: string, picks: Record<number, string>) {
  const lines = submitted.map((text) => ({text, amount: null}))
  const anchors = ocrAnchors(lines, photo)
  const checked: CheckedReceiptLine[] = lines.map((line, index) => ({
    ...line,
    ocrSimilarity: anchors[index].similarity,
    ocrLine: anchors[index].ocrLine,
    ocrQuantity: anchors[index].quantity,
  }))
  const answers: Answers = {[RECEIPT_QUESTION]: {type: 'noul', noul: 0.98}} as Answers
  lines.forEach((line, index) => {
    if (isQuantityLine(line.text)) return
    const choice = picks[index] ?? NOT_A_PRODUCT
    const probabilities: Record<string, number> = {'infant-formula': 0, diapers: 0, [OTHER_PRODUCT]: 0, [NOT_A_PRODUCT]: 0}
    probabilities[choice] = 0.99
    ;(answers as Record<string, unknown>)[lineQuestionId(index)] = {type: 'choice', choice, probabilities, confidence: 0.99}
  })
  return gateProof(answers, checked, checklist, thresholds)
}

const FULL = ['CORNER PHARMACY', 'INFANT FORMULA 12OZ 56.97', '3 @ 18.99', 'DIAPERS SIZE 1 40CT 24.98', '2 @ 12.49', 'TOTAL 81.95']
const full = gate(FULL, FULL.join('\n'), {1: 'infant-formula', 3: 'diapers'})
check('full receipt: verified automatically', full.verdict, 'auto_verified')
check('full receipt: quantities', full.quantities.map((q) => q.shown), [3, 2])
check('full receipt: coverage', full.coverage, 1)
check('quantity lines are not asked about', full.matches.map((m) => [m.lineIndex, m.quantityLine]), [[1, 2], [3, 4]])

const noQuantityLine = FULL.filter((_, index) => index !== 2)
const short = gate(noQuantityLine, FULL.join('\n'), {1: 'infant-formula', 2: 'diapers'})
check('quantity line deleted: formula counts 1', short.quantities.map((q) => q.shown), [1, 2])
check('…so it goes to a volunteer', short.verdict, 'needs_review')
check('…and says why', short.reasons, [
  'The receipt shows 3 of the 5 units on the checklist (60%; the policy needs 100% to verify it automatically). Fewer than asked for: Infant formula (1 of 3).',
])

const edited = [...FULL]
edited[2] = '3 @ 18.99'
const photoSaysOne = FULL.join('\n').replace('3 @ 18.99', '1 @ 18.99')
const raised = gate(edited, photoSaysOne, {1: 'infant-formula', 3: 'diapers'})
check('quantity raised by the uploader: counts 1', raised.quantities[0].shown, 1)
check('…and a volunteer compares it', raised.verdict, 'needs_review')

const wrongTotal = gate(['INFANT FORMULA 12OZ 50.00', '3 @ 18.99', 'DIAPERS 2 @ 12.49 24.98'], 'INFANT FORMULA 12OZ 50.00\n3 @ 18.99\nDIAPERS 2 @ 12.49 24.98', {0: 'infant-formula', 2: 'diapers'})
check('quantity × price isn’t the total: counts 1', wrongTotal.quantities.map((q) => q.shown), [1, 2])

const repeated = gate(['DIAPERS 12.49', 'DIAPERS 12.49', 'INFANT FORMULA 3 @ 18.99 56.97'], 'DIAPERS 12.49\nDIAPERS 12.49\nINFANT FORMULA 3 @ 18.99 56.97', {0: 'diapers', 1: 'diapers', 2: 'infant-formula'})
check('a line the receipt really repeats counts twice', [repeated.verdict, repeated.quantities.map((q) => q.shown)], ['auto_verified', [3, 2]])

const duplicated = gate(['DIAPERS 12.49', 'DIAPERS 12.49', 'INFANT FORMULA 3 @ 18.99 56.97'], 'DIAPERS 12.49\nINFANT FORMULA 3 @ 18.99 56.97', {0: 'diapers', 1: 'diapers', 2: 'infant-formula'})
check('a line the uploader duplicated counts once', [duplicated.verdict, duplicated.quantities.map((q) => q.shown)], ['needs_review', [3, 1]])

const noisyLine = gate(
  ['INFANT FORMULA 12OZ 56.97', '3 Q@ 18.99', 'DIAPERS 2 @ 12.49 24.98'],
  'INFANT FORMULA 12OZ 56.97\n3 Q@ 18.99\nDIAPERS 2 @ 12.49 24.98',
  {0: 'infant-formula', 2: 'diapers'},
)
check('a noisy quantity line the total confirms counts', [noisyLine.verdict, noisyLine.quantities.map((q) => q.shown)], ['auto_verified', [3, 2]])
const fixedNoise = gate(
  ['INFANT FORMULA 12OZ 56.97', '3 @ 18.99', 'DIAPERS 2 @ 12.49 24.98'],
  'INFANT FORMULA 12OZ 56.97\n3 Q@ 18.99\nDIAPERS 2 @ 12.49 24.98',
  {0: 'infant-formula', 2: 'diapers'},
)
check('…and so does the uploader’s fix of it', [fixedNoise.verdict, fixedNoise.quantities.map((q) => q.shown)], ['auto_verified', [3, 2]])

const more = gate(['INFANT FORMULA 12OZ 4 @ 18.99 75.96', 'DIAPERS 2 @ 12.49 24.98'], 'INFANT FORMULA 12OZ 4 @ 18.99 75.96\nDIAPERS 2 @ 12.49 24.98', {0: 'infant-formula', 1: 'diapers'})
check('more than asked for is fine (coverage caps at the checklist)', [more.verdict, more.coverage], ['auto_verified', 1])

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
