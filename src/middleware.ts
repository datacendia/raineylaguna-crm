import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySession } from '@/lib/auth'

export async function middleware(request: NextRequest) {
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
