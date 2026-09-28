import 'server-only'

import {errorMessage} from '@/lib/intake-context'
import {readLifecycle, viewLifecycle, type LifecycleView} from '@/lib/lifecycle/engine'
import type {NeedReview} from '@/lib/queries'
import {getWriteClient} from '@/lib/sanity/write-client'

/**
 * The private half of a PUBLISHED request's trail: human reviews (stored under the private
 * `review.*` path because they may be about a draft) and its Sanity Workflows instance. Only call
 * this for a request that the public client already returned as published.
 *
 * A failed read is reported in `problems` (the page shows it), never passed off as "no reviews".
 */
export async function loadPrivateTrail(
  needId: string,
): Promise<{reviews: NeedReview[]; lifecycle: LifecycleView | null; problems: string[]}> {
  const problems: string[] = []
  const [reviews, instance] = await Promise.all([
    Promise.resolve()
      .then(() =>
        getWriteClient().fetch<NeedReview[]>(
          `*[_type == "review" && subject._ref == $id] | order(createdAt asc){_id, action, note, reviewerName, createdAt, "proof": proof._ref}`,
          {id: needId},
          {tag: 'vouch.trail.reviews', timeout: 15_000},
        ),
      )
      .catch((error: unknown) => {
        problems.push(`Volunteer reviews couldn't be loaded from Sanity (${errorMessage(error)}).`)
        return [] as NeedReview[]
      }),
    readLifecycle(needId).catch((error: unknown) => {
      problems.push(`The lifecycle couldn't be loaded from the workflow engine (${errorMessage(error)}).`)
      return null
    }),
  ])
  return {
    // A send-back or rejection note was written to the requester privately (it may mention words they
    // later removed), so the public trail shows the action only. Approval notes are public by design,
    // and so are receipt decisions: they are about the (public) receipt, and the uploader has no
    // private page to read them on.
    reviews: reviews.map((review) => (review.action === 'approve' || review.proof ? review : {...review, note: null})),
    lifecycle: instance ? viewLifecycle(instance) : null,
    problems,
  }
}
