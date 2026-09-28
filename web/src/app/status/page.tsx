import type {Metadata} from 'next'
import Link from 'next/link'
import type {CatalogItem} from '@/lib/catalog-match'
import {CATALOG_QUERY, CATEGORY_OPTIONS_QUERY} from '@/lib/queries'
import {fetchPublished} from '@/lib/sanity/live'
import {StatusView} from './status-view'

// The catalog (for editing a sent-back request) is content: always the current one.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'My requests',
  description: 'The private status of your request for help.',
  robots: {index: false, follow: false},
}

export default async function StatusPage() {
  // The catalog is only needed to edit a sent-back request. The page works without it, but the edit
  // form must say why it can't be used rather than pretend the items left the catalog.
  let catalog: CatalogItem[] = []
  let categories: Array<{title: string}> = []
  let catalogError: string | null = null
  try {
    ;[catalog, categories] = await Promise.all([
      fetchPublished<CatalogItem[]>(CATALOG_QUERY),
      fetchPublished<Array<{title: string}>>(CATEGORY_OPTIONS_QUERY),
    ])
  } catch (error) {
    catalogError = error instanceof Error ? error.message : 'Unknown error'
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← All verified requests
      </Link>
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">My requests</p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Your request, privately</h1>
        <p className="text-muted">
          This page is only reachable with your private link. The secret part (after the #) never leaves your browser
          except to look up your request, and Vouch stores only a fingerprint (SHA-256) of it.
        </p>
      </header>
      <StatusView
        catalog={catalog}
        categoryOrder={categories.map((category) => category.title)}
        catalogError={catalogError}
      />
    </main>
  )
}
