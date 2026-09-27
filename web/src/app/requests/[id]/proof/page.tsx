import type {Metadata} from 'next'
import Link from 'next/link'
import {notFound} from 'next/navigation'
import {isPublicDocumentId} from '@/lib/ids'
import {POLICY_QUERY, PROOF_PAGE_QUERY, type ProofPageNeed} from '@/lib/queries'
import {fetchPublished} from '@/lib/sanity/live'
import {parsePolicy} from '@/lib/triage'
import {ProofUploader} from './proof-uploader'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Upload the receipt',
  description: 'Close the loop: a receipt, read in your browser and checked against the checklist.',
}

export default async function ProofPage({params}: PageProps<'/requests/[id]/proof'>) {
  const {id} = await params
  if (!isPublicDocumentId(id)) notFound()
  const [need, rawPolicy] = await Promise.all([
    fetchPublished<ProofPageNeed | null>(PROOF_PAGE_QUERY, {id}),
    fetchPublished<unknown>(POLICY_QUERY),
  ])
  if (!need) notFound()
  const policy = parsePolicy(rawPolicy)
  const items = (need.items ?? []).map((item) => ({
    key: item._key,
    name: item.name ?? 'Unknown item',
    unit: item.unit,
    quantity: item.quantity,
  }))

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      <Link href={`/requests/${need._id}`} className="text-sm text-muted hover:text-foreground">
        ← Back to “{need.title}”
      </Link>
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Close the loop</p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Upload the receipt</h1>
        <p className="max-w-3xl text-muted">
          Bought the items for {need.displayName} in {need.city}? Take a photo of the receipt. Your browser reads it
          (Tesseract.js, nothing leaves your device until you submit), you fix any misread lines, and Jev checks which
          checklist item each line bought. If the receipt covers the checklist, the request is marked fulfilled and a
          certificate is issued; otherwise a volunteer verifier looks at the photo.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">This request has no checklist yet.</p>
      ) : (
        // Always mounted: Sanity Live refreshes this page when the request's stage changes (right after a
        // submit), and the uploader must keep its state to show the check it started.
        <ProofUploader
          needId={need._id}
          items={items}
          stage={need.stage}
          minSimilarity={policy.ok ? policy.policy.thresholds.proofMinOcrSimilarity : null}
        />
      )}
    </main>
  )
}
