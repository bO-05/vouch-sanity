import type {Metadata} from 'next'
import Link from 'next/link'
import type {CatalogItem} from '@/lib/catalog-match'
import {CATALOG_QUERY, CATEGORY_OPTIONS_QUERY} from '@/lib/queries'
import {fetchPublished} from '@/lib/sanity/live'
import {AskForm} from './ask-form'

// The catalog is content: edits in the Studio show up here on the next visit.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ask for help',
  description:
    'Ask your neighbors for help in your own words. Jev suggests a checklist from the catalog; anything uncertain goes to a volunteer verifier.',
}

export default async function AskPage() {
  let catalog: CatalogItem[] = []
  let categoryOrder: string[] = []
  let loadError: string | null = null
  try {
    const [items, categories] = await Promise.all([
      fetchPublished<CatalogItem[]>(CATALOG_QUERY),
      fetchPublished<Array<{title: string}>>(CATEGORY_OPTIONS_QUERY),
    ])
    catalog = items
    categoryOrder = categories.map((category) => category.title)
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unknown error'
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← All verified requests
      </Link>
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Ask for help</p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Tell your neighbors what you need</h1>
        <p className="text-muted">
          Write it or say it in your own words. Jev, a decision model that can&apos;t write a single sentence, suggests a
          checklist from the supply catalog and checks the request against Vouch&apos;s policy. Anything uncertain goes to
          a volunteer verifier. Vouch is not an emergency service.
        </p>
      </header>

      {loadError ? (
        <div role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 text-sm">
          <p className="font-medium text-danger">Couldn&apos;t load the supply catalog from Sanity.</p>
          <p className="mt-1 font-mono text-xs text-muted">{loadError}</p>
        </div>
      ) : (
        <AskForm catalog={catalog} categoryOrder={categoryOrder} />
      )}
    </main>
  )
}
