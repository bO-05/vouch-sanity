import 'server-only'

import {createHash} from 'node:crypto'
import {
  APIError,
  TypeSafeClient,
  type EntryType,
  type Questions,
  type SystemOneResult,
} from '@typesafe-ai/sdk'
import {getWriteClient} from '@/lib/sanity/write-client'

/**
 * Jev (TypeSafe's System One model) answers narrow, typed questions with probabilities.
 * It never writes text. Code decides what to do with the answers, and every call
 * (including failed ones) is recorded as a `decision` document in Sanity.
 */

/** Pin a version (e.g. jev-1.13.0) once thresholds are tuned. */
export const JEV_MODEL = process.env.JEV_MODEL?.trim() || 'jev-latest'

export type DecisionKind = 'catalog_match' | 'triage' | 'duplicate' | 'proof_match' | 'health_check'

export function isJevConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim())
}

let cachedClient: TypeSafeClient | null = null

function getJevClient(): TypeSafeClient {
  cachedClient ??= new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY?.trim(),
    defaultModel: JEV_MODEL,
    timeout: 8_000,
    retry: {maxRetries: 1},
    logLevel: 'off',
  })
  return cachedClient
}

export type AskJevInput<Q extends Questions> = {
  kind: DecisionKind
  /** Base `_id` of the need or proof this decision is about (never a `drafts.` id). */
  subjectId?: string
  state: EntryType
  questions: Q
  /** Pure function (code, not the model) that turns the answers into an outcome label. */
  decide: (answers: SystemOneResult<Q>['answers']) => string
}

export type AskJevResult<Q extends Questions> =
  | {
      ok: true
      decisionId: string
      model: string
      answers: SystemOneResult<Q>['answers']
      outcome: string
      latencyMs: number
    }
  | {ok: false; decisionId: string | null; error: string; status?: number}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function describeError(error: unknown): {message: string; status?: number} {
  if (error instanceof APIError) {
    return {message: `TypeSafe API error ${error.status}: ${error.message}`, status: error.status}
  }
  if (error instanceof Error) return {message: error.message}
  return {message: 'Unknown error'}
}

/**
 * Ask Jev, then record the call. If the call fails, the failure is recorded and returned;
 * nothing is guessed. If the decision can't be recorded, the result is treated as a failure
 * too, because an unrecorded decision must never drive a state change.
 */
export async function askJev<const Q extends Questions>(
  input: AskJevInput<Q>,
): Promise<AskJevResult<Q>> {
  if (!isJevConfigured()) {
    return {ok: false, decisionId: null, error: 'TYPESAFE_API_KEY is not configured on this server.'}
  }

  const writeClient = getWriteClient()
  const base = {
    _type: 'decision' as const,
    kind: input.kind,
    ...(input.subjectId
      ? {subject: {_type: 'reference' as const, _ref: input.subjectId, _weak: true}}
      : {}),
    questions: JSON.stringify(input.questions, null, 2),
    stateDigest: digest(input.state),
    createdAt: new Date().toISOString(),
  }

  const started = performance.now()
  let result: SystemOneResult<Q>
  try {
    result = await getJevClient().systemOne({state: input.state, questions: input.questions})
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started)
    const {message, status} = describeError(error)
    try {
      const doc = await writeClient.create({
        ...base,
        model: JEV_MODEL,
        outcome: 'error',
        error: message.slice(0, 500),
        latencyMs,
      })
      return {ok: false, decisionId: doc._id, error: message, status}
    } catch (recordError) {
      return {
        ok: false,
        decisionId: null,
        error: `${message} (and the failure could not be recorded: ${describeError(recordError).message})`,
        status,
      }
    }
  }

  const latencyMs = Math.round(performance.now() - started)
  const outcome = input.decide(result.answers)
  try {
    const doc = await writeClient.create({
      ...base,
      model: result.model,
      answers: JSON.stringify(result.answers, null, 2),
      outcome,
      latencyMs,
      inputTokens: result.usage.input_tokens,
    })
    return {ok: true, decisionId: doc._id, model: result.model, answers: result.answers, outcome, latencyMs}
  } catch (recordError) {
    return {
      ok: false,
      decisionId: null,
      error: `Jev answered, but the decision could not be recorded: ${describeError(recordError).message}`,
    }
  }
}
