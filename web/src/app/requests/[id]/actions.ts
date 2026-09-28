'use server'

import {refresh} from 'next/cache'
import {createPledge} from '@/lib/pledges'
import {checkRateLimit} from '@/lib/rate-limit'

export type PledgeRequest = {
  needId: string
  itemKey: string
  quantity: number
  donorDisplayName: string
}

export type PledgeFormState =
  | {status: 'idle'}
  | {status: 'ok'; message: string; at: number}
  | {status: 'error'; message: string; at: number}

/**
 * Server Action behind the pledge form. Like any Server Action it's a public POST endpoint,
 * so `createPledge` re-validates everything against Sanity; nothing from the client is trusted.
 * It's rate-limited per network first: fake pledges could fill a checklist and turn real donors away.
 */
export async function pledgeAction(
  _previous: PledgeFormState,
  request: PledgeRequest,
): Promise<PledgeFormState> {
  const limit = await checkRateLimit('pledge')
  if (!limit.ok) return {status: 'error', message: `${limit.message} The pledge was not recorded.`, at: Date.now()}

  const outcome = await createPledge(request)
  if (!outcome.ok) {
    return {status: 'error', message: outcome.message, at: Date.now()}
  }

  // Read-your-own-writes for the donor. Everyone else gets the change through Sanity Live.
  refresh()
  return {
    status: 'ok',
    message: `Thank you, ${outcome.donorDisplayName}! You pledged ${outcome.quantity} × ${outcome.itemName}. ${outcome.pledged} of ${outcome.requested} are now pledged.`,
    at: Date.now(),
  }
}
