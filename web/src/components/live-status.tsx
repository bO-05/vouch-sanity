'use client'

import {useSyncExternalStore} from 'react'
import type {
  SanityLiveOnError,
  SanityLiveOnGoaway,
  SanityLiveOnReconnect,
  SanityLiveOnWelcome,
} from 'next-sanity/live'

/**
 * Shows the real state of the Sanity Live connection. The handlers below are passed to
 * <SanityLive /> and are the only writers, so the badge never claims "live" unless the
 * Live Content API actually said welcome.
 */
type LiveState = 'connecting' | 'live' | 'reconnecting' | 'polling' | 'offline'

const POLLING_INTERVAL_MS = 30_000

let current: LiveState = 'connecting'
const listeners = new Set<() => void>()

function setState(next: LiveState) {
  if (next === current) return
  current = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const onLiveWelcome: SanityLiveOnWelcome = () => setState('live')

export const onLiveReconnect: SanityLiveOnReconnect = () => setState('reconnecting')

export const onLiveError: SanityLiveOnError = (error) => {
  console.error('Sanity Live error', error)
  setState('offline')
}

export const onLiveGoAway: SanityLiveOnGoaway = (event, _context, setPollingInterval) => {
  console.warn('Sanity Live closed the connection:', event.reason)
  setPollingInterval(POLLING_INTERVAL_MS)
  setState('polling')
}

const LABELS: Record<LiveState, {text: string; title: string; dot: string}> = {
  connecting: {
    text: 'Connecting…',
    title: 'Connecting to the Sanity Live Content API',
    dot: 'bg-muted',
  },
  live: {
    text: 'Live',
    title: 'Connected to the Sanity Live Content API: pledges and new requests appear without a reload',
    dot: 'bg-emerald-400',
  },
  reconnecting: {
    text: 'Reconnecting…',
    title: 'The live connection dropped; reconnecting to the Sanity Live Content API',
    dot: 'bg-amber',
  },
  polling: {
    text: 'Refreshing every 30 s',
    title: 'The Live Content API closed the connection, so this page refreshes every 30 seconds instead',
    dot: 'bg-amber',
  },
  offline: {
    text: 'Live updates off',
    title: "Couldn't connect to the Sanity Live Content API. Reload the page to see new pledges.",
    dot: 'bg-danger',
  },
}

export function LiveStatus() {
  const state = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'connecting' as const,
  )
  const label = LABELS[state]
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs text-muted"
      title={label.title}
      data-live-state={state}
    >
      <span className={`size-2 rounded-full ${label.dot}`} aria-hidden="true" />
      {label.text}
    </span>
  )
}
