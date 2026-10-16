import type { Metadata } from 'next'
import './globals.css'

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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
