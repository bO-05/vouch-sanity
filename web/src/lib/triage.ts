import type {ChoiceResponse, EntryType, NoulResponse, Questions, ScoreResponse, SystemOneResult} from '@typesafe-ai/sdk'

/**
 * Triage: one fan-out call to Jev when a request is submitted, then a gate written in code.
 *
 * Jev answers narrow questions (which category, how urgent, which language, and one yes/no per
 * policy flag). Code compares the answers with the policy thresholds and decides:
 * publish automatically, send to a volunteer (with reasons composed here, never by a model),
 * or show emergency resources and send to a volunteer. The words and numbers of the policy live in
 * Sanity, so a verifier can retune them in the Studio without a redeploy.
 *
 * Pure module (no runtime imports), shared by the app and scripts/calibrate-triage.ts.
 */

export type FlagRoute = 'review' | 'emergency'

export type FlagQuestion = {
  code: string
  label: string
  question: string
  routesTo: FlagRoute
  /** Overrides the global maxFlagProbability for this flag. */
  threshold: number | null
  enabled: boolean
}

export type PolicyThresholds = {
  catalogMinProbability: number
  triageMinConfidence: number
  maxFlagProbability: number
  proofMinMatchProbability: number
  proofMinCoverage: number
  receiptMinProbability: number
}

export type Policy = {
  thresholds: PolicyThresholds
  urgencyLevels: [string, string, string, string]
  flagQuestions: FlagQuestion[]
  emergencyResources: string
}

export type CategoryOption = {_id: string; slug: string; title: string; description: string}

export type TriageRequest = {
  title: string
  story: string
  city: string
  country: string
  /** Checklist lines as the requester picked them, e.g. "2 × Rice (5 lb bag)". */
  checklist: string[]
}

export type TriageRoute = 'publish' | 'review' | 'emergency'

export type TriageVerdict = {
  route: TriageRoute
  /** Why it went to a person. Composed by code from the answers and the policy. */
  reasons: string[]
  /** Every enabled flag with Jev's probability. */
  flags: Array<{code: string; label: string; probability: number; fired: boolean}>
  minConfidence: number | null
  /** null when Jev picked "unclear" (or the answer was missing). */
  category: {slug: string; confidence: number} | null
  /** Rounded to the nearest level (0-3); `score` is Jev's expected level. */
  urgency: {level: number; score: number; confidence: number} | null
  language: {code: string; confidence: number} | null
}

export const UNCLEAR = 'unclear'
const THRESHOLD_NAMES: Array<keyof PolicyThresholds> = [
  'catalogMinProbability',
  'triageMinConfidence',
  'maxFlagProbability',
  'proofMinMatchProbability',
  'proofMinCoverage',
  'receiptMinProbability',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

/**
 * Validate the policy document. A missing or broken policy must never lead to an automatic
 * publish, so the caller routes to a person when this fails.
 */
export function parsePolicy(raw: unknown): {ok: true; policy: Policy} | {ok: false; problem: string} {
  if (!isRecord(raw)) return {ok: false, problem: 'The policy document is missing.'}
  const thresholds = isRecord(raw.thresholds) ? raw.thresholds : {}
  for (const name of THRESHOLD_NAMES) {
    if (!isProbability(thresholds[name])) {
      return {ok: false, problem: `The policy threshold "${name}" is missing or not between 0 and 1.`}
    }
  }
  const levels = raw.urgencyLevels
  if (!Array.isArray(levels) || levels.length !== 4 || !levels.every((l) => typeof l === 'string' && l.trim())) {
    return {ok: false, problem: 'The policy needs exactly four urgency levels.'}
  }
  if (typeof raw.emergencyResources !== 'string' || !raw.emergencyResources.trim()) {
    return {ok: false, problem: 'The policy has no emergency resources text.'}
  }
  const flags: FlagQuestion[] = []
  for (const flag of Array.isArray(raw.flagQuestions) ? raw.flagQuestions : []) {
    if (!isRecord(flag)) continue
    const {code, label, question, routesTo, threshold, enabled} = flag
    if (typeof code !== 'string' || typeof label !== 'string' || typeof question !== 'string') {
      return {ok: false, problem: 'A policy flag question is missing its code, label or question.'}
    }
    if (threshold !== undefined && threshold !== null && !isProbability(threshold)) {
      return {ok: false, problem: `The threshold of the flag "${code}" is not between 0 and 1.`}
    }
    flags.push({
      code,
      label,
      question,
      routesTo: routesTo === 'emergency' ? 'emergency' : 'review',
      threshold: isProbability(threshold) ? threshold : null,
      enabled: enabled !== false,
    })
  }
  return {
    ok: true,
    policy: {
      thresholds: thresholds as PolicyThresholds,
      urgencyLevels: levels as Policy['urgencyLevels'],
      flagQuestions: flags,
      emergencyResources: raw.emergencyResources,
    },
  }
}

export function triageState(request: TriageRequest): EntryType {
  return {
    request: {
      title: request.title,
      story: request.story,
      city: request.city,
      country: request.country,
    },
    checklist: request.checklist,
  }
}

function flagQuestionId(code: string): string {
  return `flag: ${code}`
}

/** Question ids are readable because they appear in the public trail. */
export function buildTriageQuestions(
  policy: Policy,
  categories: CategoryOption[],
  languages: Record<string, string>,
): Questions {
  const categoryCriteria: Record<string, string> = Object.fromEntries(
    categories.map((category) => [category.slug, category.description]),
  )
  categoryCriteria[UNCLEAR] =
    'None of the other options fits, or `request` is not asking for household goods or supplies.'

  const languageCriteria: Record<string, string> = Object.fromEntries(
    Object.entries(languages).map(([code, label]) => [
      code,
      code === 'other' ? 'Another language, or a mix of languages' : label,
    ]),
  )

  const questions: Questions = {
    category: {
      type: 'choice',
      instructions:
        'Which kind of help does `request` mainly ask for? `checklist` lists the items the person picked from the catalog.',
      criteria: categoryCriteria,
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent is the need described in `request`?',
      criteria: policy.urgencyLevels,
    },
    language: {
      type: 'choice',
      instructions: 'Which language is `request.story` written in?',
      criteria: languageCriteria,
    },
  }
  for (const flag of policy.flagQuestions) {
    if (flag.enabled) questions[flagQuestionId(flag.code)] = {type: 'noul', instructions: flag.question}
  }
  return questions
}

type Answers = SystemOneResult<Questions>['answers']

const p2 = (value: number) => value.toFixed(2)

/**
 * The gate. Code owns every rule here; Jev only supplied the numbers.
 *
 * Calibrated on Sep 27 (scripts/calibrate-triage.ts): the trust questions are the flags, an
 * "unclear" category and the language. Urgency is NOT a trust question: legitimate pleas often sit
 * between two levels, so its confidence is naturally low, and gating on it alone sent 11 of 16 clear
 * pleas to a volunteer for no reason. It only orders the feed. A low-confidence category leaves the
 * category empty instead of blocking (a request for soap, rice and a blanket is fine).
 */
export function gateTriage(
  answers: Answers,
  policy: Policy,
  categories: CategoryOption[],
  languages: Record<string, string>,
): TriageVerdict {
  const {triageMinConfidence: minConfidence, maxFlagProbability} = policy.thresholds
  const reasons: string[] = []
  const confidences: number[] = []

  // Flags first: they are the trust questions.
  const flags: TriageVerdict['flags'] = []
  let emergency = false
  for (const flag of policy.flagQuestions.filter((f) => f.enabled)) {
    const answer = answers[flagQuestionId(flag.code)] as NoulResponse | undefined
    if (answer?.type !== 'noul' || !Number.isFinite(answer.noul)) {
      reasons.push(`Jev gave no answer for the flag “${flag.label}”.`)
      continue
    }
    const cut = flag.threshold ?? maxFlagProbability
    const fired = answer.noul >= cut
    flags.push({code: flag.code, label: flag.label, probability: answer.noul, fired})
    if (fired) {
      if (flag.routesTo === 'emergency') emergency = true
      reasons.push(
        `Jev flagged “${flag.label}” (p = ${p2(answer.noul)}; the policy sends anything at or above ${p2(cut)} to a volunteer).`,
      )
    }
  }

  let category: TriageVerdict['category'] = null
  const categoryAnswer = answers.category as ChoiceResponse | undefined
  if (categoryAnswer?.type !== 'choice') {
    reasons.push('Jev gave no answer for the kind of help.')
  } else {
    confidences.push(categoryAnswer.confidence)
    if (categoryAnswer.choice === UNCLEAR) {
      reasons.push(
        `Jev couldn't match this to a kind of help Vouch supports (“unclear”, p = ${p2(categoryAnswer.probabilities[UNCLEAR] ?? 0)}).`,
      )
    } else if (!categories.some((c) => c.slug === categoryAnswer.choice)) {
      reasons.push('Jev picked a kind of help that is no longer in the catalog.')
    } else if (categoryAnswer.confidence >= minConfidence) {
      category = {slug: categoryAnswer.choice, confidence: categoryAnswer.confidence}
    }
    // Otherwise the category stays empty; a volunteer can set one. It doesn't block publishing.
  }

  let urgency: TriageVerdict['urgency'] = null
  const urgencyAnswer = answers.urgency as ScoreResponse | undefined
  if (urgencyAnswer?.type === 'score' && Number.isFinite(urgencyAnswer.score)) {
    const level = Math.min(3, Math.max(0, Math.round(urgencyAnswer.score)))
    urgency = {level, score: urgencyAnswer.score, confidence: urgencyAnswer.confidence}
  }

  let language: TriageVerdict['language'] = null
  const languageAnswer = answers.language as ChoiceResponse | undefined
  if (languageAnswer?.type !== 'choice') {
    reasons.push('Jev gave no answer for the language.')
  } else {
    confidences.push(languageAnswer.confidence)
    language = {code: languageAnswer.choice, confidence: languageAnswer.confidence}
    if (languageAnswer.choice !== 'en') {
      const label = languages[languageAnswer.choice] ?? languageAnswer.choice
      reasons.push(
        `Written in ${languageAnswer.choice === 'other' ? 'a language other than English' : label}, so a bilingual volunteer checks it (Jev is strongest in English).`,
      )
    } else if (languageAnswer.confidence < minConfidence) {
      reasons.push(
        `Jev wasn't sure the request is in English (confidence ${p2(languageAnswer.confidence)}; the policy needs ${p2(minConfidence)}).`,
      )
    }
  }

  const route: TriageRoute = emergency ? 'emergency' : reasons.length > 0 ? 'review' : 'publish'
  return {
    route,
    reasons,
    flags,
    minConfidence: confidences.length > 0 ? Math.min(...confidences) : null,
    category,
    urgency,
    language,
  }
}

/** Outcome label stored on the `decision`: what code decided from Jev's answers. */
export function triageDecisionOutcome(verdict: TriageVerdict): string {
  return verdict.route === 'publish' ? 'passed_gate' : verdict.route === 'emergency' ? 'emergency' : 'needs_review'
}
