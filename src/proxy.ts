import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Renamed from `middleware.ts` on 2026-10-17: Next.js 16 calls this Proxy
// ("middleware" is deprecated and warns on every dev boot). Same behaviour,
// same file location — one level above `app`.
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    return NextResponse.redirect(url)
  }

  // Redirect authed users away from auth page
  if (pathname === '/auth' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  // `/_next` is excluded as a WHOLE, not as `_next/static` and `_next/image`.
  //
  // The websocket upgrade for HMR arrives at `/_next/hmr`, which the narrower
  // pattern did match: Proxy ran `supabase.auth.getUser()` on it and answered
  // with `NextResponse.next()`, which cannot be a websocket upgrade. Chrome
  // reported `net::ERR_INVALID_HTTP_RESPONSE` and, in development, no overlay
  // page hydrated at all — no effects, no Supabase request, no console output.
  // Every client-component overlay was untestable in `npm run dev` until this
  // was widened. Nothing here needs to guard Next's own routes.
  matcher: ['/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
