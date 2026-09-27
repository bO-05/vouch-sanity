import type {LifecycleView} from '@/lib/lifecycle/engine'
import {LIFECYCLE_EFFECT_LABELS, LIFECYCLE_STAGE_LABELS} from '@/lib/vocab'

/**
 * The stages a request's Sanity Workflows instance has actually been through, read from the
 * instance document. Presentation only; usable from server and client components.
 */

function duration(from: string, to: string | null): string | null {
  if (!to) return null
  const ms = Date.parse(to) - Date.parse(from)
  if (!Number.isFinite(ms) || ms < 0) return null
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : ms < 120_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false})
}

export function LifecycleSteps({lifecycle, compact = false}: {lifecycle: LifecycleView; compact?: boolean}) {
  const busy = lifecycle.failed.length === 0 && lifecycle.pending.length > 0
  // A claimed effect is running right now; an unclaimed one waits for the server to drain the queue.
  const working = busy && lifecycle.pending.some((effect) => effect.claimed)
  const queued = busy && !working
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1.5 text-sm">
        {lifecycle.stages.map((entry, index) => {
          const current = index === lifecycle.stages.length - 1 && !entry.exitedAt
          // Requests that existed before the lifecycle were adopted at their stage: no check ran here.
          const adopted = entry.exitedBy?.startsWith('adopted-') ?? false
          const took = adopted ? null : duration(entry.enteredAt, entry.exitedAt)
          return (
            <li key={`${entry.name}-${entry.enteredAt}`} className="flex flex-wrap items-baseline gap-x-2">
              <span
                aria-hidden
                className={`inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${
                  current ? (working || queued ? 'animate-pulse bg-amber' : 'bg-amber') : 'bg-muted'
                }`}
              />
              <span className={current ? 'font-medium' : 'text-muted'}>
                {adopted
                  ? 'Adopted into the lifecycle (this request existed before it; no check ran here)'
                  : (LIFECYCLE_STAGE_LABELS[entry.name] ?? entry.name)}
              </span>
              {!compact ? (
                <span className="font-mono text-xs text-muted">
                  {clock(entry.enteredAt)}
                  {took ? ` · ${took}` : current && working ? ' · working…' : current && queued ? ' · queued' : ''}
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
      {lifecycle.failed.length > 0 ? (
        <p className="text-xs text-danger">
          An automatic step failed ({lifecycle.failed.map((run) => LIFECYCLE_EFFECT_LABELS[run.name] ?? run.name).join(', ')}
          ). A volunteer verifier takes over; nothing was decided automatically.
        </p>
      ) : null}
      {!compact ? (
        <p className="text-xs text-muted">
          Read from this request&apos;s Sanity Workflows instance (<span className="font-mono">{lifecycle.instanceId}</span>).
        </p>
      ) : null}
    </div>
  )
}
