/**
 * Base document ids used in public URLs and forms: letters, digits, `-` and `_` only.
 * This rejects `drafts.` and `versions.` ids outright (they contain a dot), so an unverified
 * request can never be addressed through the public app, even before the query runs.
 */
const PUBLIC_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export function isPublicDocumentId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_ID.test(value)
}

/** `_key` of an array item (checklist line). Validated before it's used in a patch path. */
const ARRAY_KEY = /^[A-Za-z0-9_-]{1,64}$/

export function isArrayKey(value: unknown): value is string {
  return typeof value === 'string' && ARRAY_KEY.test(value)
}
