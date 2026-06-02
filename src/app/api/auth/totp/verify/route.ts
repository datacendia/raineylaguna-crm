import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { findUserById, confirmTotpEnrollment, disableTotp } from '@/lib/users'
import { verifyCode } from '@/lib/totp'
import { createDistributedRateLimiter, ipFromHeaders } from '@/lib/rate-limit'

// 5 bad codes / IP / 15 min while enrolling. Redis-backed when REDIS_URL is set.
const enrolLimiter = createDistributedRateLimiter('totp-enrol', { windowMs: 15 * 60_000, max: 5 })

/**
 * Confirm TOTP enrolment.
 *
 * Body: `{ code }` — the 6-digit code from the operator's authenticator
 * app. On success, `totp_enrolled_at` is stamped to NOW(), which is
 * what the login route checks to require TOTP. On too many failed
 * attempts we clear the pending secret entirely — forcing the operator
 * to restart enrolment rather than letting an attacker keep grinding.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession(request.cookies.get('crm_auth')?.value)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const ip = ipFromHeaders(request.headers)
  const rl = await enrolLimiter.check(`${ip}:${session.uid}`)
  if (!rl.ok) {
    await disableTotp(session.uid)
    return NextResponse.json(
      { error: 'too_many_attempts', message: 'Enrolment reset. Start over.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
        },
      },
    )
  }

  const body = (await request.json().catch(() => ({}))) as { code?: string }
  if (!body.code) {
    return NextResponse.json({ error: 'code_required' }, { status: 400 })
  }

  const user = await findUserById(session.uid)
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!user.totp_secret) {
    return NextResponse.json({ error: 'no_pending_enrolment' }, { status: 409 })
  }

  if (!verifyCode(body.code, user.totp_secret)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
  }

  await confirmTotpEnrollment(user.id)
  return NextResponse.json({ success: true })
}

/** Disable TOTP for the current user. */
export async function DELETE(request: NextRequest) {
  const session = await verifySession(request.cookies.get('crm_auth')?.value)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  await disableTotp(session.uid)
  return NextResponse.json({ success: true })
}
