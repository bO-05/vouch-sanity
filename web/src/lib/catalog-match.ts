import type {ChoiceResponse, EntryType, NoulResponse, Questions, SystemOneResult} from '@typesafe-ai/sdk'

/**
 * Catalog match: turn a plea into a proposed checklist, as a UX assist before submitting.
 *
 * Jev never invents items or numbers. Code offers the choices and Jev picks:
 * - one yes/no question per active catalog item ("does the request ask for Rice?");
 * - code finds every number in the text, and for each one Jev picks which catalog item it
 *   counts, or "something else" (people, ages, days, money, a package size...).
 * Code then builds the proposal: items at or above the policy threshold, quantities capped at the
 * item's max per household. The requester edits the result before submitting.
 *
 * Pure module (no runtime imports), shared by the app and scripts/calibrate-*.ts.
 */

export type CatalogItem = {
  _id: string
  name: string
  synonyms: string[] | null
  unit: string
  maxPerHousehold: number
  category: string | null
}

export type NumberMention = {
  /** The number as code read it. */
  value: number
  /** A few words around it, with the number in brackets, e.g. "we need [2] bags of rice". */
  context: string
}

export type ProposedLine = {
  supplyItemId: string
  name: string
  unit: string
  maxPerHousehold: number
  /** Jev's probability that the request asks for this item. */
  probability: number
  quantity: number
  /** Set when the quantity came from a number in the requester's words. */
  quantityFrom: {value: number; probability: number; capped: boolean} | null
}

export type CatalogPlan = {
  questions: Questions
  items: Array<{questionId: string; item: CatalogItem}>
  numbers: Array<{questionId: string; mention: NumberMention}>
  /** Choice label (item slug) → catalog item. */
  optionToItem: Map<string, CatalogItem>
}

export const SOMETHING_ELSE = 'something_else'
export const MAX_CHECKLIST_LINES = 12
const MAX_MENTIONS = 8
const MAX_COUNT = 50
const CONTEXT_WORDS = 7

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
}

// A standalone number: not part of a price ($20), time (5:30), decimal (2.5), range (3-4),
// fraction (1/2), percentage (20%) or a longer word/number.
const NUMBER_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}.,$€£¥₹/:-])(\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')})(?![\\p{L}\\p{N}/:%-]|[.,]\\d|\\s?%)`,
  'giu',
)

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/** Every number in the text that could be a quantity. Code reads the digits; Jev never does. */
export function findNumberMentions(text: string): NumberMention[] {
  const mentions: NumberMention[] = []
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    if (mentions.length >= MAX_MENTIONS) break
    const raw = match[0]
    const value = /\d/.test(raw) ? Number(raw) : NUMBER_WORDS[raw.toLowerCase()]
    if (!Number.isInteger(value) || value < 1 || value > MAX_COUNT) continue
    const index = match.index ?? 0
    const before = words(text.slice(0, index)).slice(-CONTEXT_WORDS)
    const after = words(text.slice(index + raw.length)).slice(0, CONTEXT_WORDS)
    mentions.push({value, context: [...before, `[${raw}]`, ...after].join(' ')})
  }
  return mentions
}

function slugOf(item: CatalogItem): string {
  return item._id.replace(/^supply-/, '')
}

/**
 * The questions for one catalog-match call. Question ids are readable (they show up in the
 * request's trail) and contain no words from the plea: the plea only travels in the state,
 * which is never stored (a decision keeps only its SHA-256).
 */
export function buildCatalogQuestions(items: CatalogItem[], mentions: NumberMention[]): CatalogPlan {
  const questions: Questions = {}
  const plan: CatalogPlan = {questions, items: [], numbers: [], optionToItem: new Map()}

  for (const item of items) {
    const also = item.synonyms?.length ? ` Other names for it: ${item.synonyms.join(', ')}.` : ''
    let questionId = item.name
    for (let n = 2; questionId in questions; n++) questionId = `${item.name} (${n})`
    questions[questionId] = {
      type: 'noul',
      instructions: `Does \`request\` ask for ${item.name}, or say they need it?${also}`,
    }
    plan.items.push({questionId, item})
  }

  if (mentions.length > 0) {
    const criteria: Record<string, string> = {}
    for (const item of items) {
      criteria[slugOf(item)] = `${item.name}, counted in units of ${item.unit}`
      plan.optionToItem.set(slugOf(item), item)
    }
    criteria[SOMETHING_ELSE] =
      'Something else, such as people, children, ages, days, weeks, money, a size, or the weight of a package'
    mentions.forEach((mention, index) => {
      const questionId = `number #${index + 1}`
      questions[questionId] = {
        type: 'choice',
        instructions: `What does the number \`numbers[${index}].value\` count, where it appears in brackets in \`numbers[${index}].context\`?`,
        criteria,
      }
      plan.numbers.push({questionId, mention})
    })
  }
  return plan
}

export function catalogState(title: string, story: string, mentions: NumberMention[]): EntryType {
  return {request: {title, story}, numbers: mentions}
}

type Answers = SystemOneResult<Questions>['answers']

function noulOf(answers: Answers, id: string): number | null {
  const answer = answers[id] as NoulResponse | undefined
  return answer?.type === 'noul' && Number.isFinite(answer.noul) ? answer.noul : null
}

/** Code, not the model, turns the answers into a proposal. */
export function proposeChecklist(plan: CatalogPlan, answers: Answers, minProbability: number): ProposedLine[] {
  const lines: ProposedLine[] = plan.items
    .map(({questionId, item}) => ({item, probability: noulOf(answers, questionId)}))
    .filter((entry): entry is {item: CatalogItem; probability: number} =>
      entry.probability !== null && entry.probability >= minProbability,
    )
    .sort((a, b) => b.probability - a.probability)
    .slice(0, MAX_CHECKLIST_LINES)
    .map(({item, probability}) => ({
      supplyItemId: item._id,
      name: item.name,
      unit: item.unit,
      maxPerHousehold: item.maxPerHousehold,
      probability,
      quantity: 1,
      quantityFrom: null,
    }))

  const byId = new Map(lines.map((line) => [line.supplyItemId, line]))
  for (const {questionId, mention} of plan.numbers) {
    const answer = answers[questionId] as ChoiceResponse | undefined
    if (answer?.type !== 'choice' || answer.choice === SOMETHING_ELSE) continue
    const probability = answer.probabilities[answer.choice]
    const item = plan.optionToItem.get(answer.choice)
    const line = item ? byId.get(item._id) : undefined
    if (!line || typeof probability !== 'number' || probability < minProbability) continue
    if (!line.quantityFrom || probability > line.quantityFrom.probability) {
      line.quantityFrom = {value: mention.value, probability, capped: mention.value > line.maxPerHousehold}
      line.quantity = Math.min(mention.value, line.maxPerHousehold)
    }
  }
  return lines
}

export function catalogOutcome(lines: ProposedLine[]): string {
  return lines.length === 1 ? 'proposed 1 item' : `proposed ${lines.length} items`
}
