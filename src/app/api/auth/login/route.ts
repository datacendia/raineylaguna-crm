import { NextRequest, NextResponse } from 'next/server'
import { signSession } from '@/lib/auth'
import { verifyUserPassword } from '@/lib/users'
import { createRateLimiter, ipFromHeaders } from '@/lib/rate-limit'

// 5 attempts / IP / minute. See src/lib/rate-limit.ts.
const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 5 })

export async function POST(request: NextRequest) {
  const ip = ipFromHeaders(request.headers)
  const rl = loginLimiter.check(ip)
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Try again in a minute.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
        },
      },
    )
  }

  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 })
  }

  const user = await verifyUserPassword(email, password)

  if (user) {
    const token = await signSession({ uid: user.id, email: user.email, role: user.role })
    const response = NextResponse.json({ success: true })
    response.cookies.set('crm_auth', token, {
      httpOnly: true,
      secure: serverEnv.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
    return response
  }

  return NextResponse.json({ success: false }, { status: 401 })
}
