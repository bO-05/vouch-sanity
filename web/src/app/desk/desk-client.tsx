'use client'

import {useRouter} from 'next/navigation'
import {useActionState, useId, useState} from 'react'
import {dangerButton, Field, inputClass, primaryButton, secondaryButton} from '@/components/form'
import type {DeskActionResult} from '@/lib/desk'
import {decideAction, retryAction, signInAction, signOutAction, startAction, type SignInState} from './actions'

const MAX_NOTE = 500

export function SignInForm() {
  const id = useId()
  const router = useRouter()
  const [state, formAction, pending] = useActionState(async (previous: SignInState, formData: FormData) => {
    const next = await signInAction(previous, formData)
    if (next.ok) router.refresh()
    return next
  }, {ok: false, message: null})

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <Field id={`${id}-passcode`} label="Verifier passcode" hint="The demo passcode is in the DEV post.">
        <input id={`${id}-passcode`} name="passcode" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <Field id={`${id}-name`} label="Your display name" hint="Shown to requesters and on published requests. A first name or nickname.">
        <input id={`${id}-name`} name="name" maxLength={40} autoComplete="nickname" required className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={`${primaryButton} sm:self-start`}>
        {pending ? 'Checking…' : 'Open the desk'}
      </button>
      <div aria-live="assertive">{state.message ? <p className="text-sm text-danger">{state.message}</p> : null}</div>
    </form>
  )
}

export function SignOutButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={async () => {
        await signOutAction()
        router.refresh()
      }}
      className="text-xs text-muted hover:text-danger"
    >
      Sign out
    </button>
  )
}

function Outcome({result}: {result: DeskActionResult | null}) {
  if (!result) return null
  return (
    <p role="status" className={`rounded-xl border px-3 py-2 text-sm ${result.ok ? 'border-amber/40' : 'border-danger/40 text-danger'}`}>
      {result.message}
    </p>
  )
}

function useDeskAction() {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [result, setResult] = useState<DeskActionResult | null>(null)
  const run = async (label: string, action: () => Promise<DeskActionResult>) => {
    setPending(label)
    setResult(null)
    try {
      const next = await action()
      setResult(next)
      // Let the verifier read the outcome, then reload the inbox from Sanity.
      setTimeout(() => router.refresh(), next.ok ? 2500 : 0)
    } catch (error) {
      setResult({ok: false, message: `The desk couldn't reach the server: ${error instanceof Error ? error.message : 'unknown error'}`})
    } finally {
      setPending(null)
    }
  }
  return {pending, result, run}
}

export function DecisionPanel({needId, rev, title}: {needId: string; rev: string; title: string}) {
  const id = useId()
  const [note, setNote] = useState('')
  const {pending, result, run} = useDeskAction()
  const decide = (decision: 'approve' | 'send_back' | 'reject') =>
    run(decision, () => decideAction({needId, decision, note, rev}))

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <Field
        id={`${id}-note`}
        label="Note"
        hint={`Required to send back or reject (the requester reads it on their private page). With an approval it is shown on the public page. No contact details. ${note.length}/${MAX_NOTE}`}
      >
        <textarea id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={MAX_NOTE} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending !== null} onClick={() => decide('approve')} className={primaryButton} aria-label={`Approve and publish “${title}”`}>
          {pending === 'approve' ? 'Publishing…' : 'Approve and publish'}
        </button>
        <button type="button" disabled={pending !== null} onClick={() => decide('send_back')} className={secondaryButton}>
          {pending === 'send_back' ? 'Sending back…' : 'Send back with a question'}
        </button>
        <button type="button" disabled={pending !== null} onClick={() => decide('reject')} className={dangerButton}>
          {pending === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
      <div aria-live="polite">
        <Outcome result={result} />
      </div>
    </div>
  )
}

export function RecoveryPanel({needId, mode}: {needId: string; mode: 'stuck' | 'no-lifecycle'}) {
  const {pending, result, run} = useDeskAction()
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {mode === 'stuck' ? (
        <button type="button" disabled={pending !== null} onClick={() => run('retry', () => retryAction({needId}))} className={`${secondaryButton} self-start`}>
          {pending ? 'Running the automatic steps…' : 'Retry automatic steps'}
        </button>
      ) : (
        <button type="button" disabled={pending !== null} onClick={() => run('start', () => startAction({needId}))} className={`${secondaryButton} self-start`}>
          {pending ? 'Starting…' : 'Start the lifecycle'}
        </button>
      )}
      <div aria-live="polite">
        <Outcome result={result} />
      </div>
    </div>
  )
}
