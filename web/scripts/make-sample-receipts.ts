/**
 * Renders the sample receipts in public/samples/ (PNG, so Tesseract.js can read them).
 * They are made up for the demo, and each covers the checklists of some demo requests, in full:
 * an item bought more than once has a quantity line under it ("3 @ 18.99"), the way many US
 * receipts print it, which Vouch's code reads. Totals are computed here, so they always add up.
 * Run from web/:  node scripts/make-sample-receipts.ts
 */
import {mkdirSync} from 'node:fs'
import sharp from 'sharp'

/** [name, unit price, quantity]. */
type Item = [string, number, number?]
type Receipt = {file: string; header: string[]; items: Item[]; payment: Array<[string, number | 'total' | 'change']>; tax?: number; note: string[]}

const WIDTH = 34 // characters per line

const RECEIPTS: Receipt[] = [
  {
    // demo-01 (rice 2, beans 2, pasta 4, peanut butter 2), demo-08 (rice 3, oil 2, eggs 2), demo-09 (rice 2, beans 2, milk 2)
    file: 'receipt-groceries.png',
    header: ['FRESHWAY MARKET', 'STORE 0142', '09/28/26  14:32  REG 03'],
    items: [
      ['LONG GRAIN RICE 5LB', 4.97, 3],
      ['PINTO BEANS 2LB', 2.48, 2],
      ['SPAGHETTI PASTA', 1.25, 4],
      ['PEANUT BUTTER JAR', 3.48, 2],
      ['VEGETABLE OIL 1L', 3.79, 2],
      ['LARGE EGGS 12CT', 3.49, 2],
      ['WHOLE MILK 1 GAL', 3.89, 2],
      ['BANANAS', 1.24],
    ],
    payment: [['DEBIT CARD ****', 'total']],
    note: ['THANK YOU FOR SHOPPING'],
  },
  {
    // demo-04 (formula 3, diapers 2, wipes 2), demo-06 (thermometer, fever reducer, plasters), demo-07 (pads 3, tampons 2),
    // and the Day 7 request "Soap and toothpaste for my kids" (toothpaste 2, soap 2, toothbrushes 1, shampoo 1)
    file: 'receipt-pharmacy.png',
    header: ['CORNER PHARMACY', 'STORE 311', '09/28/26  10:05  REG 01'],
    items: [
      ['INFANT FORMULA CAN', 18.99, 3],
      ['DIAPERS SIZE 1 40CT', 12.49, 2],
      ['BABY WIPES 80CT', 3.99, 2],
      ['DIGITAL THERMOMETER', 9.99],
      ['CHILDRENS FEVER REDUCER', 7.49],
      ['ADHESIVE BANDAGES 50CT', 3.99],
      ['SANITARY PADS 36CT', 6.99, 3],
      ['TAMPONS 36CT', 7.99, 2],
      ['TOOTHPASTE TUBE', 2.99, 2],
      ['TOOTHBRUSHES 4PK', 4.99],
      ['SHAMPOO BOTTLE', 4.49],
      ['BAR SOAP 4PK', 3.99, 2],
    ],
    payment: [
      ['CASH', 180],
      ['CHANGE', 'change'],
    ],
    note: ['GET WELL SOON'],
  },
  {
    // demo-02 (blankets 2, socks 1), demo-03 (backpack, notebooks 2, pens), demo-05 (detergent, cleaner, trash bags, soap: 2 each),
    // and the Day 7 request "Blankets and gloves before winter" (gloves 2, blankets 2)
    file: 'receipt-household.png',
    header: ['HOMEBASICS STORE', 'STORE 027', '09/28/26  16:40  REG 02'],
    items: [
      ['LAUNDRY DETERGENT 1.5L', 9.99, 2],
      ['ALL PURPOSE CLEANER', 3.99, 2],
      ['TRASH BAGS 40CT', 6.99, 2],
      ['BAR SOAP 4PK', 3.99, 2],
      ['FLEECE BLANKET', 11.99, 2],
      ['WARM SOCKS 6PK', 9.99],
      ['WINTER GLOVES', 7.99, 2],
      ['SCHOOL BACKPACK', 19.99],
      ['NOTEBOOKS 5PK', 5.99, 2],
      ['PENS AND PENCILS SET', 4.99],
    ],
    payment: [['CREDIT CARD ****', 'total']],
    note: ['THANK YOU'],
  },
  {
    file: 'receipt-electronics.png',
    header: ['TECH CORNER', 'STORE 88', '09/28/26  18:11  REG 04'],
    items: [
      ['USB-C CABLE 2M', 12.99],
      ['PHONE CASE CLEAR', 9.99],
      ['WIRELESS EARBUDS', 39.99],
    ],
    tax: 5.2,
    payment: [['CREDIT CARD ****', 'total']],
    note: ['NO RETURNS WITHOUT RECEIPT'],
  },
]

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const center = (text: string) => ' '.repeat(Math.max(0, Math.floor((WIDTH - text.length) / 2))) + text
const row = (left: string, right: string) => left + ' '.repeat(Math.max(1, WIDTH - left.length - right.length)) + right
const rule = '-'.repeat(WIDTH)
const money = (cents: number) => (cents / 100).toFixed(2)

function receiptLines(receipt: Receipt): string[] {
  const itemLines: string[] = []
  let subtotal = 0
  for (const [name, price, quantity = 1] of receipt.items) {
    const unit = Math.round(price * 100)
    subtotal += unit * quantity
    itemLines.push(row(name, money(unit * quantity)))
    if (quantity > 1) itemLines.push(`  ${quantity} @ ${money(unit)}`)
  }
  const tax = Math.round((receipt.tax ?? 0) * 100)
  const total = subtotal + tax
  const payment = receipt.payment.map(([label, value]) => {
    if (value === 'total') return row(label, money(total))
    if (value === 'change') {
      const paid = receipt.payment.find(([, amount]) => typeof amount === 'number')?.[1] as number
      return row(label, money(Math.round(paid * 100) - total))
    }
    return row(label, money(Math.round(value * 100)))
  })
  return [
    ...receipt.header.map(center),
    rule,
    ...itemLines,
    rule,
    row('SUBTOTAL', money(subtotal)),
    row('TAX', money(tax)),
    row('TOTAL', money(total)),
    ...payment,
    rule,
    ...receipt.note.map(center),
  ]
}

function svg(receipt: Receipt): string {
  const lines = receiptLines(receipt)
  // Roomier than the first version: the browser's Tesseract misread tighter lines (Sep 28: "23.98" → "23.098").
  const fontSize = 32
  const lineHeight = 54
  const padding = 56
  const charWidth = fontSize * 0.6
  const width = Math.ceil(WIDTH * charWidth + padding * 2)
  const height = lines.length * lineHeight + padding * 2
  const text = lines
    .map((line, index) => `<text x="${padding}" y="${padding + (index + 1) * lineHeight - 12}" xml:space="preserve">${escape(line)}</text>`)
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#fbfaf6"/>
  <g font-family="Courier New, Consolas, monospace" font-size="${fontSize}" font-weight="bold" fill="#1f1d1a">${text}</g>
</svg>`
}

mkdirSync('public/samples', {recursive: true})
for (const receipt of RECEIPTS) {
  await sharp(Buffer.from(svg(receipt))).png().toFile(`public/samples/${receipt.file}`)
  console.log(`public/samples/${receipt.file}`)
}
