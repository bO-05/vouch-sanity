/**
 * Vouch stores a display name and a city, never contact details.
 * This is a Studio-side warning only; the server runs its own checks (and Jev's contact-info flag).
 */
const CONTACT_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // email address
  /(?:\+?\d[\s().-]?){7,}/, // phone-like run of 7+ digits
  /(?:https?:\/\/|www\.)\S+/i, // links
  /(?:^|\s)@[A-Za-z0-9_.]{3,}/, // social media handle
]

export const CONTACT_INFO_WARNING =
  'This looks like contact details (phone, email, link or handle). Vouch stores a display name and city only.'

export function looksLikeContactInfo(value: unknown): boolean {
  return typeof value === 'string' && CONTACT_PATTERNS.some((pattern) => pattern.test(value))
}

export function noContactInfo(value: unknown): true | string {
  return looksLikeContactInfo(value) ? CONTACT_INFO_WARNING : true
}
