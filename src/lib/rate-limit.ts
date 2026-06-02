/**
 * In-process sliding-window rate limiter.
 *
 * Mirror of vigiaV2 src/lib/rate-limit.ts. Used by /api/auth/login to
 * blunt credential stuffing. Single-process, single-region; if we scale
 * horizontally this needs to move to a shared store.
 *
 * For horizontal scaling, `createDistributedRateLimiter()` backs the same
 * window with Redis (atomic INCR + PEXPIRE) when REDIS_URL is set, and falls
 * back to the in-process map per-call if Redis is briefly unreachable.
 */

import { serverEnv } from './env'
import type { Redis } from 'ioredis'

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

export interface DistributedRateLimiter {
  check(key: string): Promise<RateLimitResult>;
  reset(): Promise<void>;
  /** Which backend is active: 'redis' when REDIS_URL is set, else 'memory'. */
  backend(): 'redis' | 'memory';
}

async function getRedis(): Promise<Redis | null> {
  // Dynamic import keeps bullmq/ioredis out of this low-level module's static
  // graph (so edge bundles and unit tests don't pull the queue eagerly).
  const mod = await import('./queue');
  return mod.getRedisConnection();
}

async function redisCheck(
  redis: Redis,
  key: string,
  windowMs: number,
  max: number,
): Promise<RateLimitResult> {
  // Fixed-window counter. INCR is atomic; the first hit in a window sets the
  // TTL so the key self-expires.
  const count = await redis.incr(key);
  let ttl: number;
  if (count === 1) {
    await redis.pexpire(key, windowMs);
    ttl = windowMs;
  } else {
    ttl = await redis.pttl(key);
    if (ttl < 0) {
      await redis.pexpire(key, windowMs);
      ttl = windowMs;
    }
  }
  const resetAt = Date.now() + ttl;
  if (count > max) return { ok: false, remaining: 0, resetAt };
  return { ok: true, remaining: Math.max(0, max - count), resetAt };
}

/**
 * Rate limiter that prefers a shared Redis store (so limits hold across every
 * server instance) and degrades to the in-process limiter when REDIS_URL is
 * unset or Redis is momentarily unreachable. `name` namespaces the Redis keys
 * (e.g. 'login', 'totp') so independent limiters never collide.
 */
export function createDistributedRateLimiter(
  name: string,
  opts: RateLimitOptions = {},
): DistributedRateLimiter {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 5;
  const memory = createRateLimiter({ windowMs, max });
  const useRedis = Boolean(serverEnv.REDIS_URL);
  const prefix = `rl:${name}:`;

  async function check(key: string): Promise<RateLimitResult> {
    if (useRedis) {
      try {
        const redis = await getRedis();
        if (redis) return await redisCheck(redis, prefix + key, windowMs, max);
      } catch {
        // Redis hiccup → fall back to the in-process limiter for this call.
      }
    }
    return memory.check(key);
  }

  async function reset(): Promise<void> {
    memory.reset();
    // Redis keys expire on their own; no explicit flush needed.
  }

  return { check, reset, backend: () => (useRedis ? 'redis' : 'memory') };
}

export function ipFromHeaders(headers: { get(name: string): string | null }): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
