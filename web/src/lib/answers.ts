/**
 * Turns the typed answers stored on a `decision` (JSON text) into short display rows.
 * Formatting only: the numbers are Jev's, unchanged, and nothing is inferred.
 */

export type AnswerRow = {question: string; answer: string}

type Probabilities = Record<string, number>

/** Catalog-match decisions ask one yes/no per catalog item; only the plausible ones are listed. */
const CATALOG_SHOW_AT = 0.1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function p(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '?'
}

function describe(answer: unknown): string {
  if (!isRecord(answer)) return JSON.stringify(answer)
  switch (answer.type) {
    case 'noul':
      return `yes with p = ${p(answer.noul)}`
    case 'choice': {
      const probabilities = isRecord(answer.probabilities) ? (answer.probabilities as Probabilities) : {}
      const choice = String(answer.choice)
      return `“${choice}”, p = ${p(probabilities[choice] ?? answer.confidence)}`
    }
    case 'score': {
      const levels = isRecord(answer.probabilities) ? Object.keys(answer.probabilities).length : 0
      const scale = levels > 1 ? ` on 0–${levels - 1}` : ''
      return `${p(answer.score)}${scale}, confidence ${p(answer.confidence)}`
    }
    default:
      return JSON.stringify(answer)
  }
}

function catalogRows(entries: Array<[string, unknown]>): AnswerRow[] {
  const nouls = entries.filter(([, answer]) => isRecord(answer) && answer.type === 'noul') as Array<
    [string, {noul: number}]
  >
  const shown = nouls.filter(([, answer]) => answer.noul >= CATALOG_SHOW_AT).sort((a, b) => b[1].noul - a[1].noul)
  const others = entries.filter(([, answer]) => !(isRecord(answer) && answer.type === 'noul'))
  const hidden = nouls.length - shown.length
  return [
    ...shown.map(([question, answer]) => ({question, answer: describe(answer)})),
    ...(hidden > 0
      ? [{question: `${hidden} other catalog items`, answer: `each below p = ${CATALOG_SHOW_AT.toFixed(2)}`}]
      : []),
    ...others.map(([question, answer]) => ({question, answer: describe(answer)})),
  ]
}

/** Proof-match decisions ask one choice per receipt line; lines that bought nothing on the checklist are counted. */
function proofRows(entries: Array<[string, unknown]>): AnswerRow[] {
  let otherProduct = 0
  let notProduct = 0
  const rows: AnswerRow[] = []
  for (const [question, answer] of entries) {
    if (isRecord(answer) && answer.type === 'choice' && answer.choice === 'other_product') otherProduct++
    else if (isRecord(answer) && answer.type === 'choice' && answer.choice === 'not_a_product') notProduct++
    else rows.push({question, answer: describe(answer)})
  }
  if (otherProduct + notProduct > 0) {
    rows.push({
      question: `${otherProduct + notProduct} other receipt lines`,
      answer: `${otherProduct} “another product”, ${notProduct} “not a product” (store, totals, payment…)`,
    })
  }
  return rows
}

/** Returns null when the text isn't valid answers JSON, so the caller can show it raw. */
export function answerRows(answersJson: string | null, kind?: string): AnswerRow[] | null {
  if (!answersJson) return []
  try {
    const parsed: unknown = JSON.parse(answersJson)
    if (!isRecord(parsed)) return null
    const entries = Object.entries(parsed)
    if (kind === 'catalog_match') return catalogRows(entries)
    if (kind === 'proof_match') return proofRows(entries)
    return entries.map(([question, answer]) => ({question, answer: describe(answer)}))
  } catch {
    return null
  }
}
