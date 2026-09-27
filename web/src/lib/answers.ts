/**
 * Turns the typed answers stored on a `decision` (JSON text) into short display rows.
 * Formatting only: the numbers are Jev's, unchanged, and nothing is inferred.
 */

export type AnswerRow = {question: string; answer: string}

type Probabilities = Record<string, number>

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

/** Returns null when the text isn't valid answers JSON, so the caller can show it raw. */
export function answerRows(answersJson: string | null): AnswerRow[] | null {
  if (!answersJson) return []
  try {
    const parsed: unknown = JSON.parse(answersJson)
    if (!isRecord(parsed)) return null
    return Object.entries(parsed).map(([question, answer]) => ({question, answer: describe(answer)}))
  } catch {
    return null
  }
}
