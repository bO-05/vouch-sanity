import 'server-only'

import {after} from 'next/server'
import {errorMessage} from '@/lib/intake-context'
import {getWriteClient} from '@/lib/sanity/write-client'
import {drainLifecycle, startLifecycle} from './engine'

/**
 * Moves a request's lifecycle forward after the response is sent (Next.js `after`, Vercel
 * `waitUntil`). Each engine commit waits for Sanity's sync visibility (~0.8 s), so a full check takes
 * seconds; the requester already has their private link and watches the real stages on it.
 *
 * If the engine fails, the failure is written onto the draft (a volunteer takes over) and the desk
 * shows the stuck instance with a retry button. Nothing is ever marked as passed.
 */
export function advanceLater(needId: string, mode: 'start' | 'drain'): void {
  after(async () => {
    try {
      if (mode === 'start') await startLifecycle(needId)
      await drainLifecycle(needId)
    } catch (error) {
      await noteLifecycleFailure(needId, error).catch(() => {})
    }
  })
}

/** Only touches a draft that is still waiting for its automatic check. */
async function noteLifecycleFailure(needId: string, error: unknown): Promise<void> {
  const client = getWriteClient()
  const draft = await client.getDocument<{_rev: string; stage?: string}>(`drafts.${needId}`)
  if (!draft || draft.stage !== 'triage') return
  await client
    .patch(`drafts.${needId}`)
    .ifRevisionId(draft._rev)
    .set({
      stage: 'review',
      triage: {
        _type: 'triageSummary',
        outcome: 'error',
        reasons: [`The automatic check didn't finish (${errorMessage(error)}). A volunteer will review this request instead.`],
        flags: [],
        decidedAt: new Date().toISOString(),
      },
    })
    .commit({visibility: 'async', tag: 'vouch.lifecycle.failed'})
}
