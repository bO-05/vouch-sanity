import type {Metadata} from 'next'
import Link from 'next/link'
import type {ReactNode} from 'react'
import {LifecycleSteps} from '@/components/lifecycle-steps'
import {answerRows} from '@/lib/answers'
import {loadDesk, type DeskItem, type DeskState, type ProofDeskItem, type RecentReview} from '@/lib/desk'
import {receiptUnits, timeAgo} from '@/lib/format'
import {isVerifierConfigured, readVerifier} from '@/lib/verifier'
import {
  LANGUAGE_LABELS,
  LIFECYCLE_STAGE_LABELS,
  PROOF_REVIEW_ACTION_LABELS,
  PROOF_VERDICT_LABELS,
  REVIEW_ACTION_LABELS,
  TRIAGE_OUTCOME_LABELS,
  URGENCY_LABELS,
} from '@/lib/vocab'
import {DecisionPanel, ProofDecisionPanel, RecoveryPanel, SignInForm, SignOutButton} from './desk-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Verifier desk',
  description: 'Volunteer verifiers approve, send back or reject requests that Jev routed to a person.',
  robots: {index: false, follow: false},
}

function Chip({children, tone = 'plain'}: {children: ReactNode; tone?: 'plain' | 'amber' | 'danger' | 'outline'}) {
  const styles = {
    plain: 'bg-surface-2 text-muted',
    amber: 'bg-amber-soft text-amber',
    danger: 'bg-danger/10 text-danger',
    outline: 'border border-border text-muted',
  }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>{children}</span>
}

function DeskCard({item, state}: {item: DeskItem; state: DeskState}) {
  const rows = item.decision ? answerRows(item.decision.answers, 'triage') : null
  const language = item.language ?? 'en'
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {item.triage?.outcome === 'emergency' ? <Chip tone="danger">Possible emergency</Chip> : null}
        {item.triage?.outcome ? <Chip tone="amber">{TRIAGE_OUTCOME_LABELS[item.triage.outcome] ?? item.triage.outcome}</Chip> : null}
        {language !== 'en' ? <Chip>{LANGUAGE_LABELS[language] ?? language}</Chip> : null}
        {item.category ? <Chip>{item.category}</Chip> : null}
        {typeof item.urgency === 'number' ? <Chip>{URGENCY_LABELS[item.urgency]}</Chip> : null}
        {item.isDemo ? <Chip tone="outline">Demo</Chip> : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold">{item.title}</h3>
        <p className="text-sm text-muted">
          {item.displayName} · {item.city}, {item.country}
          {item.submittedAt ? ` · submitted ${timeAgo(item.submittedAt)}` : ''}
        </p>
      </div>

      <blockquote lang={language} className="border-l-2 border-amber pl-4 leading-relaxed">
        <p className="whitespace-pre-wrap">{item.story}</p>
      </blockquote>

      <ul className="flex flex-col gap-1 text-sm">
        {item.items.map((line) => (
          <li key={line._key}>
            {line.quantity} × {line.name ?? 'Unknown item'}
            {line.unit ? <span className="text-muted"> ({line.unit})</span> : null}
          </li>
        ))}
      </ul>

      {item.triage?.reasons?.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Why it came to a person</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {item.triage.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.decision ? (
        <details className="rounded-xl border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Jev&apos;s typed answers{' '}
            <span className="font-normal text-muted">
              ({[item.decision.model, typeof item.decision.latencyMs === 'number' ? `${item.decision.latencyMs} ms` : null].filter(Boolean).join(' · ')})
            </span>
          </summary>
          {item.decision.error ? <p className="mt-2 text-danger">{item.decision.error}</p> : null}
          {rows && rows.length > 0 ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {rows.map((row) => (
                <div key={row.question} className="contents">
                  <dt className="font-mono text-xs leading-5 text-muted">{row.question}</dt>
                  <dd>{row.answer}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </details>
      ) : null}

      {item.reviews.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Earlier reviews</p>
          {item.reviews.map((review) => (
            <p key={review._id} className="text-muted">
              {review.reviewerName}: {REVIEW_ACTION_LABELS[review.action] ?? review.action}
              {review.note ? ` · “${review.note}”` : ''} · {timeAgo(review.createdAt)}
            </p>
          ))}
        </div>
      ) : null}

      {item.lifecycle ? (
        <details className="text-sm" open={state !== 'decide'}>
          <summary className="cursor-pointer font-medium">
            Lifecycle: {LIFECYCLE_STAGE_LABELS[item.lifecycle.stage] ?? item.lifecycle.stage}
          </summary>
          <div className="mt-2">
            <LifecycleSteps lifecycle={item.lifecycle} />
          </div>
        </details>
      ) : (
        <p className="text-sm text-muted">This draft has no lifecycle instance yet.</p>
      )}

      {state === 'decide' ? <DecisionPanel needId={item.needId} rev={item.rev} title={item.title} /> : null}
      {state === 'stuck' || state === 'no-lifecycle' ? <RecoveryPanel needId={item.needId} mode={state} /> : null}
      {state === 'checking' ? (
        <p className="border-t border-border pt-4 text-sm text-muted">Automatic steps are running. Reload in a few seconds.</p>
      ) : null}
    </article>
  )
}

function ProofDeskCard({item, state}: {item: ProofDeskItem; state: DeskState}) {
  const proof = item.proof
  const lines = proof?.lines ?? []
  const matchByLine = new Map((proof?.matches ?? []).map((match) => [match.lineIndex, match]))
  // Quantity-only lines ("3 @ 18.99") and the line whose quantity they state.
  const quantityFor = new Map(
    (proof?.matches ?? []).flatMap((match) =>
      typeof match.quantityLine === 'number' && match.quantityLine !== match.lineIndex ? [[match.quantityLine, match.lineIndex] as const] : [],
    ),
  )
  const itemNames = new Map(item.items.map((line) => [line._key, line.name ?? 'Unknown item']))
  const shownByItem = proof?.quantities ? new Map(proof.quantities.map((entry) => [entry.itemKey, entry.shown])) : null
  const units = proof?.quantities ? receiptUnits(proof.quantities) : null
  const rows = proof?.decision ? answerRows(proof.decision.answers, 'proof_match') : null
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="amber">Receipt · {PROOF_VERDICT_LABELS[proof?.verdict ?? 'pending'] ?? proof?.verdict}</Chip>
        {units ? (
          <Chip>
            shows {units.shown} of {units.needed} units
          </Chip>
        ) : typeof proof?.coverage === 'number' ? (
          <Chip>covers {Math.round(proof.coverage * 100)}%</Chip>
        ) : null}
        {item.isDemo ? <Chip tone="outline">Demo request</Chip> : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold">
          <Link href={`/requests/${item.needId}`} className="hover:text-amber">
            {item.title}
          </Link>
        </h3>
        <p className="text-sm text-muted">
          {item.displayName} · {item.city}, {item.country}
          {proof ? ` · receipt from ${proof.uploaderDisplayName ?? 'someone'} ${timeAgo(proof.submittedAt) ?? ''}` : ''}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <p className="font-medium">Checklist</p>
            <ul className="text-muted">
              {item.items.map((line) => {
                const shown = shownByItem?.get(line._key)
                return (
                  <li key={line._key}>
                    {line.quantity} × {line.name ?? 'Unknown item'}
                    {line.unit ? ` (${line.unit})` : ''}
                    {shownByItem ? (
                      <span className={(shown ?? 0) < line.quantity ? 'text-amber' : ''}>
                        {' '}
                        · receipt shows {shown ?? 0}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {shownByItem ? (
              <p className="mt-1 text-xs text-muted">
                Quantities are read by Vouch&apos;s code from the lines (like “3 @ 18.99”); a line without one counts as one.
              </p>
            ) : null}
          </div>
          <div>
            <p className="font-medium">Receipt lines (after the uploader&apos;s corrections)</p>
            <ol className="flex flex-col gap-0.5">
              {lines.map((line, index) => {
                const match = matchByLine.get(index)
                const similarity = typeof line.ocrSimilarity === 'number' ? line.ocrSimilarity : null
                return (
                  <li key={index} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="w-5 text-right font-mono text-xs text-muted">{index + 1}</span>
                    <span className="font-mono text-xs">{line.text}</span>
                    {match ? (
                      <span className="text-xs text-amber">
                        → {itemNames.get(match.itemKey)} (p = {match.probability.toFixed(2)})
                        {typeof match.quantity === 'number' ? ` · counts ${match.quantity}` : ''}
                      </span>
                    ) : quantityFor.has(index) ? (
                      <span className="text-xs text-muted">quantity for line {(quantityFor.get(index) ?? 0) + 1}</span>
                    ) : null}
                    {similarity !== null && similarity < 1 ? (
                      <span className="text-xs text-muted">edited · {Math.round(similarity * 100)}% like the OCR</span>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
        {item.scan?.image ? (
          <figure className="overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- a private data URL read by the server, not an optimizable remote image */}
            <img src={item.scan.image} alt={`Receipt photo for “${item.title}”`} className="max-h-[28rem] w-full object-contain" />
            <figcaption className="p-2 text-xs text-muted">The uploaded photo (private: only verifiers see it).</figcaption>
          </figure>
        ) : (
          <p className="text-sm text-muted">No photo found for this receipt.</p>
        )}
      </div>

      {proof?.reasons?.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Why it came to a person</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {proof.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.scan?.ocrText ? (
        <details className="rounded-xl border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Raw OCR text (before the uploader&apos;s corrections)</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted">{item.scan.ocrText}</pre>
        </details>
      ) : null}

      {proof?.decision ? (
        <details className="rounded-xl border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Jev&apos;s typed answers{' '}
            <span className="font-normal text-muted">
              ({[proof.decision.model, typeof proof.decision.latencyMs === 'number' ? `${proof.decision.latencyMs} ms` : null].filter(Boolean).join(' · ')})
            </span>
          </summary>
          {proof.decision.error ? <p className="mt-2 text-danger">{proof.decision.error}</p> : null}
          {rows && rows.length > 0 ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {rows.map((row) => (
                <div key={row.question} className="contents">
                  <dt className="font-mono text-xs leading-5 text-muted">{row.question}</dt>
                  <dd>{row.answer}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </details>
      ) : null}

      {item.lifecycle ? (
        <details className="text-sm" open={state !== 'decide'}>
          <summary className="cursor-pointer font-medium">
            Lifecycle: {LIFECYCLE_STAGE_LABELS[item.lifecycle.stage] ?? item.lifecycle.stage}
          </summary>
          <div className="mt-2">
            <LifecycleSteps lifecycle={item.lifecycle} />
          </div>
        </details>
      ) : null}

      {state === 'decide' && proof ? <ProofDecisionPanel needId={item.needId} proofId={proof._id} /> : null}
      {state === 'stuck' ? <RecoveryPanel needId={item.needId} mode="stuck" /> : null}
      {state === 'checking' ? (
        <p className="border-t border-border pt-4 text-sm text-muted">Automatic steps are running. Reload in a few seconds.</p>
      ) : null}
    </article>
  )
}

function Recent({reviews}: {reviews: RecentReview[]}) {
  if (reviews.length === 0) return null
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Recently decided</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {reviews.map((review) => (
          <li key={review._id} className="flex flex-wrap items-baseline justify-between gap-2">
            <span>
              <span className="font-medium">{review.reviewerName}</span>{' '}
              {((review.proof ? `${PROOF_REVIEW_ACTION_LABELS[review.action]} for` : REVIEW_ACTION_LABELS[review.action]) ?? review.action).toLowerCase()}{' '}
              {review.published && review.needId ? (
                <Link href={`/requests/${review.needId}`} className="text-amber hover:underline">
                  {review.title ?? 'a request'}
                </Link>
              ) : (
                <span>{review.title ?? 'a request'}</span>
              )}
            </span>
            <span className="text-xs text-muted">{timeAgo(review.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default async function DeskPage() {
  const verifier = await readVerifier()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Verifier desk</p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Requests waiting for a person</h1>
        <p className="text-muted">
          Jev routes a request here when its typed answers don&apos;t clear Vouch&apos;s policy, or when anything failed. Your
          decision is an action on the request&apos;s Sanity Workflows lifecycle: approving publishes exactly the version you
          read; sending back asks the requester a question on their private page.
        </p>
      </header>

      {!verifier ? (
        isVerifierConfigured() ? (
          <SignInForm />
        ) : (
          <p role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 text-sm text-danger">
            The verifier desk isn&apos;t configured on this server.
          </p>
        )
      ) : (
        <DeskInbox name={verifier.name} />
      )}
    </main>
  )
}

async function DeskInbox({name}: {name: string}) {
  let data: Awaited<ReturnType<typeof loadDesk>> | null = null
  let loadError: string | null = null
  try {
    data = await loadDesk()
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unknown error'
  }
  const items = (data?.items ?? []).map((item) => ({item, state: item.state}))
  const proofs = data?.proofs ?? []

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>
          Signed in as <span className="font-medium">{name}</span>.
          {loadError
            ? null
            : ` ${items.length} request${items.length === 1 ? '' : 's'} and ${proofs.length} receipt${proofs.length === 1 ? '' : 's'} in the inbox.`}
        </p>
        <SignOutButton />
      </div>
      {loadError ? (
        <div role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 text-sm">
          <p className="font-medium text-danger">Couldn&apos;t load the inbox from Sanity.</p>
          <p className="mt-1 font-mono text-xs text-muted">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">No requests are waiting for a verifier right now.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {items.map(({item, state}) => (
            <DeskCard key={item.needId} item={item} state={state} />
          ))}
        </div>
      )}
      {proofs.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Receipts</h2>
          {proofs.map((item) => (
            <ProofDeskCard key={item.needId} item={item} state={item.state} />
          ))}
        </section>
      ) : null}
      <Recent reviews={data?.recent ?? []} />
    </>
  )
}
