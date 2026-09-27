'use client'

import Link from 'next/link'
import {useEffect, useMemo, useState, useSyncExternalStore} from 'react'
import {EmergencyResources, ReasonList} from '@/components/triage-notes'
import {timeAgo} from '@/lib/format'
import {forgetRequest, parseSavedRequests, SAVED_REQUESTS_KEY, statusPath} from '@/lib/saved-requests'
import type {RequestStatus, StatusLookup} from '@/lib/status'
import {REVIEW_ACTION_LABELS, STAGE_LABELS, TRIAGE_OUTCOME_LABELS} from '@/lib/vocab'
import {statusAction} from './actions'

const PENDING_STAGES = new Set(['intake', 'triage', 'review', 'sent_back'])
const POLL_MS = 20_000

function subscribeHash(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

function subscribeStorage(callback: () => void) {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

export function StatusView() {
  // The token lives in the URL fragment, which browsers never send to a server.
  const token = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1) || null, () => null)
  // Re-read on every render (cheap); the string snapshot only changes when the list does.
  const savedRaw = useSyncExternalStore(subscribeStorage, () => localStorage.getItem(SAVED_REQUESTS_KEY), () => null)
  const saved = useMemo(() => parseSavedRequests(savedRaw), [savedRaw])
  const [lookup, setLookup] = useState<{token: string; result: StatusLookup} | null>(null)

  const current = lookup && lookup.token === token ? lookup.result : null
  const live = !current || (current.ok && PENDING_STAGES.has(current.status.stage))

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const load = async () => {
      try {
        const result = await statusAction(token)
        if (!cancelled) setLookup({token, result})
      } catch (error) {
        if (!cancelled) {
          setLookup({
            token,
            result: {ok: false, message: `The server couldn't be reached: ${error instanceof Error ? error.message : 'unknown error'}`},
          })
        }
      }
    }
    void load()
    const timer = live
      ? setInterval(() => {
          if (document.visibilityState === 'visible') void load()
        }, POLL_MS)
      : null
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [token, live])

  if (!token) {
    return (
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Saved in this browser</h2>
        {saved.length === 0 ? (
          <p className="text-sm text-muted">
            No requests are saved in this browser. If you asked for help on another device, open the private link you
            saved then. <Link href="/ask" className="text-amber hover:underline">Ask for help</Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {saved.map((entry) => (
              <li key={entry.needId} className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={statusPath(entry.token)} className="font-medium hover:text-amber">
                  {entry.title}
                </a>
                <span className="text-xs text-muted">submitted {timeAgo(entry.submittedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  if (!current) {
    return <p className="text-sm text-muted" aria-live="polite">Loading your request…</p>
  }
  if (!current.ok) {
    return (
      <div role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 text-sm">
        <p className="font-medium text-danger">{current.message}</p>
      </div>
    )
  }

  return (
    <StatusDetails
      status={current.status}
      onForget={() => {
        forgetRequest(current.status.needId)
        // Clearing the fragment fires `hashchange`, which re-renders and re-reads the saved list.
        window.location.hash = ''
      }}
    />
  )
}

function StatusDetails({status, onForget}: {status: RequestStatus; onForget: () => void}) {
  const pending = PENDING_STAGES.has(status.stage)
  const sentBack = status.reviews.filter((review) => review.action === 'send_back').at(-1)
  const rejected = status.reviews.filter((review) => review.action === 'reject').at(-1)

  return (
    <div className="flex flex-col gap-6">
      {status.emergencyResources ? <EmergencyResources text={status.emergencyResources} /> : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-soft px-2.5 py-1 text-xs font-medium text-amber">
            {STAGE_LABELS[status.stage] ?? status.stage}
          </span>
          {status.submittedAt ? <span className="text-xs text-muted">submitted {timeAgo(status.submittedAt)}</span> : null}
        </div>
        <h2 className="text-2xl font-semibold">{status.title}</h2>

        {status.published ? (
          <>
            <p className="text-muted">
              Verified and public{status.publishedAt ? ` since ${timeAgo(status.publishedAt)}` : ''}. Neighbors can pledge
              items from your checklist.
            </p>
            <Link
              href={`/requests/${status.needId}`}
              className="self-start rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-background"
            >
              See the public page
            </Link>
          </>
        ) : status.stage === 'triage' || status.stage === 'intake' ? (
          <p className="text-muted">Jev is checking your request. This usually takes a few seconds.</p>
        ) : status.stage === 'rejected' ? (
          <p className="text-muted">A volunteer verifier decided Vouch can&apos;t take this request.</p>
        ) : status.stage === 'sent_back' ? (
          <p className="text-muted">A volunteer verifier sent your request back with a question (below).</p>
        ) : (
          <p className="text-muted">
            A volunteer verifier will look at it. Until a verifier approves it, it stays a private draft that only you
            (with this link) and verifiers can see.
          </p>
        )}

        {!status.published && status.triage?.reasons?.length ? <ReasonList reasons={status.triage.reasons} /> : null}
        {status.triage?.outcome ? (
          <p className="text-xs text-muted">Triage: {TRIAGE_OUTCOME_LABELS[status.triage.outcome] ?? status.triage.outcome}</p>
        ) : null}
        {pending ? <p className="text-xs text-muted">This page checks for news every 20 seconds while it&apos;s open.</p> : null}
      </section>

      {sentBack || rejected ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-amber/40 bg-surface p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">From the verifier</h2>
          {[sentBack, rejected].filter(Boolean).map((review) => (
            <p key={review!._id} className="text-sm">
              <span className="font-medium">
                {review!.reviewerName}: {REVIEW_ACTION_LABELS[review!.action] ?? review!.action}
              </span>
              {review!.note ? <span className="text-muted"> · {review!.note}</span> : null}
            </p>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">What you sent</h2>
        <blockquote lang={status.language ?? undefined} className="border-l-2 border-amber pl-4 leading-relaxed">
          <p className="whitespace-pre-wrap">{status.story}</p>
        </blockquote>
        <p className="text-sm text-muted">
          {status.displayName} · {status.city}, {status.country}
        </p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {status.items.map((item) => (
            <li key={item._key} className="flex justify-between gap-3">
              <span>
                {item.quantity} × {item.name ?? 'Unknown item'}
                {item.unit ? <span className="text-muted"> ({item.unit})</span> : null}
              </span>
              {status.published ? (
                <span className="font-mono text-xs text-muted">
                  {Math.min(item.pledged, item.quantity)}/{item.quantity} pledged
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <button type="button" onClick={onForget} className="self-start text-xs text-muted hover:text-danger">
        Forget this request in this browser
      </button>
    </div>
  )
}
