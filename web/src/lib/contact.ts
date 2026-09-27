/**
 * Vouch stores a display name and a city, never contact details.
 * Mirrors studio/schemaTypes/validation.ts (a Studio-side warning); here it's enforced. Keep them in sync.
 */
const CONTACT_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // email address
  /(?:\+?\d[\s().-]?){7,}/, // phone-like run of 7+ digits
  /(?:https?:\/\/|www\.)\S+/i, // links
  /(?:^|\s)@[A-Za-z0-9_.]{3,}/, // social media handle
]

export function looksLikeContactInfo(value: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(value))
}

/** Trim, collapse whitespace and drop control characters. */
export function cleanDisplayName(value: string): string {
  return value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
