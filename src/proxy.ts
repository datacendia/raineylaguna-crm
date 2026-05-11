import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySession } from '@/lib/auth'

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
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get('crm_auth')?.value
  const session = await verifySession(token)
  const path = request.nextUrl.pathname
  const isLoginPage = path === '/login'
  const isApi = path.startsWith('/api/')
  const isAuthApi = path.startsWith('/api/auth/')

  if (!session && !isLoginPage && !isAuthApi) {
    if (isApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/api/leads/:path*', '/api/outreach/:path*', '/api/video-audits/:path*', '/api/import', '/api/stats', '/api/batch'],
}
