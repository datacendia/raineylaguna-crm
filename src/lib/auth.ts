import { SignJWT, jwtVerify } from 'jose'

const secret = () => new TextEncoder().encode(process.env.CRM_COOKIE_SECRET ?? '')

export interface SessionPayload {
  uid: string
  email: string
  role: string
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}
