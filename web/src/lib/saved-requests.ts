/**
 * The requester's private status links, remembered in this browser only (localStorage).
 * Vouch has no accounts; the link itself is the key. Nothing here is sent anywhere.
 */

export type SavedRequest = {needId: string; token: string; title: string; submittedAt: string}

export const SAVED_REQUESTS_KEY = 'vouch.requests'
const KEY = SAVED_REQUESTS_KEY
const MAX = 20

/** Parse the stored JSON (tolerates anything malformed by returning what's valid). */
export function parseSavedRequests(raw: string | null): SavedRequest[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is SavedRequest =>
            typeof entry?.needId === 'string' && typeof entry?.token === 'string' && typeof entry?.title === 'string',
        )
      : []
  } catch {
    return []
  }
}

export function readSavedRequests(): SavedRequest[] {
  try {
    return parseSavedRequests(localStorage.getItem(KEY))
  } catch {
    return []
  }
}

/** Returns false when the browser refuses (private mode, storage disabled). */
export function saveRequest(entry: SavedRequest): boolean {
  try {
    const rest = readSavedRequests().filter((saved) => saved.needId !== entry.needId)
    localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, MAX)))
    return true
  } catch {
    return false
  }
}

export function forgetRequest(needId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(readSavedRequests().filter((saved) => saved.needId !== needId)))
  } catch {
    // Nothing to do: storage is unavailable.
  }
}

export function statusPath(token: string): string {
  return `/status#${token}`
}
