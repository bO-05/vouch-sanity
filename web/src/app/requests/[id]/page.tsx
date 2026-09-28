import type {Metadata} from 'next'
import Link from 'next/link'
import {notFound} from 'next/navigation'
import {cache, type ReactNode} from 'react'
import {LifecycleSteps} from '@/components/lifecycle-steps'
import {answerRows} from '@/lib/answers'
import {pledgedOn, remainingOn, timeAgo, totals} from '@/lib/format'
import {isPublicDocumentId} from '@/lib/ids'
import {NEED_QUERY, type NeedDecision, type NeedDetail, type NeedProof} from '@/lib/queries'
import {fetchPublished} from '@/lib/sanity/live'
import {loadPrivateTrail} from '@/lib/trail'
import {
  DECISION_KIND_LABELS,
  DECISION_OUTCOME_LABELS,
  LANGUAGE_LABELS,
  PLEDGEABLE_STAGE,
  PROOF_REVIEW_ACTION_LABELS,
  PROOF_VERDICT_LABELS,
  REVIEW_ACTION_LABELS,
  STAGE_LABELS,
  TRIAGE_OUTCOME_LABELS,
  URGENCY_LABELS,
} from '@/lib/vocab'
import {PledgeForm, type PledgeLine} from './pledge-form'

// Pledge counts must be current: render per request, and Sanity Live refreshes the page.
export const dynamic = 'force-dynamic'

/** Published (= verified) requests only. Drafts and malformed ids never reach the query. */
const getNeed = cache(async (id: string): Promise<NeedDetail | null> =>
  isPublicDocumentId(id) ? fetchPublished<NeedDetail | null>(NEED_QUERY, {id}) : null,
)

export async function generateMetadata({params}: PageProps<'/requests/[id]'>): Promise<Metadata> {
  const {id} = await params
  const need = await getNeed(id).catch(() => null)
  if (!need) return {title: 'Request not found'}
  return {
    title: need.title,
    description: `${need.displayName} in ${need.city}, ${need.country} asked for help. Pledge an item from the checklist.`,
  }
}

function Chip({children, tone = 'plain'}: {children: ReactNode; tone?: 'plain' | 'amber' | 'outline'}) {
  const styles = {
    plain: 'bg-surface-2 text-muted',
    amber: 'bg-amber-soft text-amber',
    outline: 'border border-border text-muted',
  }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>{children}</span>
}

function Bar({percent, label}: {percent: number; label: string}) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-amber transition-[width] duration-500" style={{width: `${percent}%`}} />
    </div>
  )
}

function Card({title, children, id}: {title: string; children: ReactNode; id: string}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <h2 id={id} className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}

function DecisionEntry({decision}: {decision: NeedDecision}) {
  const rows = answerRows(decision.answers, decision.kind)
  const when = timeAgo(decision.createdAt)
  const outcome = decision.error ? 'error' : decision.outcome
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          Jev · {DECISION_KIND_LABELS[decision.kind] ?? decision.kind}
          <span className="text-muted"> → {outcome ? (DECISION_OUTCOME_LABELS[outcome] ?? outcome) : '…'}</span>
        </p>
        <p className="font-mono text-xs text-muted">
          {[decision.model, typeof decision.latencyMs === 'number' ? `${decision.latencyMs} ms` : null, when]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {decision.error ? <p className="text-sm text-danger">{decision.error}</p> : null}
      {rows === null ? (
        <pre className="overflow-x-auto text-xs text-muted">{decision.answers}</pre>
      ) : rows.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.question} className="contents">
              <dt className="font-mono text-xs leading-5 text-muted">{row.question}</dt>
              <dd>{row.answer}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  )
}

/** A receipt in the public trail: who uploaded it, the verdict, and only the lines Jev matched. */
function ProofEntry({proof, itemNames}: {proof: NeedProof; itemNames: Map<string, string>}) {
  const lines = proof.lines ?? []
  const matches = proof.matches ?? []
  const decided = proof.verdict !== 'pending'
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
      <p className="font-medium">
        Receipt uploaded by {proof.uploaderDisplayName ?? 'someone'}
        <span className="font-normal text-muted">
          {' '}
          · {PROOF_VERDICT_LABELS[proof.verdict ?? 'pending'] ?? proof.verdict}
          {typeof proof.coverage === 'number' ? ` · covers ${Math.round(proof.coverage * 100)}% of the checklist` : ''} ·{' '}
          {timeAgo(proof.submittedAt)}
        </span>
      </p>
      {matches.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {matches.map((match) => (
            <li key={`${match.lineIndex}-${match.itemKey}`}>
              {itemNames.get(match.itemKey) ?? 'an item'} ← <span className="font-mono text-xs">{lines[match.lineIndex]?.text}</span>{' '}
              <span className="text-muted">(p = {match.probability.toFixed(2)})</span>
            </li>
          ))}
        </ul>
      ) : decided ? (
        <p className="text-muted">No receipt line matched the checklist.</p>
      ) : null}
      {proof.reasons?.length ? (
        <ul className="list-disc pl-5 text-muted">
          {proof.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted">
        {lines.length} line{lines.length === 1 ? '' : 's'} read from the photo; only matched lines are shown here. The photo itself is
        private (volunteer verifiers see it).
      </p>
    </li>
  )
}

function ReceiptCard({need}: {need: NeedDetail}) {
  if (need.stage === PLEDGEABLE_STAGE) {
    return (
      <Card title="Receipt" id="receipt">
        <p className="text-sm text-muted">
          Bought the items? Upload the receipt: your browser reads it, Jev checks it against the checklist, and a verified receipt
          marks this request fulfilled.
        </p>
        <Link
          href={`/requests/${need._id}/proof`}
          className="self-start rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-amber/60"
        >
          Upload the receipt
        </Link>
      </Card>
    )
  }
  if (need.stage === 'proof_check') {
    return (
      <Card title="Receipt" id="receipt">
        <p className="text-sm text-muted">Jev is checking a receipt against the checklist right now.</p>
      </Card>
    )
  }
  if (need.stage === 'proof_review') {
    return (
      <Card title="Receipt" id="receipt">
        <p className="text-sm text-muted">A volunteer verifier is checking the receipt. Pledges are paused meanwhile.</p>
      </Card>
    )
  }
  if (need.stage === 'fulfilled' && need.certificate) {
    return (
      <Card title="Fulfilled" id="receipt">
        <p className="text-sm">
          Fulfilled {timeAgo(need.fulfilledAt ?? need.certificate.issuedAt)}. The certificate&apos;s SHA-256 starts with{' '}
          <span className="font-mono text-xs">{need.certificate.sha256.slice(0, 16)}…</span>
        </p>
        <Link
          href={`/certificates/${need.certificate._id}`}
          className="self-start rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-background"
        >
          See and check the certificate
        </Link>
      </Card>
    )
  }
  return null
}

export default async function RequestPage({params}: PageProps<'/requests/[id]'>) {
  const {id} = await params

  let need: NeedDetail | null = null
  let loadError: string | null = null
  try {
    need = await getNeed(id)
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unknown error'
  }

  if (loadError) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
        <div role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 text-sm">
          <p className="font-medium text-danger">Couldn&apos;t load this request from Sanity.</p>
          <p className="mt-1 font-mono text-xs text-muted">{loadError}</p>
        </div>
      </main>
    )
  }
  if (!need) notFound()

  // Published (the public client returned it), so its reviews and lifecycle may be shown.
  const {reviews, lifecycle, problems} = await loadPrivateTrail(need._id)
  const items = need.items ?? []
  const {pledged, requested, percent} = totals(items)
  const itemNames = new Map(items.map((item) => [item._key, item.name ?? 'Unknown item']))
  const urgency = typeof need.urgency === 'number' ? URGENCY_LABELS[need.urgency] : null
  const language = need.language ?? 'en'
  const pledgeable = need.stage === PLEDGEABLE_STAGE
  const lines: PledgeLine[] = items.map((item) => ({
    key: item._key,
    name: item.name ?? 'Unknown item',
    unit: item.unit,
    remaining: remainingOn(item),
  }))
  const hasTrail =
    Boolean(need.triage?.outcome) ||
    need.decisions.length > 0 ||
    reviews.length > 0 ||
    need.proofs.length > 0 ||
    problems.length > 0

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← All verified requests
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {urgency ? <Chip tone={(need.urgency ?? 0) >= 2 ? 'amber' : 'plain'}>{urgency}</Chip> : null}
          {need.category ? <Chip>{need.category}</Chip> : null}
          {language !== 'en' ? <Chip>{LANGUAGE_LABELS[language] ?? language}</Chip> : null}
          {need.isDemo ? (
            <Chip tone="outline">
              <span title="Sample request written by the Vouch team, not a real person">Demo</span>
            </Chip>
          ) : null}
        </div>
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">{need.title}</h1>
        <p className="text-muted">
          {need.displayName} · {need.city}, {need.country}
          {need.publishedAt ? (
            <span>
              {' '}
              · {need.isDemo ? 'published' : 'verified'} {timeAgo(need.publishedAt)}
            </span>
          ) : null}
        </p>
      </header>

      {/* grid-cols-1 = minmax(0, 1fr): on a phone the column must not grow to fit a long option or name. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Card title={`In ${need.displayName}'s words`} id="story">
            <blockquote lang={language} className="border-l-2 border-amber pl-4 text-lg leading-relaxed">
              <p className="whitespace-pre-wrap">{need.story}</p>
            </blockquote>
            <p className="text-xs text-muted">
              Stored exactly as written. Vouch never rewrites, translates or summarizes anyone&apos;s words.
            </p>
          </Card>

          <Card title="Checklist" id="checklist">
            {items.length === 0 ? (
              <p className="text-sm text-muted">No checklist yet.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {items.map((item) => {
                  const done = pledgedOn(item)
                  const left = remainingOn(item)
                  return (
                    <li key={item._key} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p>
                          <span className="font-medium">
                            {item.quantity} × {item.name ?? 'Unknown item'}
                          </span>
                          {item.unit ? <span className="text-sm text-muted"> ({item.unit})</span> : null}
                        </p>
                        <p className="font-mono text-xs text-muted">
                          {done}/{item.quantity} pledged
                          {left > 0 ? ` · ${left} still needed` : ' · fully pledged'}
                        </p>
                      </div>
                      <Bar
                        percent={Math.round((done / item.quantity) * 100)}
                        label={`${item.name ?? 'Item'}: share pledged`}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <Bar percent={percent} label="Share of all requested units pledged" />
              <p className="text-sm text-muted">
                {pledged} of {requested} units pledged ({percent}%) · {STAGE_LABELS[need.stage] ?? need.stage}
              </p>
            </div>
          </Card>

          <Card title="Trail" id="trail">
            {problems.length > 0 ? (
              <ul role="status" className="flex flex-col gap-1 rounded-xl border border-danger/40 p-3 text-sm text-danger">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}

            {need.triage?.outcome ? (
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  <span className="font-medium">
                    {TRIAGE_OUTCOME_LABELS[need.triage.outcome] ?? need.triage.outcome}
                  </span>
                  {typeof need.triage.minConfidence === 'number'
                    ? ` · lowest gating confidence ${need.triage.minConfidence.toFixed(2)} (category and language)`
                    : null}
                </p>
                {need.triage.reasons?.length ? (
                  <ul className="list-disc pl-5 text-muted">
                    {need.triage.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {need.decisions.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {need.decisions.map((decision) => (
                  <DecisionEntry key={decision._id} decision={decision} />
                ))}
              </ol>
            ) : null}

            {reviews.length > 0 ? (
              <ol className="flex flex-col gap-2 text-sm">
                {reviews.map((review) => (
                  <li key={review._id} className="rounded-xl border border-border p-3">
                    <p className="font-medium">
                      Volunteer {review.reviewerName}:{' '}
                      {(review.proof ? PROOF_REVIEW_ACTION_LABELS[review.action] : REVIEW_ACTION_LABELS[review.action]) ?? review.action}
                      <span className="font-normal text-muted"> · {timeAgo(review.createdAt)}</span>
                    </p>
                    {review.note ? <p className="mt-1 text-muted">{review.note}</p> : null}
                  </li>
                ))}
              </ol>
            ) : null}

            {need.proofs.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {need.proofs.map((proof) => (
                  <ProofEntry key={proof._id} proof={proof} itemNames={itemNames} />
                ))}
              </ol>
            ) : null}

            {need.certificate ? (
              <p className="text-sm">
                <span className="font-medium">Certificate issued</span>{' '}
                <span className="text-muted">
                  · sha256 <span className="font-mono text-xs">{need.certificate.sha256.slice(0, 16)}…</span> ·{' '}
                </span>
                <Link href={`/certificates/${need.certificate._id}`} className="text-amber hover:underline">
                  check it in your browser
                </Link>
              </p>
            ) : null}

            {lifecycle ? (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Lifecycle</p>
                <LifecycleSteps lifecycle={lifecycle} />
              </div>
            ) : null}

            {!hasTrail ? (
              <p className="text-sm text-muted">
                {need.isDemo
                  ? 'This is a demo request written by the Vouch team and seeded straight into Sanity, so Jev never saw it and no volunteer reviewed it. Requests submitted through the app show every Jev decision (with its probabilities) and every human review here.'
                  : 'No decisions have been recorded for this request yet.'}
              </p>
            ) : null}
          </Card>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          {need.stage === 'fulfilled' ? <ReceiptCard need={need} /> : null}
          <Card title="Pledge an item" id="pledge">
            {pledgeable ? (
              <PledgeForm needId={need._id} lines={lines} />
            ) : (
              <p className="text-sm text-muted">
                This request isn&apos;t collecting pledges right now ({STAGE_LABELS[need.stage] ?? need.stage}).
              </p>
            )}
            <p className="text-xs text-muted">
              Vouch never handles money or addresses. A pledge is a public promise; a receipt checked against
              the checklist closes the loop.
            </p>
          </Card>
          {need.stage !== 'fulfilled' ? <ReceiptCard need={need} /> : null}

          <Card title={`Pledges (${need.pledges.length})`} id="pledges">
            {need.pledges.length === 0 ? (
              <p className="text-sm text-muted">No pledges yet. Be the first.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {need.pledges.map((pledge) => (
                  <li key={pledge._id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>
                      <span className="font-medium">{pledge.donorDisplayName}</span> pledged {pledge.quantity} ×{' '}
                      {itemNames.get(pledge.itemKey) ?? 'an item'}
                      {pledge.isDemo ? <span className="text-muted"> (demo)</span> : null}
                    </span>
                    <span className="text-xs text-muted">{timeAgo(pledge.pledgedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </main>
  )
}
