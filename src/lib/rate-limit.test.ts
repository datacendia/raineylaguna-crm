import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  createRateLimiter,
  createDistributedRateLimiter,
  ipFromHeaders,
} from './rate-limit'

describe('createRateLimiter (in-process)', () => {
  it('allows up to max then blocks within the window', () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 3 })
    expect(rl.check('a').ok).toBe(true)
    expect(rl.check('a').ok).toBe(true)
    const third = rl.check('a')
    expect(third.ok).toBe(true)
    expect(third.remaining).toBe(0)
    expect(rl.check('a').ok).toBe(false)
  })

  it('tracks keys independently', () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 1 })
    expect(rl.check('a').ok).toBe(true)
    expect(rl.check('a').ok).toBe(false)
    expect(rl.check('b').ok).toBe(true)
  })

  it('resets after the window elapses', () => {
    vi.useFakeTimers()
    try {
      const rl = createRateLimiter({ windowMs: 1000, max: 1 })
      expect(rl.check('a').ok).toBe(true)
      expect(rl.check('a').ok).toBe(false)
      vi.advanceTimersByTime(1001)
      expect(rl.check('a').ok).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reset() clears all buckets', () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 1 })
    expect(rl.check('a').ok).toBe(true)
    expect(rl.check('a').ok).toBe(false)
    rl.reset()
    expect(rl.check('a').ok).toBe(true)
  })
})

describe('createDistributedRateLimiter', () => {
  const original = process.env.REDIS_URL
  afterEach(() => {
    if (original === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = original
  })

  it('uses the in-process backend and enforces the limit when REDIS_URL is unset', async () => {
    delete process.env.REDIS_URL
    const rl = createDistributedRateLimiter('test', { windowMs: 60_000, max: 2 })
    expect(rl.backend()).toBe('memory')
    expect((await rl.check('x')).ok).toBe(true)
    expect((await rl.check('x')).ok).toBe(true)
    expect((await rl.check('x')).ok).toBe(false)
  })

  it('reports the redis backend when REDIS_URL is set', () => {
    // Only backend() is asserted (no check()), so no Redis socket is opened.
    process.env.REDIS_URL = 'redis://localhost:6379'
    const rl = createDistributedRateLimiter('test2', { windowMs: 60_000, max: 2 })
    expect(rl.backend()).toBe('redis')
  })
})

describe('ipFromHeaders', () => {
  const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null })

  it('prefers the first hop of x-forwarded-for', () => {
    expect(ipFromHeaders(h({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip', () => {
    expect(ipFromHeaders(h({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
  })

  it("returns 'unknown' when no client headers are present", () => {
    expect(ipFromHeaders(h({}))).toBe('unknown')
  })
})
