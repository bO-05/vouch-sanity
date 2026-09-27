import type {Metadata} from 'next'
import Link from 'next/link'
import type {ReactNode} from 'react'
import {LifecycleSteps} from '@/components/lifecycle-steps'
import {answerRows} from '@/lib/answers'
import {loadDesk, type DeskItem, type DeskState, type RecentReview} from '@/lib/desk'
import {timeAgo} from '@/lib/format'
import {isVerifierConfigured, readVerifier} from '@/lib/verifier'
import {
  LANGUAGE_LABELS,
  LIFECYCLE_STAGE_LABELS,
  REVIEW_ACTION_LABELS,
  TRIAGE_OUTCOME_LABELS,
  URGENCY_LABELS,
} from '@/lib/vocab'
import {DecisionPanel, RecoveryPanel, SignInForm, SignOutButton} from './desk-client'

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

function Recent({reviews}: {reviews: RecentReview[]}) {
  if (reviews.length === 0) return null
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Recently decided</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {reviews.map((review) => (
          <li key={review._id} className="flex flex-wrap items-baseline justify-between gap-2">
            <span>
              <span className="font-medium">{review.reviewerName}</span> {(REVIEW_ACTION_LABELS[review.action] ?? review.action).toLowerCase()}{' '}
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

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>
          Signed in as <span className="font-medium">{name}</span>. {items.length} request{items.length === 1 ? '' : 's'} in the inbox.
        </p>
        <SignOutButton />
      </div>
      {loadError ? (
        <div role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 text-sm">
          <p className="font-medium text-danger">Couldn&apos;t load the inbox from Sanity.</p>
          <p className="mt-1 font-mono text-xs text-muted">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">Nothing is waiting for a verifier right now.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {items.map(({item, state}) => (
            <DeskCard key={item.needId} item={item} state={state} />
          ))}
        </div>
      )}
      <Recent reviews={data?.recent ?? []} />
    </>
  )
}
