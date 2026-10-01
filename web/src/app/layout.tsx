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
        <header className="site-header">
          <nav className="site-nav" aria-label="Primary">
            <Link href="/" className="site-brand">
              <span className="site-brand-mark" aria-hidden="true">V</span>
              <span className="site-brand-name">Vouch</span>
            </Link>
            <div className="site-nav-links">
              <LiveStatus />
              <Link href="/desk" className="site-nav-link hidden whitespace-nowrap sm:inline">
                Verifier desk
              </Link>
              <Link href="/status" className="site-nav-link">
                My requests
              </Link>
              <Link href="/ask" className="site-nav-cta">
                Ask for help <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </nav>
        </header>
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
