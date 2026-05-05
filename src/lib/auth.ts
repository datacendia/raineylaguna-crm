import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const secret = () => new TextEncoder().encode(process.env.CRM_COOKIE_SECRET ?? '')

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.CRM_PASSWORD_HASH
  if (!hash) return false
  return bcrypt.compare(password, hash)
}

export async function signSession(): Promise<string> {
  return new SignJWT({ admin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret())
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    await jwtVerify(token, secret())
    return true
  } catch {
    return false
  }
}
