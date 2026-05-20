import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { findUserById } from '@/lib/users'

/**
 * Lightweight "who am I" endpoint for client components that need to
 * query the current operator's profile (in particular: TOTP enrolment
 * status for the security page). Never returns the password hash or
 * the TOTP secret.
 */
export async function GET(request: NextRequest) {
  const session = await verifySession(request.cookies.get('crm_auth')?.value)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const user = await findUserById(session.uid)
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    totp_enrolled_at: user.totp_enrolled_at,
  })
}
