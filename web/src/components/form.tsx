import type {ReactNode} from 'react'

/** Shared form styling for the ask form, the resubmit form and the verifier desk. */

export const inputClass =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted focus:border-amber/60 focus:outline-none'
export const primaryButton =
  'rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-background transition-opacity disabled:opacity-60'
export const secondaryButton =
  'rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-amber/60 disabled:opacity-60'
export const dangerButton =
  'rounded-xl border border-danger/50 px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-60'

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}
