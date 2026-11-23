import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { DASHBOARD_THEME_BOOTSTRAP } from '@/lib/dashboard-theme'
import { SIDEBAR_COLLAPSE_BOOTSTRAP } from '@/lib/sidebar'

// Public pages build absolute Open Graph URLs from this base. Without it Next
// falls back to the request host, which is localhost behind a reverse proxy and
// silently produces social preview links that point at the wrong origin.
function parseSiteUrl(value: string | undefined): URL | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

const SITE_URL =
  parseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
  parseSiteUrl(process.env.NEXT_PUBLIC_APP_URL) ??
  new URL('http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: 'Steam Kit Stream — Live Creator Control Room',
  description: 'One control room for supporter activity, OBS overlays, and creator workflows built for the pace of a live stream.',
  keywords: 'streaming, live dashboard, donations, alerts, obs overlays, real-time',
  openGraph: {
    title: 'Steam Kit Stream — Live Creator Control Room',
    description: 'Supporter activity, overlays, and creator workflows in one clear control room.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // globals.css sets `scroll-behavior: smooth` on <html>. Next.js cannot carry
  // that across a route transition on its own, so it asks for this attribute
  // explicitly -- without it every navigation logs a console warning and the
  // smooth scroll is dropped mid-transition.
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <Script id="sidebar-collapse-bootstrap" strategy="beforeInteractive">
          {SIDEBAR_COLLAPSE_BOOTSTRAP}
        </Script>
        <Script id="dashboard-theme-bootstrap" strategy="beforeInteractive">
          {DASHBOARD_THEME_BOOTSTRAP}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
