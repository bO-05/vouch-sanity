import type {Metadata} from 'next'
import Link from 'next/link'
import {notFound} from 'next/navigation'
import {timeAgo} from '@/lib/format'
import {isPublicDocumentId} from '@/lib/ids'
import {CERTIFICATE_QUERY, type CertificateDetail} from '@/lib/queries'
import {fetchPublished} from '@/lib/sanity/live'
import {CertificateCheck} from './certificate-check'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Fulfilment certificate',
  description: 'What was verified when a Vouch request was fulfilled, with a SHA-256 you can recompute in your browser.',
}

type Payload = {
  checklist?: Array<{item?: string; quantity?: number; unit?: string | null}>
  pledges?: Array<{donor?: string; item?: string; quantity?: number}>
  receipt?: {uploadedBy?: string | null; coverage?: number | null; matches?: Array<{item?: string; receiptLine?: string | null; probability?: number}>}
  verifiedBy?: {kind?: string; reviewer?: string | null; model?: string | null}
}

function parse(payload: string): Payload | null {
  try {
    const value: unknown = JSON.parse(payload)
    return typeof value === 'object' && value !== null ? (value as Payload) : null
  } catch {
    return null
  }
}

export default async function CertificatePage({params}: PageProps<'/certificates/[id]'>) {
  const {id} = await params
  if (!isPublicDocumentId(id)) notFound()
  const certificate = await fetchPublished<CertificateDetail | null>(CERTIFICATE_QUERY, {id})
  if (!certificate) notFound()
  const data = parse(certificate.payload)
  const verifiedBy =
    data?.verifiedBy?.kind === 'volunteer'
      ? `volunteer verifier ${data.verifiedBy.reviewer ?? ''}`.trim()
      : data?.verifiedBy?.kind === 'jev_and_policy'
        ? `Jev (${data.verifiedBy.model ?? 'model unknown'}) and the policy thresholds, no person needed`
        : 'unknown'

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      {certificate.need ? (
        <Link href={`/requests/${certificate.need._id}`} className="text-sm text-muted hover:text-foreground">
          ← Back to “{certificate.need.title}”
        </Link>
      ) : null}
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Fulfilment certificate</p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{certificate.need?.title ?? 'A Vouch request'}</h1>
        <p className="text-muted">
          {certificate.need ? `${certificate.need.displayName} · ${certificate.need.city}, ${certificate.need.country} · ` : ''}
          issued {timeAgo(certificate.issuedAt) ?? 'at an unknown time'}. Verified by {verifiedBy}.
        </p>
      </header>

      {data ? (
        <section className="grid gap-6 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2 sm:p-6">
          <div className="flex flex-col gap-2 text-sm">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Receipt matches</h2>
            <ul className="flex flex-col gap-1">
              {(data.receipt?.matches ?? []).map((match, index) => (
                <li key={index}>
                  <span className="font-medium">{match.item}</span> ← <span className="font-mono text-xs">{match.receiptLine}</span>
                  {typeof match.probability === 'number' ? <span className="text-muted"> (p = {match.probability.toFixed(2)})</span> : null}
                </li>
              ))}
            </ul>
            <p className="text-muted">
              Coverage {typeof data.receipt?.coverage === 'number' ? `${Math.round(data.receipt.coverage * 100)}%` : 'unknown'} of the
              checklist · receipt uploaded by {data.receipt?.uploadedBy ?? 'someone'}
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Pledged by</h2>
            {(data.pledges ?? []).length === 0 ? (
              <p className="text-muted">No pledges were recorded; the receipt alone closed the loop.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {(data.pledges ?? []).map((pledge, index) => (
                  <li key={index}>
                    {pledge.donor}: {pledge.quantity} × {pledge.item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      <CertificateCheck payload={certificate.payload} sha256={certificate.sha256} />

      <p className="text-xs text-muted">
        The certificate is a public Sanity document ({certificate._id}). It records what Vouch checked, not the truth of the world:
        Jev and the verifier saw a receipt, not the goods changing hands.
      </p>
    </main>
  )
}
