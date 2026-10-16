import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function resolveIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    null
  )
}

function describeDevice(userAgent: string): string {
  const os = /Windows NT 10/i.test(userAgent)
    ? 'Windows NT 10'
    : /Windows/i.test(userAgent)
      ? 'Windows'
      : /Mac OS X/i.test(userAgent)
        ? 'macOS'
        : /Android/i.test(userAgent)
          ? 'Android'
          : /iPhone|iPad|iOS/i.test(userAgent)
            ? 'iOS'
            : /Linux/i.test(userAgent)
              ? 'Linux'
              : 'Unknown OS'

  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /OPR\//i.test(userAgent)
      ? 'Opera'
      : /Chrome\//i.test(userAgent)
        ? 'Chrome'
        : /Firefox\//i.test(userAgent)
          ? 'Firefox'
          : /Safari\//i.test(userAgent)
            ? 'Safari'
            : 'Unknown Browser'

  return `${os} (${browser})`
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = data.user
      if (user) {
        try {
          const admin = createAdminClient()
          const userAgent = request.headers.get('user-agent') ?? ''
          await admin.from('login_sessions').insert({
            user_id: user.id,
            ip_address: resolveIp(request),
            user_agent: userAgent.slice(0, 512),
            device: describeDevice(userAgent),
            provider: user.app_metadata?.provider ?? 'oauth',
          })
        } catch {
          // Audit logging must never block a successful sign-in.
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page or auth page with instructions
  return NextResponse.redirect(`${origin}/auth?error=Could%20not%20authenticate%20user`)
}