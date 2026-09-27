'use client'

import Link from 'next/link'
import {useCallback, useId, useMemo, useState, type ReactNode} from 'react'
import {EmergencyResources, ReasonList} from '@/components/triage-notes'
import type {CatalogItem} from '@/lib/catalog-match'
import type {CatalogMatchResult, SubmitResult} from '@/lib/intake'
import {ASK_LIMITS, askFieldProblem, tidyFields, type AskFields, type FieldProblem} from '@/lib/intake-rules'
import {saveRequest, statusPath} from '@/lib/saved-requests'
import {LANGUAGE_LABELS} from '@/lib/vocab'
import {matchCatalogAction, submitRequestAction} from './actions'
import {useDictation} from './use-dictation'

const MAX_LINES = 12

type Line = {
  supplyItemId: string
  quantity: number
  source: 'jev' | 'you'
  probability?: number
  fromWords?: {value: number; capped: boolean}
}

type MatchMeta = Extract<CatalogMatchResult, {ok: true}>
type Submitted = Extract<SubmitResult, {ok: true}>

const input =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted focus:border-amber/60 focus:outline-none'
const primaryButton =
  'rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-background transition-opacity disabled:opacity-60'
const secondaryButton =
  'rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-amber/60 disabled:opacity-60'

function Section({title, step, children}: {title: string; step: number; children: ReactNode}) {
  const id = `step-${step}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 id={id} className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">
        <span className="text-amber">{step}</span> · {title}
      </h2>
      {children}
    </section>
  )
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function AskForm({catalog, categoryOrder}: {catalog: CatalogItem[]; categoryOrder: string[]}) {
  const id = useId()
  const [fields, setFields] = useState<AskFields>({
    title: '',
    story: '',
    displayName: '',
    city: '',
    country: '',
    language: 'en',
  })
  const [problem, setProblem] = useState<FieldProblem | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [busy, setBusy] = useState<'match' | 'submit' | null>(null)
  const [match, setMatch] = useState<{meta: MatchMeta; words: string} | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  // Links the catalog-match decision (even a failed one) to the request when it's submitted.
  const [ticket, setTicket] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<Submitted | null>(null)
  const [savedOnDevice, setSavedOnDevice] = useState(false)
  const [addChoice, setAddChoice] = useState('')

  const byId = useMemo(() => new Map(catalog.map((item) => [item._id, item])), [catalog])
  const set = (name: keyof AskFields) => (value: string) => {
    setFields((current) => ({...current, [name]: value}))
    if (problem?.field === name) setProblem(null)
  }

  const appendDictation = useCallback((text: string) => {
    setFields((current) => ({
      ...current,
      story: (current.story.trimEnd() ? `${current.story.trimEnd()} ` : '') + text,
    }))
  }, [])
  const dictation = useDictation(fields.language, appendDictation)

  const words = `${fields.title}\n${fields.story}`
  const errorFor = (name: keyof AskFields) => (problem?.field === name ? problem.message : null)

  async function suggest() {
    const tidy = tidyFields(fields)
    const found = askFieldProblem(tidy, ['title', 'story'])
    setProblem(found)
    if (found) return
    setBusy('match')
    setMatchError(null)
    try {
      const result = await matchCatalogAction({title: tidy.title, story: tidy.story})
      if (result.ticket) setTicket(result.ticket)
      if (!result.ok) {
        setMatchError(result.message)
        setChecklistOpen(true)
        return
      }
      setMatch({meta: result, words})
      setLines((current) => {
        const mine = current.filter((line) => line.source === 'you')
        const proposed: Line[] = result.lines
          .filter((line) => !mine.some((m) => m.supplyItemId === line.supplyItemId))
          .map((line) => ({
            supplyItemId: line.supplyItemId,
            quantity: line.quantity,
            source: 'jev',
            probability: line.probability,
            ...(line.quantityFrom ? {fromWords: {value: line.quantityFrom.value, capped: line.quantityFrom.capped}} : {}),
          }))
        return [...proposed, ...mine].slice(0, MAX_LINES)
      })
      setChecklistOpen(true)
    } catch (error) {
      setMatchError(`The request didn't reach the server: ${error instanceof Error ? error.message : 'unknown error'}`)
      setChecklistOpen(true)
    } finally {
      setBusy(null)
    }
  }

  async function submit() {
    const tidy = tidyFields(fields)
    const found = askFieldProblem(tidy)
    setProblem(found)
    setSubmitError(null)
    if (found) {
      document.getElementById(`${id}-${found.field}`)?.focus()
      return
    }
    if (lines.length === 0) {
      setSubmitError('Add at least one item to your checklist.')
      return
    }
    setBusy('submit')
    try {
      const result = await submitRequestAction({
        ticket,
        ...tidy,
        lines: lines.map(({supplyItemId, quantity}) => ({supplyItemId, quantity})),
      })
      if (!result.ok) {
        setSubmitError(result.message)
        return
      }
      setSavedOnDevice(
        saveRequest({
          needId: result.needId,
          token: result.statusToken,
          title: tidy.title,
          submittedAt: new Date().toISOString(),
        }),
      )
      setSubmitted(result)
      window.scrollTo({top: 0, behavior: 'smooth'})
    } catch (error) {
      setSubmitError(`The request didn't reach the server: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      setBusy(null)
    }
  }

  if (submitted) return <SubmittedPanel result={submitted} title={tidyFields(fields).title} savedOnDevice={savedOnDevice} />

  const available = catalog.filter((item) => !lines.some((line) => line.supplyItemId === item._id))
  const groups = categoryOrder
    .map((category) => ({category, items: available.filter((item) => item.category === category)}))
    .filter((group) => group.items.length > 0)
  const selectedAdd = available.find((item) => item._id === addChoice) ?? null

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Section step={1} title="Your words">
        <Field id={`${id}-language`} label="Language you're writing in">
          <select
            id={`${id}-language`}
            value={fields.language}
            onChange={(event) => set('language')(event.target.value)}
            className={`${input} sm:max-w-xs`}
          >
            {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id={`${id}-title`}
          label="A short title"
          hint="For example: Groceries until my next paycheck"
          error={errorFor('title')}
        >
          <input
            id={`${id}-title`}
            value={fields.title}
            onChange={(event) => set('title')(event.target.value)}
            maxLength={ASK_LIMITS.title.max}
            aria-invalid={Boolean(errorFor('title'))}
            className={input}
          />
        </Field>

        <Field
          id={`${id}-story`}
          label="What's going on, and what would help?"
          error={errorFor('story') ?? dictation.error}
          hint={
            <>
              Stored exactly as it appears here: nobody (and no AI) rewrites, translates or summarizes it.{' '}
              {fields.story.length}/{ASK_LIMITS.story.max}
            </>
          }
        >
          <textarea
            id={`${id}-story`}
            value={fields.story}
            onChange={(event) => set('story')(event.target.value)}
            rows={6}
            maxLength={ASK_LIMITS.story.max}
            lang={fields.language === 'other' ? undefined : fields.language}
            aria-invalid={Boolean(errorFor('story'))}
            className={`${input} leading-relaxed`}
          />
          <div className="flex flex-wrap items-center gap-3">
            {dictation.supported ? (
              <button
                type="button"
                onClick={dictation.listening ? dictation.stop : dictation.start}
                aria-pressed={dictation.listening}
                className={`${secondaryButton} flex items-center gap-2 py-1.5`}
              >
                <span
                  aria-hidden
                  className={`inline-block h-2 w-2 rounded-full ${dictation.listening ? 'animate-pulse bg-danger' : 'bg-muted'}`}
                />
                {dictation.listening ? 'Stop dictating' : 'Dictate instead'}
              </button>
            ) : null}
            <p className="text-xs text-muted" aria-live="polite">
              {dictation.listening
                ? dictation.interim
                  ? `Hearing: “${dictation.interim}”`
                  : `Listening in ${LANGUAGE_LABELS[fields.language] ?? 'your language'}… check the text before you submit.`
                : dictation.supported
                  ? "Voice input uses your browser's speech recognition (in Chrome, the audio goes to Google to be transcribed)."
                  : "This browser has no speech recognition, so please type (Chrome, Edge and Safari support dictation)."}
            </p>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={`${id}-displayName`} label="Display name" hint="A first name or nickname" error={errorFor('displayName')}>
            <input
              id={`${id}-displayName`}
              value={fields.displayName}
              onChange={(event) => set('displayName')(event.target.value)}
              maxLength={ASK_LIMITS.displayName.max}
              autoComplete="nickname"
              aria-invalid={Boolean(errorFor('displayName'))}
              className={input}
            />
          </Field>
          <Field id={`${id}-city`} label="City" error={errorFor('city')}>
            <input
              id={`${id}-city`}
              value={fields.city}
              onChange={(event) => set('city')(event.target.value)}
              maxLength={ASK_LIMITS.city.max}
              autoComplete="address-level2"
              aria-invalid={Boolean(errorFor('city'))}
              className={input}
            />
          </Field>
          <Field id={`${id}-country`} label="Country" error={errorFor('country')}>
            <input
              id={`${id}-country`}
              value={fields.country}
              onChange={(event) => set('country')(event.target.value)}
              maxLength={ASK_LIMITS.country.max}
              autoComplete="country-name"
              aria-invalid={Boolean(errorFor('country'))}
              className={input}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">
          No surnames, phone numbers, emails or addresses: your display name and city are public once your request is
          verified. Goods and money never move through Vouch.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void suggest()} disabled={busy !== null} className={primaryButton}>
            {busy === 'match' ? 'Jev is reading the catalog…' : match ? 'Suggest again' : 'Suggest a checklist'}
          </button>
          {!checklistOpen ? (
            <button type="button" onClick={() => setChecklistOpen(true)} className={secondaryButton}>
              Pick items myself
            </button>
          ) : null}
        </div>
        <div aria-live="polite" className="flex flex-col gap-2">
          {matchError ? <p className="rounded-xl border border-danger/40 px-3 py-2 text-sm text-danger">{matchError}</p> : null}
          {match ? (
            <p className="text-xs text-muted">
              Jev answered {match.meta.checkedItems} yes/no questions (one per catalog item)
              {match.meta.numbersFound > 0
                ? ` and picked what each of the ${match.meta.numbersFound} number${match.meta.numbersFound === 1 ? '' : 's'} in your words counts`
                : ''}{' '}
              in {match.meta.latencyMs} ms ({match.meta.model}). It can only pick from the catalog; it can&apos;t invent
              items or numbers.
              {match.words !== words ? ' Your words changed since then: suggest again if you like.' : ''}
            </p>
          ) : null}
        </div>
      </Section>

      {checklistOpen ? (
        <Section step={2} title="Your checklist">
          {lines.length === 0 ? (
            <p className="text-sm text-muted">
              {match ? "Jev didn't match anything in the catalog to your words. " : ''}Add items from the catalog below.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lines.map((line) => {
                const item = byId.get(line.supplyItemId)
                if (!item) return null
                return (
                  <li
                    key={line.supplyItemId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {item.name} <span className="text-sm font-normal text-muted">({item.unit})</span>
                      </p>
                      <p className="text-xs text-muted">
                        {line.source === 'jev' && typeof line.probability === 'number'
                          ? `Matched by Jev from your words (p = ${line.probability.toFixed(2)})`
                          : 'Added by you'}
                        {line.fromWords
                          ? line.fromWords.capped
                            ? ` · you wrote ${line.fromWords.value}; one household can ask for up to ${item.maxPerHousehold}`
                            : ` · quantity ${line.fromWords.value} from your words`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`${id}-qty-${line.supplyItemId}`}>
                        How many {item.name}
                      </label>
                      <select
                        id={`${id}-qty-${line.supplyItemId}`}
                        value={line.quantity}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((l) =>
                              l.supplyItemId === line.supplyItemId ? {...l, quantity: Number(event.target.value)} : l,
                            ),
                          )
                        }
                        className="rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-sm"
                      >
                        {Array.from({length: item.maxPerHousehold}, (_, index) => index + 1).map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setLines((current) => current.filter((l) => l.supplyItemId !== line.supplyItemId))}
                        className="rounded-lg px-2 py-1 text-sm text-muted hover:text-danger"
                        aria-label={`Remove ${item.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {lines.length < MAX_LINES ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-add`} className="text-sm font-medium">
                Add an item from the catalog
              </label>
              <div className="flex flex-wrap gap-2">
                <select
                  id={`${id}-add`}
                  value={selectedAdd?._id ?? ''}
                  onChange={(event) => setAddChoice(event.target.value)}
                  className={`${input} min-w-0 flex-1`}
                >
                  <option value="">Choose an item…</option>
                  {groups.map((group) => (
                    <optgroup key={group.category} label={group.category}>
                      {group.items.map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedAdd}
                  onClick={() => {
                    if (!selectedAdd) return
                    setLines((current) => [...current, {supplyItemId: selectedAdd._id, quantity: 1, source: 'you'}])
                    setAddChoice('')
                  }}
                  className={secondaryButton}
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">A checklist can have up to {MAX_LINES} items.</p>
          )}
        </Section>
      ) : null}

      {checklistOpen ? (
        <div className="flex flex-col gap-3">
          <button type="submit" disabled={busy !== null} className={`${primaryButton} sm:self-start`}>
            {busy === 'submit' ? 'Jev is checking your request…' : 'Submit for verification'}
          </button>
          <p className="text-xs text-muted">
            Jev answers a few typed questions about your request (kind of help, urgency, language, and yes/no checks
            from Vouch&apos;s policy). If nothing needs a person, it goes live right away. Otherwise it stays private until
            a volunteer verifier looks at it.
          </p>
          <div aria-live="assertive">
            {submitError ? (
              <p className="rounded-xl border border-danger/40 px-3 py-2 text-sm text-danger">{submitError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  )
}

function SubmittedPanel({result, title, savedOnDevice}: {result: Submitted; title: string; savedOnDevice: boolean}) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}${statusPath(result.statusToken)}`

  return (
    <div className="flex flex-col gap-6">
      {result.route === 'emergency' && result.emergencyResources ? (
        <EmergencyResources text={result.emergencyResources} />
      ) : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-live="polite">
        {result.route === 'published' ? (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Verified and live</p>
            <h2 className="text-2xl font-semibold">“{title}” is published</h2>
            <p className="text-muted">
              Jev&apos;s answers passed every check in Vouch&apos;s policy, so your request went live automatically. Neighbors
              can pledge items from your checklist now.
            </p>
            <Link href={`/requests/${result.needId}`} className={`${primaryButton} self-start`}>
              See your request
            </Link>
          </>
        ) : (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Saved privately</p>
            <h2 className="text-2xl font-semibold">A volunteer will review “{title}”</h2>
            <p className="text-muted">
              Your request is saved as a private draft. Only you (with the link below) and volunteer verifiers can see it
              until a verifier approves it.
            </p>
            <ReasonList reasons={result.reasons} />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-amber/40 bg-surface p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Your private link</h2>
        <p className="text-sm text-muted">
          Save it: it&apos;s the only way back to your request while it&apos;s private, and the way a verifier&apos;s questions
          reach you. Anyone with the link can see the request, so don&apos;t share it.
          {savedOnDevice ? ' This browser remembers it too (My requests).' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <input readOnly value={link} aria-label="Private status link" className={`${input} min-w-0 flex-1 font-mono text-xs`} />
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              navigator.clipboard.writeText(link).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <Link href={statusPath(result.statusToken)} className={secondaryButton}>
            Open
          </Link>
        </div>
      </section>
    </div>
  )
}
