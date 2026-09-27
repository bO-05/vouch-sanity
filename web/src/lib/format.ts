import type {FeedItem} from './queries'

const relative = new Intl.RelativeTimeFormat('en', {numeric: 'auto'})

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 hours ago". Rendered on the server at request time. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  const seconds = Math.round((then - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

/** Units pledged on a line, never shown above the requested quantity. */
export function pledgedOn(item: FeedItem): number {
  return Math.min(item.pledged, item.quantity)
}

export function remainingOn(item: FeedItem): number {
  return Math.max(0, item.quantity - item.pledged)
}

export function totals(items: FeedItem[] | null | undefined): {
  pledged: number
  requested: number
  percent: number
} {
  const {pledged, requested} = (items ?? []).reduce(
    (sum, item) => ({pledged: sum.pledged + pledgedOn(item), requested: sum.requested + item.quantity}),
    {pledged: 0, requested: 0},
  )
  return {pledged, requested, percent: requested > 0 ? Math.round((pledged / requested) * 100) : 0}
}
