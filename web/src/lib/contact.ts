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

/** Amounts a receipt line legitimately prints, which the checks above could mistake for contact details. */
const RECEIPT_AMOUNTS: RegExp[] = [
  /(?:^|\s)\d{1,2}\s*[^\s\d]?\s*[@©®]\s*[^\s\d$]?\s*\$?\s*\d+[.,]\d{2,3}/g, // "3 @ 18.99", "3@18.99" (not an email)
  /\s\$?\d{1,5}[.,]\d{2}\s?[A-Za-z*]{0,2}-?\s*$/, // the price at the end of the line
]

/**
 * The same check for a receipt line, ignoring its quantity and its price: OCR often reads a size
 * next to a price as digits ("12OZ 56.97" → "1202 56.97"), which would look like a phone number.
 * Phone, card and transaction numbers elsewhere on the line are still caught.
 */
export function receiptLineLooksLikeContactInfo(value: string): boolean {
  let text = value
  for (const pattern of RECEIPT_AMOUNTS) text = text.replace(pattern, ' ')
  return looksLikeContactInfo(text)
}

/** Trim, collapse whitespace and drop control characters. */
export function cleanDisplayName(value: string): string {
  return value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
