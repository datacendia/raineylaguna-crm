/**
 * TOTP (RFC 6238) helpers for CRM operator 2FA.
 *
 * Thin wrapper over `otplib/authenticator` that pins the project's
 * defaults in one place:
 *   - 6 digits
 *   - 30-second time-step
 *   - 1-step drift window (i.e. ±30 s) — tolerates clock skew without
 *     opening the door to extended replay.
 *
 * Keeping this in a dedicated module lets tests stub it without
 * dragging in the full enrolment / login surface.
 */
import { authenticator } from 'otplib'
import QRCode from 'qrcode'

authenticator.options = {
  digits: 6,
  step: 30,
  window: 1,
}

export const TOTP_ISSUER = 'Rainey Laguna CRM'

/** Generate a fresh base32 secret to seed an authenticator app. */
export function generateSecret(): string {
  return authenticator.generateSecret()
}

/** Build the `otpauth://` URI used to populate the QR code. */
export function otpauthUri(email: string, secret: string): string {
  return authenticator.keyuri(email, TOTP_ISSUER, secret)
}

/** Render the otpauth URI as a data:image/png URL for the enrolment UI. */
export async function qrDataUrl(otpauth: string): Promise<string> {
  return QRCode.toDataURL(otpauth)
}

/**
 * Verify a 6-digit TOTP code against a stored secret.
 *
 * Accepts the current step plus ±1 step to tolerate clock skew. Always
 * rejects malformed input (non-string, wrong length, non-digit chars)
 * before invoking the underlying primitive — keeps the surface small
 * and shields callers from `otplib` throwing on garbage input.
 */
export function verifyCode(code: unknown, secret: string | null | undefined): boolean {
  if (!secret) return false
  if (typeof code !== 'string') return false
  if (!/^\d{6}$/.test(code)) return false
  try {
    return authenticator.verify({ token: code, secret })
  } catch {
    return false
  }
}

/** Produce a code for the current time-step; test-only helper. */
export function generateCode(secret: string): string {
  return authenticator.generate(secret)
}
