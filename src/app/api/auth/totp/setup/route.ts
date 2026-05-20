import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { findUserById, setPendingTotpSecret } from '@/lib/users'
import { generateSecret, otpauthUri, qrDataUrl } from '@/lib/totp'

/**
 * Begin TOTP enrolment.
 *
 * Returns the secret + a QR data URL ready for the operator's
 * authenticator app. The secret is stored on the user row immediately
 * (with `totp_enrolled_at = NULL`), so a refresh of `/dashboard/security`
 * will keep showing the same QR until the operator confirms the code
 * via `POST /api/auth/totp/verify`.
 *
 * Login is unaffected until `totp_enrolled_at` is non-null.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession(request.cookies.get('crm_auth')?.value)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const user = await findUserById(session.uid)
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (user.totp_enrolled_at) {
    return NextResponse.json(
      { error: 'already_enrolled', message: 'Disable TOTP first to re-enrol.' },
      { status: 409 },
    )
  }

  const secret = generateSecret()
  await setPendingTotpSecret(user.id, secret)
  const uri = otpauthUri(user.email, secret)
  const qr = await qrDataUrl(uri)
  return NextResponse.json({ secret, qrDataUrl: qr, otpauthUri: uri })
}
