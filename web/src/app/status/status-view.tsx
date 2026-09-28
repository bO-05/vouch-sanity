'use client'

import Link from 'next/link'
import {useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore} from 'react'
import {ChecklistEditor, type EditorLine} from '@/components/checklist-editor'
import {Field, inputClass, primaryButton} from '@/components/form'
import {LifecycleSteps} from '@/components/lifecycle-steps'
import {EmergencyResources, ReasonList} from '@/components/triage-notes'
import type {CatalogItem} from '@/lib/catalog-match'
import {timeAgo} from '@/lib/format'
import {ASK_LIMITS, askFieldProblem, tidyFields, type AskFields, type FieldProblem} from '@/lib/intake-rules'
import {forgetRequest, parseSavedRequests, SAVED_REQUESTS_KEY, statusPath} from '@/lib/saved-requests'
import type {RequestStatus, StatusLookup} from '@/lib/status'
import {LANGUAGE_LABELS, REVIEW_ACTION_LABELS, STAGE_LABELS, TRIAGE_OUTCOME_LABELS} from '@/lib/vocab'
import {resubmitAction, statusAction} from './actions'

/** Stages where the automatic part of the lifecycle is running: check often. */
const MOVING_STAGES = new Set(['intake', 'triage', 'publishing'])
/** Stages that wait for a person: check now and then. */
const WAITING_STAGES = new Set(['review', 'sent_back'])
const FAST_POLL_MS = 1_500
const SLOW_POLL_MS = 20_000

/** `catalogError` is set when the catalog couldn't be loaded (the edit form then says so). */
type Catalog = {catalog: CatalogItem[]; categoryOrder: string[]; catalogError?: string | null}

function subscribeHash(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

function subscribeStorage(callback: () => void) {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

export function StatusView({catalog, categoryOrder, catalogError}: Catalog) {
  // The token lives in the URL fragment, which browsers never send to a server.
  const token = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1) || null, () => null)
  // Re-read on every render (cheap); the string snapshot only changes when the list does.
  const savedRaw = useSyncExternalStore(subscribeStorage, () => localStorage.getItem(SAVED_REQUESTS_KEY), () => null)
  const saved = useMemo(() => parseSavedRequests(savedRaw), [savedRaw])

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

  return (
    <StatusTracker
      key={token}
      token={token}
      catalog={catalog}
      categoryOrder={categoryOrder}
      catalogError={catalogError}
      onForget={(needId) => {
        forgetRequest(needId)
        // Clearing the fragment fires `hashchange`, which re-renders and re-reads the saved list.
        window.location.hash = ''
      }}
    />
  )
}

function isMoving(status: RequestStatus): boolean {
  if (status.published && status.lifecycle?.stage !== 'publishing') return false
  return MOVING_STAGES.has(status.stage) || Boolean(status.lifecycle?.pending.length) || status.lifecycle?.stage === 'publishing'
}

/** Loads a request by its private token and keeps it current while the lifecycle moves. */
export function StatusTracker({
  token,
  catalog,
  categoryOrder,
  catalogError,
  onForget,
}: Catalog & {token: string; onForget?: (needId: string) => void}) {
  const [result, setResult] = useState<StatusLookup | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const pollMs =
    !result || (result.ok && isMoving(result.status))
      ? FAST_POLL_MS
      : result.ok && WAITING_STAGES.has(result.status.stage) && !result.status.published
        ? SLOW_POLL_MS
        : null

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const load = async () => {
      try {
        const next = await statusAction(token)
        if (!cancelled) setResult(next)
      } catch (error) {
        if (!cancelled) {
          setResult({ok: false, message: `The server couldn't be reached: ${error instanceof Error ? error.message : 'unknown error'}`})
        }
      }
    }
    const loop = async () => {
      if (document.visibilityState === 'visible') await load()
      if (!cancelled && pollMs) timer = setTimeout(loop, pollMs)
    }
    void loop()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [token, pollMs, refreshKey])

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), [])

  if (!result) return <p className="text-sm text-muted" aria-live="polite">Loading your request…</p>
  if (!result.ok) {
    return (
      <div role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 text-sm">
        <p className="font-medium text-danger">{result.message}</p>
      </div>
    )
  }
  return (
    <StatusDetails
      status={result.status}
      token={token}
      catalog={catalog}
      categoryOrder={categoryOrder}
      catalogError={catalogError}
      pollMs={pollMs}
      onResubmitted={refresh}
      onForget={onForget ? () => onForget(result.status.needId) : undefined}
    />
  )
}

function StatusSentence({status}: {status: RequestStatus}) {
  if (status.published) {
    return (
      <>
        <p className="text-muted">
          Verified and public{status.publishedAt ? ` since ${timeAgo(status.publishedAt)}` : ''}. Neighbors can pledge items
          from your checklist.
        </p>
        <Link href={`/requests/${status.needId}`} className={`${primaryButton} self-start`}>
          See the public page
        </Link>
      </>
    )
  }
  if (status.stage === 'triage' || status.stage === 'intake') {
    return (
      <p className="text-muted">
        {status.lifecycle
          ? status.lifecycle.stage === 'publishing'
            ? 'Jev found nothing that needs a person. Publishing it now…'
            : 'Jev is checking your request against Vouch’s policy. This takes a few seconds.'
          : 'Starting the check…'}
      </p>
    )
  }
  if (status.stage === 'rejected') return <p className="text-muted">A volunteer verifier decided Vouch can&apos;t take this request.</p>
  if (status.stage === 'sent_back') {
    return <p className="text-muted">A volunteer verifier sent your request back with a question. Edit it below and resubmit.</p>
  }
  return (
    <p className="text-muted">
      A volunteer verifier will look at it. Until a verifier approves it, it stays a private draft that only you (with this
      link) and verifiers can see.
    </p>
  )
}

function StatusDetails({
  status,
  token,
  catalog,
  categoryOrder,
  catalogError,
  pollMs,
  onResubmitted,
  onForget,
}: Catalog & {
  status: RequestStatus
  token: string
  pollMs: number | null
  onResubmitted: () => void
  onForget?: () => void
}) {
  const verifierNotes = status.reviews.filter((review) => review.action === 'send_back' || review.action === 'reject')
  const latestNote = verifierNotes.at(-1)

  return (
    <div className="flex flex-col gap-6">
      {status.emergencyResources ? <EmergencyResources text={status.emergencyResources} /> : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-soft px-2.5 py-1 text-xs font-medium text-amber">
            {status.published ? 'Verified and live' : (STAGE_LABELS[status.stage] ?? status.stage)}
          </span>
          {status.submittedAt ? <span className="text-xs text-muted">submitted {timeAgo(status.submittedAt)}</span> : null}
        </div>
        <h2 className="text-2xl font-semibold">{status.title}</h2>
        <StatusSentence status={status} />

        {status.lifecycle ? <LifecycleSteps lifecycle={status.lifecycle} /> : null}

        {!status.published && status.triage?.reasons?.length ? <ReasonList reasons={status.triage.reasons} /> : null}
        {status.triage?.outcome ? (
          <p className="text-xs text-muted">Triage: {TRIAGE_OUTCOME_LABELS[status.triage.outcome] ?? status.triage.outcome}</p>
        ) : null}
        {pollMs ? (
          <p className="text-xs text-muted">This page checks for news every {pollMs / 1000} seconds while it&apos;s open.</p>
        ) : null}
      </section>

      {latestNote ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-amber/40 bg-surface p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">From the verifier</h2>
          <p className="text-sm">
            <span className="font-medium">
              {latestNote.reviewerName}: {REVIEW_ACTION_LABELS[latestNote.action] ?? latestNote.action}
            </span>
            {latestNote.createdAt ? <span className="text-muted"> · {timeAgo(latestNote.createdAt)}</span> : null}
          </p>
          {latestNote.note ? <p className="whitespace-pre-wrap text-sm">{latestNote.note}</p> : null}
          <p className="text-xs text-muted">Written by a volunteer, shown only here (on your private page).</p>
        </section>
      ) : null}

      {status.stage === 'sent_back' && !status.published ? (
        <ResubmitForm
          status={status}
          token={token}
          catalog={catalog}
          categoryOrder={categoryOrder}
          catalogError={catalogError}
          onDone={onResubmitted}
        />
      ) : (
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
      )}

      {onForget ? (
        <button type="button" onClick={onForget} className="self-start text-xs text-muted hover:text-danger">
          Forget this request in this browser
        </button>
      ) : null}
    </div>
  )
}

function ResubmitForm({
  status,
  token,
  catalog,
  categoryOrder,
  catalogError,
  onDone,
}: Catalog & {status: RequestStatus; token: string; onDone: () => void}) {
  const id = useId()
  const inCatalog = new Set(catalog.map((item) => item._id))
  const [fields, setFields] = useState<AskFields>({
    title: status.title,
    story: status.story,
    displayName: status.displayName,
    city: status.city,
    country: status.country,
    language: status.language ?? 'en',
  })
  const [lines, setLines] = useState<EditorLine[]>(
    status.items
      .filter((item) => item.supplyItemId && inCatalog.has(item.supplyItemId))
      .map((item) => ({supplyItemId: item.supplyItemId as string, quantity: item.quantity})),
  )
  const dropped = status.items.length - lines.length
  const [problem, setProblem] = useState<FieldProblem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (name: keyof AskFields) => (value: string) => {
    setFields((current) => ({...current, [name]: value}))
    if (problem?.field === name) setProblem(null)
  }
  const errorFor = (name: keyof AskFields) => (problem?.field === name ? problem.message : null)

  async function submit() {
    const tidy = tidyFields(fields)
    const found = askFieldProblem(tidy)
    setProblem(found)
    setError(null)
    if (found) return
    if (lines.length === 0) {
      setError('Add at least one item to your checklist.')
      return
    }
    setBusy(true)
    try {
      const result = await resubmitAction(token, {...tidy, lines})
      if (!result.ok) setError(result.message)
      else onDone()
    } catch (reason) {
      setError(`The changes didn't reach the server: ${reason instanceof Error ? reason.message : 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Edit and resubmit</h2>
      <p className="text-sm text-muted">
        Your words are still yours: change only what you want. When you resubmit, Jev checks the new version from scratch,
        exactly like the first time.
      </p>
      <Field id={`${id}-title`} label="Title" error={errorFor('title')}>
        <input id={`${id}-title`} value={fields.title} onChange={(e) => set('title')(e.target.value)} maxLength={ASK_LIMITS.title.max} className={inputClass} />
      </Field>
      <Field id={`${id}-story`} label="Your words" error={errorFor('story')} hint={`${fields.story.length}/${ASK_LIMITS.story.max}`}>
        <textarea
          id={`${id}-story`}
          value={fields.story}
          onChange={(e) => set('story')(e.target.value)}
          rows={6}
          maxLength={ASK_LIMITS.story.max}
          lang={fields.language === 'other' ? undefined : fields.language}
          className={`${inputClass} leading-relaxed`}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-displayName`} label="Display name" error={errorFor('displayName')}>
          <input id={`${id}-displayName`} value={fields.displayName} onChange={(e) => set('displayName')(e.target.value)} maxLength={ASK_LIMITS.displayName.max} className={inputClass} />
        </Field>
        <Field id={`${id}-language`} label="Language">
          <select id={`${id}-language`} value={fields.language} onChange={(e) => set('language')(e.target.value)} className={inputClass}>
            {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-city`} label="City" error={errorFor('city')}>
          <input id={`${id}-city`} value={fields.city} onChange={(e) => set('city')(e.target.value)} maxLength={ASK_LIMITS.city.max} className={inputClass} />
        </Field>
        <Field id={`${id}-country`} label="Country" error={errorFor('country')}>
          <input id={`${id}-country`} value={fields.country} onChange={(e) => set('country')(e.target.value)} maxLength={ASK_LIMITS.country.max} className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Checklist</p>
        {catalogError ? (
          <div role="alert" className="rounded-xl border border-danger/40 px-3 py-2 text-sm">
            <p className="text-danger">
              The supply catalog couldn&apos;t be loaded from Sanity, so the checklist can&apos;t be edited right now. Reload the
              page to try again; nothing has changed on your request.
            </p>
            <p className="mt-1 font-mono text-xs text-muted">{catalogError}</p>
          </div>
        ) : (
          <>
            {dropped > 0 ? <p className="text-xs text-muted">{dropped} item(s) left the catalog and were removed.</p> : null}
            <ChecklistEditor
              id={id}
              catalog={catalog}
              categoryOrder={categoryOrder}
              lines={lines}
              onChange={setLines}
              newLine={(supplyItemId) => ({supplyItemId, quantity: 1})}
            />
          </>
        )}
      </div>
      <button type="submit" disabled={busy || Boolean(catalogError)} className={`${primaryButton} sm:self-start`}>
        {busy ? 'Saving your changes…' : 'Resubmit for verification'}
      </button>
      <div aria-live="assertive">{error ? <p className="rounded-xl border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p> : null}</div>
    </form>
  )
}
