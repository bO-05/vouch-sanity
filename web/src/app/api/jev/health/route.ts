import {choice, noul} from '@typesafe-ai/sdk'
import {askJev, isJevConfigured} from '@/lib/jev'
import {CATEGORY_CRITERIA_QUERY, type CategoryCriterion} from '@/lib/queries'
import {checkRateLimit} from '@/lib/rate-limit'
import {client} from '@/lib/sanity/client'
import {isValidVerifierPasscode} from '@/lib/verifier'

/** A fixed, made-up plea: no real person's words are used for health checks. */
const SAMPLE_PLEA =
  'Sample request for a Vouch health check: My two kids and I are out of groceries until payday next Friday. Rice, beans and some milk would help us get through the week.'

/**
 * One real Jev call, recorded as a `decision` (kind health_check).
 * Passcode-protected so strangers can't spend API calls or fill the dataset, and every attempt
 * counts against the network's passcode limit (shared with the desk sign-in), so it can't be used
 * to guess the passcode either.
 * POST with header `x-verifier-passcode`.
 */
export async function POST(request: Request) {
  const limit = await checkRateLimit('passcode', request.headers)
  if (!limit.ok) {
    return Response.json(
      {ok: false, error: limit.message},
      {status: limit.reason === 'limited' ? 429 : 503, headers: {'retry-after': String(limit.retryAfterSeconds)}},
    )
  }
  if (!isValidVerifierPasscode(request.headers.get('x-verifier-passcode'))) {
    return Response.json({ok: false, error: 'Unauthorized'}, {status: 401})
  }
  if (!isJevConfigured()) {
    return Response.json(
      {ok: false, error: 'TYPESAFE_API_KEY is not configured on this server. No call was made.'},
      {status: 503},
    )
  }

  const categories = await client
    .withConfig({useCdn: false})
    .fetch<CategoryCriterion[]>(CATEGORY_CRITERIA_QUERY)
  if (categories.length === 0) {
    return Response.json({ok: false, error: 'No categories found in Sanity.'}, {status: 500})
  }

  // Category descriptions are content: edit them in the Studio and Jev's options change.
  const criteria: Record<string, string> = Object.fromEntries(
    categories.map((category) => [category.slug, category.description]),
  )
  criteria.unclear = 'None of the other options fits, or the text is not a request for help.'

  const result = await askJev({
    kind: 'health_check',
    state: {request: SAMPLE_PLEA},
    questions: {
      category: choice('Which kind of help does `request` ask for?', criteria),
      material_request: noul(
        'Is `request` asking for material goods or supplies for a person or household?',
      ),
    },
    decide: () => 'health_check_ok',
  })

  if (!result.ok) {
    return Response.json(
      {ok: false, error: result.error, decisionId: result.decisionId},
      {status: result.status === 401 ? 502 : 503},
    )
  }

  return Response.json({
    ok: true,
    decisionId: result.decisionId,
    model: result.model,
    latencyMs: result.latencyMs,
    answers: result.answers,
  })
}
