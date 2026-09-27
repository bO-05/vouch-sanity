import {looksLikeContactInfo} from './contact'
import {LANGUAGE_LABELS} from './vocab'

/**
 * Rules for the "Ask for help" form, shared by the browser (instant feedback) and the server
 * (which re-checks everything: a Server Action is a public endpoint). Code, not a model, owns them.
 */

export const ASK_LIMITS = {
  title: {min: 5, max: 80},
  story: {min: 20, max: 2000},
  displayName: {min: 1, max: 40},
  city: {min: 2, max: 60},
  country: {min: 2, max: 60},
} as const

export type AskTextField = keyof typeof ASK_LIMITS

export type AskFields = Record<AskTextField, string> & {language: string}

const FIELD_NAMES: Record<AskTextField, string> = {
  title: 'title',
  story: 'story',
  displayName: 'display name',
  city: 'city',
  country: 'country',
}

export const CONTACT_MESSAGE =
  'Please remove contact details (phone numbers, emails, links or social media handles). Vouch only ever shows your display name and city.'

/** One line of text: control characters dropped, whitespace collapsed. */
export function tidyLine(value: string): string {
  return value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The story is stored exactly as written. Only line endings are normalized, stray control
 * characters dropped and the outer whitespace trimmed; nothing is rewritten.
 */
export function tidyStory(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n\t]/gu, '')
    .trim()
}

export function tidyFields(fields: AskFields): AskFields {
  return {
    title: tidyLine(fields.title),
    story: tidyStory(fields.story),
    displayName: tidyLine(fields.displayName),
    city: tidyLine(fields.city),
    country: tidyLine(fields.country),
    language: fields.language,
  }
}

export type FieldProblem = {field: AskTextField | 'language'; message: string}

/** The first problem with the (tidied) fields, or null. */
export function askFieldProblem(fields: AskFields, only?: AskTextField[]): FieldProblem | null {
  for (const field of only ?? (Object.keys(ASK_LIMITS) as AskTextField[])) {
    const value = fields[field]
    const {min, max} = ASK_LIMITS[field]
    const name = FIELD_NAMES[field]
    if (value.length < min) {
      return {
        field,
        message:
          field === 'story'
            ? `Tell your neighbors a little more (at least ${min} characters).`
            : field === 'displayName'
              ? 'Add a display name (a first name or nickname).'
              : `Add a ${name} (at least ${min} characters).`,
      }
    }
    if (value.length > max) return {field, message: `Keep the ${name} under ${max.toLocaleString('en')} characters.`}
    if (looksLikeContactInfo(value)) return {field, message: CONTACT_MESSAGE}
  }
  if (!only && !(fields.language in LANGUAGE_LABELS)) {
    return {field: 'language', message: 'Pick the language you are writing in.'}
  }
  return null
}
