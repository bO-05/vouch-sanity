/**
 * Day 4 finding: "send me money by PayPal" scored payment_redirect p = 0.30 and auto-published.
 * Compares the policy's current payment question with a candidate wording on synthetic pleas
 * (written by us, not real people). Uses the app's triageState(); nothing is written to Sanity.
 *
 * Run from web/:  node --env-file=.env.local scripts/probe-payment-flag.ts
 */
import {noul, TypeSafeClient} from '@typesafe-ai/sdk'
import {triageState} from '../src/lib/triage.ts'

const CURRENT =
  'Does `request` ask donors to send gift cards, cryptocurrency, wire transfers, mobile money or cash to a person or an account?'
const CANDIDATE =
  'Does `request` ask donors for money in any form instead of goods, such as cash, a bank or wire transfer, PayPal, Venmo, Cash App, Zelle, mobile money, gift cards or cryptocurrency?'

const PLEAS: Array<{label: string; expect: 'flag' | 'pass'; story: string; checklist: string[]}> = [
  {label: 'PayPal (the miss)', expect: 'flag', checklist: ['1 × Gloves (pair)'], story: 'My daughter is nine and her winter coat no longer fits. Money is tight after the rent went up. Could someone send me money by PayPal so I can buy her a warm coat and gloves?'},
  {label: 'Venmo', expect: 'flag', checklist: ['2 × Rice (5 lb bag)'], story: 'We are out of food until Friday. If you can, Venmo me 40 dollars and I will get rice and eggs for the kids.'},
  {label: 'Bank transfer', expect: 'flag', checklist: ['1 × Fleece blanket (item)'], story: 'Our heating is broken. The easiest way to help is a bank transfer to my account so I can buy blankets myself.'},
  {label: 'Cash App', expect: 'flag', checklist: ['2 × Diapers (pack)'], story: 'Please send anything you can on Cash App, even five dollars, so I can buy diapers for my son.'},
  {label: 'Gift card (regression)', expect: 'flag', checklist: ['1 × Rice (5 lb bag)'], story: 'Could someone send a grocery gift card so I can buy rice, eggs and milk for my two kids?'},
  {label: 'Money is tight (legit)', expect: 'pass', checklist: ['2 × Rice (5 lb bag)', '1 × Eggs (dozen)'], story: 'Money is tight after the rent went up and we are running low on food. Two bags of rice and some eggs would get us to payday.'},
  {label: "Can't afford (legit)", expect: 'pass', checklist: ['2 × Diapers (pack)'], story: "I can't afford diapers until my paycheck comes next week. Two packs would help my baby a lot."},
  {label: 'Lost savings (legit)', expect: 'pass', checklist: ['2 × Fleece blanket (item)'], story: 'We lost our savings and most of our things in the flood. We need two warm blankets for the children.'},
]

const client = new TypeSafeClient({timeout: 20_000, retry: {maxRetries: 2}, logLevel: 'off'})
console.log('p(current) p(candidate)  expect  plea')
for (const plea of PLEAS) {
  const result = await client.systemOne({
    state: triageState({title: plea.label, story: plea.story, city: 'Leeds', country: 'United Kingdom', checklist: plea.checklist}),
    questions: {current: noul(CURRENT), candidate: noul(CANDIDATE)},
  })
  const a = result.answers.current.noul
  const b = result.answers.candidate.noul
  console.log(`   ${a.toFixed(2)}        ${b.toFixed(2)}     ${plea.expect.padEnd(5)}  ${plea.label}`)
}
