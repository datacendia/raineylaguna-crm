/**
 * BullMQ outreach queue — lazy-init wrapper.
 *
 * Why lazy: importing this module previously constructed `new IORedis(...)`
 * and `new Queue(...)` at module-load time, which immediately opens a TCP
 * connection. On Railway environments where REDIS_URL is unset (or Redis
 * isn't reachable yet), the ioredis client retries forever and floods
 * stderr with ECONNREFUSED — burying real boot logs and, in pathological
 * cases, the deploy never settles into a "ready" state.
 *
 * The Next.js server happens to load every route handler (including
 * /api/batch) during static-analysis output-trace generation, so even
 * routes that are never called caused the eager connection in production.
 *
 * Now both the Redis client and the Queue are lazily constructed on first
 * access via `getOutreachQueue()`. Pages and middleware that don't enqueue
 * outreach jobs never open a Redis socket. Only the `/api/batch` handler
 * (and the standalone outreach-worker script) actually trigger the connect.
 */

import { Queue } from 'bullmq'
import IORedis, { type Redis } from 'ioredis'
import { serverEnv } from './env'

export type OutreachJob = {
  lead_id: string
  channel: 'Email' | 'Instagram DM' | 'WhatsApp' | 'LinkedIn'
  body: string
  /** Subject line for Email sends; ignored by other channels. */
  subject?: string
  template_id?: string
}

let _connection: Redis | null = null
let _queue: Queue<OutreachJob> | null = null

/**
 * Returns the shared Redis client, creating it on first call. `null` is
 * returned if no REDIS_URL is configured and we're running in production —
 * callers should treat that as "queue unavailable" and degrade gracefully
 * (the /api/batch route falls back to a 503 with a clear message).
 *
 * In development, falls back to `redis://localhost:6379` for convenience.
 */
export function getRedisConnection(): Redis | null {
  if (_connection) return _connection
  const url =
    serverEnv.REDIS_URL ??
    (serverEnv.NODE_ENV !== 'production' ? 'redis://localhost:6379' : null)
  if (!url) return null
  _connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    // Don't spam stderr with a retry storm if Redis is unreachable;
    // surface one warning per minute and let the caller decide what to do.
    lazyConnect: false,
    enableOfflineQueue: false,
  })
  let lastWarn = 0
  _connection.on('error', (err) => {
    const now = Date.now()
    if (now - lastWarn > 60_000) {
      console.warn(`[queue] redis error (suppressing for 60s): ${err.message}`)
      lastWarn = now
    }
  })
  return _connection
}

/**
 * Returns the outreach Queue, creating it on first call. `null` when Redis
 * isn't configured — callers (only /api/batch today) check and 503.
 */
export function getOutreachQueue(): Queue<OutreachJob> | null {
  if (_queue) return _queue
  const conn = getRedisConnection()
  if (!conn) return null
  _queue = new Queue<OutreachJob>('crm-outreach', { connection: conn })
  return _queue
}

