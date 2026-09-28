'use client'

import './globals.css'

/** Only when the root layout itself fails: it replaces the whole document, so it brings its own html and body. */
export default function GlobalError({error, retry}: {error: Error & {digest?: string}; retry: () => void}) {
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col font-sans antialiased">
        <title>Vouch: something went wrong</title>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 py-16 sm:px-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-danger">Error</p>
          <h1 className="text-2xl font-semibold">Vouch didn&apos;t load</h1>
          <p className="text-muted">Something failed while loading the site. Try again, or come back in a minute.</p>
          {error.digest ? <p className="font-mono text-xs text-muted">Reference: {error.digest}</p> : null}
          <button
            type="button"
            onClick={() => retry()}
            className="self-start rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-background"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
