import { NextRequest, NextResponse } from 'next/server'
import { signSession } from '@/lib/auth'
import { verifyUserPassword } from '@/lib/users'

export async function POST(request: NextRequest) {
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
    return response
  }

  return NextResponse.json({ success: false }, { status: 401 })
}
