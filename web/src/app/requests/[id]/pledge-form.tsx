'use client'

import {startTransition, useActionState, useId, useState, type FormEvent} from 'react'
import {pledgeAction, type PledgeFormState} from './actions'

export type PledgeLine = {key: string; name: string; unit: string | null; remaining: number}

const INITIAL: PledgeFormState = {status: 'idle'}
const MAX_DONOR_NAME_LENGTH = 40

export function PledgeForm({needId, lines}: {needId: string; lines: PledgeLine[]}) {
  const [state, dispatch, pending] = useActionState(pledgeAction, INITIAL)
  const [choice, setChoice] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [name, setName] = useState('')
  const id = useId()

  // Live updates can shrink what's left while this form is open, so derive the selection
  // from the latest props instead of trusting what was picked a moment ago.
  const open = lines.filter((line) => line.remaining > 0)
  const selected = open.find((line) => line.key === choice) ?? open[0]
  const max = selected?.remaining ?? 0
  const units = Math.min(Math.max(1, quantity), Math.max(1, max))

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    startTransition(() =>
      dispatch({needId, itemKey: selected.key, quantity: units, donorDisplayName: name}),
    )
  }

  const message =
    state.status === 'idle' ? null : (
      <p
        key={state.at}
        className={`rounded-xl border px-3 py-2 text-sm ${
          state.status === 'ok'
            ? 'border-amber/40 bg-amber-soft text-foreground'
            : 'border-danger/40 text-danger'
        }`}
      >
        {state.message}
      </p>
    )

  if (!selected) {
    return (
      <div className="flex flex-col gap-3" aria-live="polite">
        {message}
        <p className="text-sm text-muted">Everything on this checklist has been pledged.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-item`} className="text-sm font-medium">
          Item
        </label>
        <select
          id={`${id}-item`}
          value={selected.key}
          onChange={(event) => setChoice(event.target.value)}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          {open.map((line) => (
            <option key={line.key} value={line.key}>
              {line.name}
              {line.unit ? ` (${line.unit})` : ''}: {line.remaining} still needed
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-quantity`} className="text-sm font-medium">
          How many
        </label>
        <select
          id={`${id}-quantity`}
          value={units}
          onChange={(event) => setQuantity(Number(event.target.value))}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          {Array.from({length: max}, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Your display name
        </label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={MAX_DONOR_NAME_LENGTH}
          autoComplete="nickname"
          placeholder="A first name or nickname"
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted"
        />
        <p className="text-xs text-muted">Shown publicly next to your pledge. No contact details.</p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-background transition-opacity disabled:opacity-60"
      >
        {pending ? 'Recording your pledge…' : `Pledge ${units} × ${selected.name}`}
      </button>

      <div aria-live="polite">{message}</div>
    </form>
  )
}
