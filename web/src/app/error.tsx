'use client'

import Link from 'next/link'
import {useEffect} from 'react'
import {primaryButton, secondaryButton} from '@/components/form'

/**
 * Anything a page didn't handle itself. Pages catch their own Sanity reads and say what failed;
 * this is the net under them. In production a server error arrives without its message (Next
 * only forwards a digest that matches the server log), so the page shows that reference.
 */
export default function AppError({error, retry}: {error: Error & {digest?: string}; retry: () => void}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 py-16 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-danger">Error</p>
      <h1 className="text-2xl font-semibold">This page didn&apos;t load</h1>
      <p className="text-muted">
        Something failed while loading it, usually a service that didn&apos;t answer in time (Sanity, the workflow engine or
        Jev). Try again, or come back in a minute.
      </p>
      {error.digest ? <p className="font-mono text-xs text-muted">Reference: {error.digest}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className={primaryButton}>
          Try again
        </button>
        <Link href="/" className={secondaryButton}>
          All verified requests
        </Link>
      </div>
    </main>
  )
}
