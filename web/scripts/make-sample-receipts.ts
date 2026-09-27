/**
 * Renders the sample receipts in public/samples/ (PNG, so Tesseract.js can read them).
 * They are made up for the demo, and each covers the checklists of some seeded demo requests.
 * Run from web/:  node scripts/make-sample-receipts.ts
 */
import {mkdirSync} from 'node:fs'
import sharp from 'sharp'

type Receipt = {file: string; header: string[]; items: Array<[string, string]>; footer: Array<[string, string]>; note: string[]}

const WIDTH = 34 // characters per line

const RECEIPTS: Receipt[] = [
  {
    file: 'receipt-groceries.png',
    header: ['FRESHWAY MARKET', 'STORE 0142', '09/28/26  14:32  REG 03'],
    items: [
      ['LONG GRAIN RICE 5LB', '9.94'],
      ['PINTO BEANS 2LB', '4.96'],
      ['SPAGHETTI 16OZ', '5.00'],
      ['PEANUT BUTTER 16OZ', '6.96'],
      ['VEGETABLE OIL 1L', '7.58'],
      ['LARGE EGGS 12CT', '6.98'],
      ['BANANAS', '1.24'],
    ],
    footer: [
      ['SUBTOTAL', '42.66'],
      ['TAX', '0.00'],
      ['TOTAL', '42.66'],
      ['DEBIT CARD ****', '42.66'],
    ],
    note: ['THANK YOU FOR SHOPPING'],
  },
  {
    file: 'receipt-pharmacy.png',
    header: ['CORNER PHARMACY', 'STORE 311', '09/28/26  10:05  REG 01'],
    items: [
      ['INFANT FORMULA 12OZ', '56.97'],
      ['DIAPERS SIZE 1 40CT', '24.98'],
      ['BABY WIPES 80CT', '7.98'],
      ['DIGITAL THERMOMETER', '9.99'],
      ['CHILDRENS FEVER REDUCER', '7.49'],
      ['ADHESIVE BANDAGES 50CT', '3.99'],
      ['SANITARY PADS 36CT', '20.97'],
      ['TAMPONS 36CT', '15.98'],
    ],
    footer: [
      ['SUBTOTAL', '148.35'],
      ['TAX', '0.00'],
      ['TOTAL', '148.35'],
      ['CASH', '150.00'],
      ['CHANGE', '1.65'],
    ],
    note: ['GET WELL SOON'],
  },
  {
    file: 'receipt-household.png',
    header: ['HOMEBASICS STORE', 'STORE 027', '09/28/26  16:40  REG 02'],
    items: [
      ['LAUNDRY DETERGENT 1.5L', '19.98'],
      ['ALL PURPOSE CLEANER', '7.98'],
      ['TRASH BAGS 40CT', '13.98'],
      ['BAR SOAP 4PK', '7.98'],
      ['FLEECE BLANKET', '23.98'],
      ['WARM SOCKS 6PK', '9.99'],
      ['SCHOOL BACKPACK', '19.99'],
      ['NOTEBOOKS 5PK', '11.98'],
      ['PENS AND PENCILS SET', '4.99'],
    ],
    footer: [
      ['SUBTOTAL', '120.85'],
      ['TAX', '0.00'],
      ['TOTAL', '120.85'],
      ['CREDIT CARD ****', '120.85'],
    ],
    note: ['THANK YOU'],
  },
  {
    file: 'receipt-electronics.png',
    header: ['TECH CORNER', 'STORE 88', '09/28/26  18:11  REG 04'],
    items: [
      ['USB-C CABLE 2M', '12.99'],
      ['PHONE CASE CLEAR', '9.99'],
      ['WIRELESS EARBUDS', '39.99'],
    ],
    footer: [
      ['SUBTOTAL', '62.97'],
      ['TAX', '5.20'],
      ['TOTAL', '68.17'],
      ['CREDIT CARD ****', '68.17'],
    ],
    note: ['NO RETURNS WITHOUT RECEIPT'],
  },
]

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const center = (text: string) => ' '.repeat(Math.max(0, Math.floor((WIDTH - text.length) / 2))) + text
const row = ([left, right]: [string, string]) => left + ' '.repeat(Math.max(1, WIDTH - left.length - right.length)) + right
const rule = '-'.repeat(WIDTH)

function svg(receipt: Receipt): string {
  const lines = [
    ...receipt.header.map(center),
    rule,
    ...receipt.items.map(row),
    rule,
    ...receipt.footer.map(row),
    rule,
    ...receipt.note.map(center),
  ]
  const fontSize = 30
  const lineHeight = 44
  const padding = 48
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
