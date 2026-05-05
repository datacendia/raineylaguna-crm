import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, signSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { password } = await request.json()

  if (await verifyPassword(password)) {
    const token = await signSession()
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
