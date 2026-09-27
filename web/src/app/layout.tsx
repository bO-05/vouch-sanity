import type {Metadata} from 'next'
import {Geist, Geist_Mono} from 'next/font/google'
import Link from 'next/link'
import {
  LiveStatus,
  onLiveError,
  onLiveGoAway,
  onLiveReconnect,
  onLiveWelcome,
} from '@/components/live-status'
import {SanityLive} from '@/lib/sanity/live'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {default: 'Vouch: verified mutual aid', template: '%s · Vouch'},
  description:
    "Neighbors ask for help in their own words. Jev makes typed decisions, volunteers verify, receipts close the loop. The AI can't write a single sentence.",
}

export default function RootLayout({children}: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <div className="border-b border-border">
          <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
            <Link href="/" className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-amber">
              Vouch
            </Link>
            <div className="flex items-center gap-4">
              <LiveStatus />
              <Link href="/status" className="text-sm text-muted hover:text-foreground">
                My requests
              </Link>
              <Link
                href="/ask"
                className="rounded-full bg-amber px-3.5 py-1.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                Ask for help
              </Link>
            </div>
          </nav>
        </div>
        {children}
        {/* Published content only: refresh the router whenever the Live Content API reports a change. */}
        <SanityLive
          action="refresh"
          onWelcome={onLiveWelcome}
          onReconnect={onLiveReconnect}
          onError={onLiveError}
          onGoAway={onLiveGoAway}
        />
      </body>
    </html>
  )
}
