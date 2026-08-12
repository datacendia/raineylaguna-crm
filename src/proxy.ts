import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySession, touchSession, COOKIE_MAX_AGE_S } from '@/lib/auth'
import { serverEnv } from '@/lib/env'

/**
 * Edge gate for CRM. Next 16 renamed the file convention from `middleware`
 * to `proxy` (same Edge runtime, same `config.matcher` semantics) — see
 * https://nextjs.org/docs/messages/middleware-to-proxy. The exported name
 * was renamed accordingly.
 *
 * Responsibilities:
 *   - Bounces unauthenticated requests on protected routes to /login.
 *   - For protected API routes, returns 401 JSON rather than redirecting.
 *   - Sends an authenticated user away from /login into /dashboard.
 *   - Rolling-refreshes the session cookie: on each authenticated
 *     request older than `TOUCH_INTERVAL_MS`, mint a fresh JWT with
 *     `lastSeenAt` bumped to now. This is what gives the operator
 *     a continuous 30-day session as long as they remain active.
 */
// Genuinely public, secret-authenticated API paths that must bypass the
// session gate. Each enforces its own shared-secret check internally. (Public
// webhooks live under /api/webhooks/* which is intentionally outside the
// matcher below, so they never reach this gate at all.)
const PUBLIC_API_PATHS = new Set(['/api/leads/public'])

/**
 * Content-Security-Policy.
 *
 * This lives here rather than in next.config.js because it carries a
 * per-request nonce. The App Router emits its bootstrap and RSC flight payload
 * as inline <script> tags, so the previous static `script-src 'self'` blocked
 * Next's own output: pages rendered but never hydrated, which left /login as
 * dead HTML because its submit handler never bound.
 *
 * Next reads the nonce back off the *request* CSP header and stamps it onto
 * every script it injects, so the policy keeps its teeth without falling back
 * to 'unsafe-inline'. The nonce covers the inline tags; plain 'self' covers
 * the /_next/static chunks they pull in. 'strict-dynamic' is deliberately not
 * used: it makes browsers ignore 'self', so any chunk that failed to pick up
 * the nonce would be blocked instead of merely unhardened, and this app loads
 * no third-party scripts for it to protect against.
 *
 * The nonce is only reachable while a page renders, so the root layout opts
 * out of prerendering; see src/app/layout.tsx.
 *
 * next.config.js must not also send a Content-Security-Policy: two of them on
 * one response are intersected by the browser, which would re-block the very
 * scripts this nonce exists to allow.
 */
function buildCsp(nonce: string): string {
  // The dev server compiles with eval(); production bundles never do.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    serverEnv.NODE_ENV === 'production' ? null : "'unsafe-eval'",
  ]
    .filter(Boolean)
    .join(' ')

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  // btoa rather than Buffer so this holds on both the Edge and Node runtimes.
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)

  const withCsp = <T extends NextResponse>(response: T): T => {
    response.headers.set('Content-Security-Policy', csp)
    return response
  }

  // Pass-through responses carry the nonce forward on the request headers,
  // which is where Next looks for it when rendering.
  const passThrough = () => {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', csp)
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }))
  }

  const token = request.cookies.get('crm_auth')?.value
  const session = await verifySession(token)
  const path = request.nextUrl.pathname
  const isLoginPage = path === '/login'
  const isApi = path.startsWith('/api/')
  const isAuthApi = path.startsWith('/api/auth/')
  const isPublicApi = PUBLIC_API_PATHS.has(path)

  if (!session && !isLoginPage && !isAuthApi && !isPublicApi) {
    if (isApi)
      return withCsp(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    return withCsp(NextResponse.redirect(new URL('/login', request.url)))
  }

  if (session && isLoginPage) {
    return withCsp(NextResponse.redirect(new URL('/dashboard', request.url)))
  }

  // Rolling refresh: if the session is older than one TOUCH_INTERVAL,
  // mint a new cookie with `lastSeenAt = now`. Skipping this fast path
  // for unauthenticated requests and login-page hits saves a JWT sign
  // on the hot path.
  if (session) {
    const refreshed = await touchSession(session)
    if (refreshed) {
      const response = passThrough()
      response.cookies.set('crm_auth', refreshed, {
        httpOnly: true,
        secure: serverEnv.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE_S,
        path: '/',
      })
      return response
    }
  }

  return passThrough()
}

// Everything not listed here bypasses the session gate entirely, so adding a
// route under /api that reads lead data WITHOUT adding it here silently
// publishes that data. /api/analytics was exactly that: it returns named leads,
// their districts, health scores and generated pitch copy, and was reachable
// unauthenticated until it was added below.
//
// Genuinely-public exceptions are /api/health, /api/auth/* (handled above),
// /api/leads/public (own shared secret) and /api/webhooks/* (own shared
// secrets) — those are deliberately outside the matcher.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/api/analytics',
    '/api/leads/:path*',
    '/api/outreach/:path*',
    '/api/video-audits/:path*',
    '/api/import',
    '/api/stats',
    '/api/batch',
    '/api/drafts',
    '/api/drafts/:path*',
  ],
}
