/** Public Sanity settings (safe in the browser). Secrets live in server-only modules. */

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing environment variable ${name}. See web/.env.example.`)
  }
  return value.trim()
}

export const projectId = required(
  'NEXT_PUBLIC_SANITY_PROJECT_ID',
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
)
export const dataset = required('NEXT_PUBLIC_SANITY_DATASET', process.env.NEXT_PUBLIC_SANITY_DATASET)

/** Pinned so query behavior doesn't change under us. Keep in sync with studio/schemaTypes/constants.ts. */
export const apiVersion = '2026-09-01'
