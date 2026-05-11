import { SignJWT, jwtVerify } from 'jose'
import { serverEnv } from './env'

const secret = () => new TextEncoder().encode(serverEnv.CRM_COOKIE_SECRET ?? '')

/**
 * Session lifetime model
 *
 * - **Absolute lifetime (30 days):** signed into the JWT `exp` claim at
 *   login. Hard ceiling; after this the session is invalid regardless
 *   of activity.
 * - **Idle lifetime (7 days):** enforced by checking `lastSeenAt`
 *   against `now` on every verification. If the gap exceeds 7 days, we
 *   reject the session even if `exp` says it's still valid.
 * - **Rolling refresh:** every protected request (handled in
 *   `src/proxy.ts`) calls `touchSession` to mint a refreshed cookie
 *   whose `lastSeenAt` is bumped to now. To avoid signing JWTs on every
 *   request, refreshes only happen if at least `TOUCH_INTERVAL_MS`
 *   (1 hour) has passed since the last bump.
 *
 * Net effect: an active operator stays logged in continuously up to
 * 30 days; an idle operator is signed out after 7 days.
 */
export const ABSOLUTE_LIFETIME_S = 30 * 24 * 60 * 60 // 30 days
export const IDLE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
export const TOUCH_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
export const COOKIE_MAX_AGE_S = ABSOLUTE_LIFETIME_S

export interface SessionPayload {
  uid: string
  email: string
  role: string
  /** ms since epoch of the last successful proxy-gate touch. */
  lastSeenAt: number
}

export async function signSession(
  payload: Omit<SessionPayload, 'lastSeenAt'> & { lastSeenAt?: number },
): Promise<string> {
  const lastSeenAt = payload.lastSeenAt ?? Date.now()
  return new SignJWT({ ...payload, lastSeenAt })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ABSOLUTE_LIFETIME_S}s`)
    .sign(secret())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    const sess = payload as unknown as SessionPayload
    // Idle check — absolute is enforced by jose via `exp`.
    if (typeof sess.lastSeenAt !== 'number') return null
    if (Date.now() - sess.lastSeenAt > IDLE_LIFETIME_MS) return null
    return sess
  } catch {
    return null
  }
}

/**
 * If the session's `lastSeenAt` is older than `TOUCH_INTERVAL_MS`,
 * return a freshly-signed JWT with the bump applied. Otherwise return
 * null to signal "no cookie refresh needed" — most requests will fall
 * through this fast path and skip the JWT sign.
 */
export async function touchSession(sess: SessionPayload): Promise<string | null> {
  const now = Date.now()
  if (now - sess.lastSeenAt < TOUCH_INTERVAL_MS) return null
  return signSession({ uid: sess.uid, email: sess.email, role: sess.role, lastSeenAt: now })
}
