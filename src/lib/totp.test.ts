/**
 * Unit tests for `src/lib/totp.ts`.
 *
 * Pins three behaviours we depend on at the route layer:
 *   1. A freshly-generated secret round-trips through generate→verify.
 *   2. Garbage input (wrong length, non-numeric, wrong type, empty
 *      secret) is rejected without throwing.
 *   3. The ±1-step drift window is honoured: codes from the previous
 *      time-step still verify; codes from two steps back do not.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { authenticator } from 'otplib'
import {
  generateSecret,
  generateCode,
  verifyCode,
  otpauthUri,
  qrDataUrl,
  TOTP_ISSUER,
} from './totp'

afterEach(() => {
  vi.useRealTimers()
})

describe('totp', () => {
  it('generate → verify round-trip succeeds', () => {
    const secret = generateSecret()
    const code = generateCode(secret)
    expect(verifyCode(code, secret)).toBe(true)
  })

  it('rejects wrong code', () => {
    const secret = generateSecret()
    expect(verifyCode('000000', secret)).toBe(false)
  })

  it('rejects malformed input without throwing', () => {
    const secret = generateSecret()
    expect(verifyCode('', secret)).toBe(false)
    expect(verifyCode('12345', secret)).toBe(false)
    expect(verifyCode('1234567', secret)).toBe(false)
    expect(verifyCode('abcdef', secret)).toBe(false)
    expect(verifyCode(123456 as unknown, secret)).toBe(false)
    expect(verifyCode(null, secret)).toBe(false)
    expect(verifyCode(undefined, secret)).toBe(false)
  })

  it('rejects when secret is missing', () => {
    expect(verifyCode('123456', null)).toBe(false)
    expect(verifyCode('123456', undefined)).toBe(false)
    expect(verifyCode('123456', '')).toBe(false)
  })

  it('accepts code from previous 30 s time-step (drift window = 1)', () => {
    const secret = generateSecret()
    const baseMs = 1_700_000_000_000
    vi.useFakeTimers()
    vi.setSystemTime(baseMs)
    const oldCode = authenticator.generate(secret)
    vi.setSystemTime(baseMs + 30_000) // advance one step
    expect(verifyCode(oldCode, secret)).toBe(true)
  })

  it('rejects code from two steps in the past (outside drift window)', () => {
    const secret = generateSecret()
    const baseMs = 1_700_000_000_000
    vi.useFakeTimers()
    vi.setSystemTime(baseMs)
    const oldCode = authenticator.generate(secret)
    vi.setSystemTime(baseMs + 90_000) // advance three steps
    expect(verifyCode(oldCode, secret)).toBe(false)
  })

  it('otpauthUri encodes issuer + account', () => {
    const secret = generateSecret()
    const uri = otpauthUri('op@rainey.test', secret)
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain(encodeURIComponent(TOTP_ISSUER))
    expect(uri).toContain(encodeURIComponent('op@rainey.test'))
    expect(uri).toContain(`secret=${secret}`)
  })

  it('qrDataUrl returns a data:image/png URL', async () => {
    const url = await qrDataUrl(otpauthUri('op@rainey.test', generateSecret()))
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(url.length).toBeGreaterThan(100)
  })
})
