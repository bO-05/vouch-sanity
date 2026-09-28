import Link from 'next/link'
import {dataset, projectId} from '@/lib/sanity/config'
import {fetchPublished} from '@/lib/sanity/live'
import {pledgedOn, totals} from '@/lib/format'
import {FEED_QUERY, type FeedNeed} from '@/lib/queries'
import {STAGE_LABELS, URGENCY_LABELS} from '@/lib/vocab'

// Pledge counts must be current: render per request, and Sanity Live refreshes the page.
export const dynamic = 'force-dynamic'

function NeedCard({need}: {need: FeedNeed}) {
  const {pledged, requested, percent} = totals(need.items)
  const urgency = typeof need.urgency === 'number' ? URGENCY_LABELS[need.urgency] : null

  return (
    <article className="relative flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors focus-within:border-amber/60 hover:border-amber/60">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {urgency ? (
          <span
            className={`rounded-full px-2.5 py-1 font-medium ${
              (need.urgency ?? 0) >= 2 ? 'bg-amber-soft text-amber' : 'bg-surface-2 text-muted'
            }`}
          >
            {urgency}
          </span>
        ) : null}
        {need.category ? (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted">{need.category}</span>
        ) : null}
        {need.isDemo ? (
          <span
            className="rounded-full border border-border px-2.5 py-1 text-muted"
            title="Sample request written by the Vouch team, not a real person"
          >
            Demo
          </span>
        ) : null}
      </div>

      <div>
        <h2 className="text-lg font-semibold leading-snug">
          {/* The whole card is the link target; the title carries the accessible name. */}
          <Link href={`/requests/${need._id}`} className="after:absolute after:inset-0 focus:outline-none">
            {need.title}
          </Link>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {need.displayName} · {need.city}, {need.country}
        </p>
      </div>

      <ul className="flex flex-col gap-1.5 text-sm">
        {(need.items ?? []).map((item) => (
          <li key={item._key} className="flex justify-between gap-3">
            <span>
              {item.quantity} × {item.name ?? 'Unknown item'}
              {item.unit ? <span className="text-muted"> ({item.unit})</span> : null}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted">
              {pledgedOn(item)}/{item.quantity}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Share of requested units pledged"
        >
          <div className="h-full rounded-full bg-amber transition-[width] duration-500" style={{width: `${percent}%`}} />
        </div>
        <p className="text-xs text-muted">
          {pledged} of {requested} units pledged · {STAGE_LABELS[need.stage] ?? need.stage}
        </p>
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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 py-10 sm:px-8">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Verified mutual aid</p>
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
          Neighbors ask for help. The AI can&apos;t write a single sentence.
        </h1>
        <p className="max-w-2xl text-muted">
          People ask in their own words. Jev only makes typed decisions with calibrated probabilities, and
          anything uncertain goes to a volunteer. A request shows up here only once it&apos;s verified: in
          Sanity, unverified requests stay private drafts. Pick one and pledge an item from its checklist.
        </p>
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
        <section aria-label="Verified requests" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {needs.map((need) => (
            <NeedCard key={need._id} need={need} />
          ))}
        </section>
      )}

      <footer className="mt-auto border-t border-border pt-6 text-xs text-muted">
        Content lives in Sanity: project <span className="font-mono">{projectId}</span>, public dataset{' '}
        <span className="font-mono">{dataset}</span> (published = verified; drafts stay private). Cards marked
        Demo are samples written by the Vouch team. Volunteers:{' '}
        <Link href="/desk" className="text-amber hover:underline">
          verifier desk
        </Link>
        .
      </footer>
    </main>
  )
}
