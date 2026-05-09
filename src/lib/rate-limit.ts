/**
 * In-process sliding-window rate limiter.
 *
 * Mirror of vigiaV2 src/lib/rate-limit.ts. Used by /api/auth/login to
 * blunt credential stuffing. Single-process, single-region; if we scale
 * horizontally this needs to move to a shared store.
 */

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

type Bucket = { count: number; resetAt: number };

export function createRateLimiter(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 5;
  const buckets = new Map<string, Bucket>();

  function check(key: string): RateLimitResult {
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt < now) {
      const fresh: Bucket = { count: 1, resetAt: now + windowMs };
      buckets.set(key, fresh);
      return { ok: true, remaining: max - 1, resetAt: fresh.resetAt };
    }
    if (existing.count >= max) {
      return { ok: false, remaining: 0, resetAt: existing.resetAt };
    }
    existing.count++;
    return { ok: true, remaining: max - existing.count, resetAt: existing.resetAt };
  }

  function reset(): void {
    buckets.clear();
  }

  return { check, reset };
}

export function ipFromHeaders(headers: { get(name: string): string | null }): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
