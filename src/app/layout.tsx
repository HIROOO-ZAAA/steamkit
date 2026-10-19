import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { SIDEBAR_COLLAPSE_BOOTSTRAP } from '@/lib/sidebar'

export const metadata: Metadata = {
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
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <Script id="sidebar-collapse-bootstrap" strategy="beforeInteractive">
          {SIDEBAR_COLLAPSE_BOOTSTRAP}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
