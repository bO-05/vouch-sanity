'use client'

import {useEffect, useId, useState} from 'react'
import {inputClass, secondaryButton} from '@/components/form'

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Recomputes the certificate's SHA-256 in the visitor's browser (Web Crypto), from the exact payload
 * text. Edit the payload to watch the hash stop matching.
 */
export function CertificateCheck({payload, sha256}: {payload: string; sha256: string}) {
  const id = useId()
  const [text, setText] = useState(payload)
  const [hash, setHash] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    sha256Hex(text)
      .then((value) => {
        if (!cancelled) {
          setHash(value)
          setProblem(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : 'Web Crypto is not available in this browser.')
      })
    return () => {
      cancelled = true
    }
  }, [text])

  const matches = hash === sha256
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Check it yourself</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="text-muted">Stored SHA-256</dt>
        <dd className="break-all font-mono text-xs leading-5">{sha256}</dd>
        <dt className="text-muted">Computed in your browser</dt>
        <dd className="break-all font-mono text-xs leading-5">{problem ? <span className="text-danger">{problem}</span> : (hash ?? '…')}</dd>
      </dl>
      <p
        role="status"
        className={`rounded-xl border px-3 py-2 text-sm font-medium ${matches ? 'border-emerald-400/50 text-emerald-300' : 'border-danger/50 text-danger'}`}
        data-certificate-check={hash === null ? 'pending' : matches ? 'match' : 'mismatch'}
      >
        {hash === null
          ? 'Computing…'
          : matches
            ? 'Match: this payload is exactly what was certified.'
            : text === payload
              ? 'Mismatch: the stored hash does not belong to this payload.'
              : 'Mismatch: the text was changed, so it is no longer what was certified.'}
      </p>
      <label htmlFor={`${id}-payload`} className="text-sm font-medium">
        Payload (canonical JSON: sorted keys, no whitespace). Try changing a character.
      </label>
      <textarea
        id={`${id}-payload`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={8}
        spellCheck={false}
        className={`${inputClass} font-mono text-xs`}
      />
      {text !== payload ? (
        <button type="button" onClick={() => setText(payload)} className={`${secondaryButton} self-start`}>
          Restore the certified payload
        </button>
      ) : null}
      <p className="text-xs text-muted">
        Same check on your own machine: save the payload to a file without a trailing newline, then run{' '}
        <span className="font-mono">sha256sum payload.json</span>.
      </p>
    </section>
  )
}
