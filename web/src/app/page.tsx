import Link from 'next/link'
import {dataset, projectId} from '@/lib/sanity/config'
import {fetchPublished} from '@/lib/sanity/live'
import {pledgedOn, receiptUnits, totals} from '@/lib/format'
import {FEED_QUERY, type FeedNeed} from '@/lib/queries'
import {STAGE_LABELS, URGENCY_LABELS} from '@/lib/vocab'

// Pledge counts must be current: render per request, and Sanity Live refreshes the page.
export const dynamic = 'force-dynamic'

function NeedCard({need}: {need: FeedNeed}) {
  const {pledged, requested, percent} = totals(need.items)
  const urgency = typeof need.urgency === 'number' ? URGENCY_LABELS[need.urgency] : null
  // Once fulfilled, the card shows what the verified receipt shows, not what was pledged.
  const receipt = need.stage === 'fulfilled' ? need.receipt : null
  const shownByItem = receipt?.quantities ? new Map(receipt.quantities.map((entry) => [entry.itemKey, entry.shown])) : null
  const onReceipt = new Set(receipt?.matched ?? [])
  const units = receipt?.quantities ? receiptUnits(receipt.quantities) : null
  // No bar for a receipt checked before quantities were counted: there is no share to show.
  const barPercent = receipt ? (units ? Math.round((units.shown / Math.max(1, units.needed)) * 100) : null) : percent
  const summary = receipt
    ? 'Fulfilled · ' +
      (units
        ? 'the receipt shows ' + units.shown + ' of ' + units.needed + ' units'
        : 'receipt verified before quantities were counted')
    : pledged + ' of ' + requested + ' units pledged · ' + (STAGE_LABELS[need.stage] ?? need.stage)

  return (
    <article className="need-card">
      <div className="need-card-body">
        <div className="need-card-tags">
          {urgency ? (
            <span className={(need.urgency ?? 0) >= 2 ? 'need-tag need-tag-priority' : 'need-tag'}>
              {urgency}
            </span>
          ) : null}
          {need.category ? <span className="need-tag">{need.category}</span> : null}
          {need.isDemo ? (
            <span
              className="need-tag need-tag-demo"
              title="Sample request written by the Vouch team, not a real person"
            >
              Demo
            </span>
          ) : null}
        </div>

        <div className="need-card-heading">
          <h2>
            <Link href={'/requests/' + need._id} className="need-card-link">
              {need.title}
              <span className="need-card-link-mark" aria-hidden="true">↗</span>
            </Link>
          </h2>
          <p className="need-card-location">
            {need.displayName} <span aria-hidden="true">·</span> {need.city}, {need.country}
          </p>
        </div>

        <ul className="need-card-items">
          {(need.items ?? []).map((item) => (
            <li key={item._key} className="need-card-item">
              <span className="need-card-item-name">
                {item.quantity} × {item.name ?? 'Unknown item'}
                {item.unit ? <span className="text-muted"> ({item.unit})</span> : null}
              </span>
              <span className="need-card-item-status">
                {receipt
                  ? shownByItem
                    ? Math.min(shownByItem.get(item._key) ?? 0, item.quantity) + '/' + item.quantity + ' bought'
                    : onReceipt.has(item._key)
                      ? 'on receipt'
                      : 'not on receipt'
                  : pledgedOn(item) + '/' + item.quantity}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="need-card-aside">
        {barPercent !== null ? (
          <div
            className="need-card-progress"
            role="progressbar"
            aria-valuenow={barPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={receipt ? 'Share of requested units shown on the verified receipt' : 'Share of requested units pledged'}
          >
            <div className="need-card-progress-fill" style={{width: String(barPercent) + '%'}} />
          </div>
        ) : null}
        <p className="need-card-summary">{summary}</p>
        <p className="need-card-action">Open request <span aria-hidden="true">→</span></p>
      </div>
    </article>
  )
}

export default async function Home() {
  let needs: FeedNeed[] = []
  let loadError: string | null = null
  try {
    needs = await fetchPublished<FeedNeed[]>(FEED_QUERY)
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unknown error'
  }

  return (
    <main className="feed-main mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-6 sm:px-8">
      <header className="feed-heading">
        <div className="feed-heading-copy">
          <p className="feed-kicker">Vouch / community board</p>
          <div className="feed-title-row">
            <h1>Verified requests from your neighbors</h1>
            {!loadError ? (
              <p className="feed-count">{needs.length} {needs.length === 1 ? 'request' : 'requests'}</p>
            ) : null}
          </div>
          <p className="feed-description">
            Only published requests appear here. Jev makes typed decisions; a volunteer reviews anything uncertain.
          </p>
        </div>
        <Link href="/ask" className="feed-ask-link">
          Ask for help <span className="feed-ask-arrow" aria-hidden="true">↗</span>
        </Link>
      </header>

      {loadError ? (
        <div role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 text-sm">
          <p className="font-medium text-danger">Couldn&apos;t load requests from Sanity.</p>
          <p className="mt-1 font-mono text-xs text-muted">{loadError}</p>
        </div>
      ) : needs.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-muted">
          No verified requests right now. New ones appear here as soon as they&apos;re verified, without a reload.{' '}
          <Link href="/ask" className="text-amber hover:underline">
            Ask for help
          </Link>
        </p>
      ) : (
        <section aria-label="Verified requests" className="need-list">
          {needs.map((need) => (
            <NeedCard key={need._id} need={need} />
          ))}
        </section>
      )}

      <footer className="feed-footer mt-auto border-t pt-6">
        Content lives in Sanity: project <span className="font-mono">{projectId}</span>, public dataset{' '}
        <span className="font-mono">{dataset}</span> (published = verified; drafts stay private). Requests marked
        Demo are samples written by the Vouch team. Volunteers:{' '}
        <Link href="/desk">verifier desk</Link>.
      </footer>
    </main>
  )
}
