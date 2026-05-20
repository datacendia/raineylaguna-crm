import { NextRequest, NextResponse } from 'next/server'
import { signSession, COOKIE_MAX_AGE_S } from '@/lib/auth'
import { verifyUserPassword, recordLogin } from '@/lib/users'
import { createRateLimiter, ipFromHeaders } from '@/lib/rate-limit'
import { verifyCode } from '@/lib/totp'
import { serverEnv } from '@/lib/env'

// 5 attempts / IP / minute. Burst limit on credential stuffing.
const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 5 })
// 5 bad TOTP codes / IP+user / 15 min. Once the password is correct,
// brute-forcing a 6-digit code is otherwise cheap.
const totpLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5 })

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

  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
    code?: string
  }
  const { email, password, code } = body

  if (!email || !password) {
    return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 })
  }

  const user = await verifyUserPassword(email, password)
  if (!user) {
    return NextResponse.json({ success: false }, { status: 401 })
  }

  // Second factor: required only once the user has confirmed enrolment.
  if (user.totp_enrolled_at) {
    if (!code) {
      return NextResponse.json({ success: false, needs_totp: true }, { status: 401 })
    }
    const totpRl = totpLimiter.check(`${ip}:${user.id}`)
    if (!totpRl.ok) {
      return NextResponse.json(
        { success: false, error: 'Too many TOTP attempts. Try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((totpRl.resetAt - Date.now()) / 1000))),
          },
        },
      )
    }
    if (!verifyCode(code, user.totp_secret)) {
      return NextResponse.json({ success: false, needs_totp: true }, { status: 401 })
    }
  }

  await recordLogin(user.id)
  const token = await signSession({ uid: user.id, email: user.email, role: user.role })
  const response = NextResponse.json({ success: true })
  response.cookies.set('crm_auth', token, {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === 'production',
    sameSite: 'strict',
    // Absolute 30-day lifetime; idle expiry (7d) and rolling refresh
    // are enforced in `verifySession` / `touchSession` (src/lib/auth.ts).
    maxAge: COOKIE_MAX_AGE_S,
    path: '/',
  })
  return response
}
