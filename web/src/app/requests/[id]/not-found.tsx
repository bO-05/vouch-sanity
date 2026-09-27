import Link from 'next/link'

export default function RequestNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 py-16 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">404</p>
      <h1 className="text-2xl font-semibold">This request isn&apos;t public</h1>
      <p className="text-muted">
        Either it doesn&apos;t exist, or it hasn&apos;t been verified yet. In Vouch, a request stays a private
        Sanity draft until Jev&apos;s checks pass or a volunteer approves it, and drafts are never readable
        from the public dataset.
      </p>
      <Link href="/" className="text-sm text-amber hover:underline">
        ← See verified requests
      </Link>
    </main>
  )
}
