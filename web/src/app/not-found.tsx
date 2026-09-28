import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 py-16 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">404</p>
      <h1 className="text-2xl font-semibold">Nothing here</h1>
      <p className="text-muted">
        This page doesn&apos;t exist. If someone sent you a link to a request or a certificate, it may not be public (yet):
        in Vouch, unverified requests stay private Sanity drafts.
      </p>
      <Link href="/" className="text-sm text-amber hover:underline">
        ← See verified requests
      </Link>
    </main>
  )
}
