/**
 * GET /api/health
 *
 * Liveness + dependency-readiness probe for the CRM. Public,
 * unauthenticated by design — health probes must never need creds.
 *
 * Shape:
 *   {
 *     ok: boolean,
 *     uptime_s: number,
 *     checks: {
 *       db:   { ok, latency_ms?, error? },
 *       env:  { ok, missing? }
 *     },
 *     services: { twilio, resend, anthropic, redis, ... }  // presence-only, never fatal
 *     version: string,   // deployed git SHA (NEXT_PUBLIC_GIT_SHA -> RAILWAY sha -> 'unknown')
 *     timestamp: ISO-8601
 *   }
 *
 * Returns 200 only when every check is `ok`; 503 otherwise. This makes
 * the endpoint usable directly as a Railway / UptimeRobot probe target
 * without any extra parsing.
 */

import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { serverEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STARTED_AT = Date.now()

const REQUIRED_ENV = ['DATABASE_URL', 'CRM_COOKIE_SECRET'] as const

type CheckResult = { ok: true; latency_ms?: number } | { ok: false; error: string }

async function checkDb(): Promise<CheckResult> {
  const t0 = Date.now()
  try {
    // `SELECT 1` against a real connection — round-trips the pool, so
    // this catches "DB up but pool exhausted" too.
    await pool.query('SELECT 1')
    return { ok: true, latency_ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

function checkEnv(): CheckResult & { missing?: string[] } {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length === 0) return { ok: true }
  return { ok: false, error: 'missing required env vars', missing }
}

/**
 * Presence map of optional integrations. These are degraded-mode services
 * (Twilio, Resend, Anthropic, …), so a `false` here is informational, not a
 * failure — it never flips the overall `ok`. Lets an operator confirm at a
 * glance which channels a given deploy can actually use.
 */
function serviceStatus(): Record<string, boolean> {
  return {
    db: true, // reported in detail under checks.db; included here for completeness
    twilio_whatsapp: Boolean(
      serverEnv.TWILIO_ACCOUNT_SID && serverEnv.TWILIO_AUTH_TOKEN && serverEnv.TWILIO_WHATSAPP_FROM,
    ),
    twilio_status_callback: Boolean(serverEnv.TWILIO_STATUS_CALLBACK_TOKEN),
    resend_email: Boolean(serverEnv.RESEND_API_KEY && serverEnv.RESEND_FROM),
    inbound_email: Boolean(serverEnv.CRM_INBOUND_EMAIL_SECRET),
    anthropic: Boolean(serverEnv.ANTHROPIC_API_KEY),
    redis_queue: Boolean(serverEnv.REDIS_URL),
    pagespeed: Boolean(serverEnv.GOOGLE_PAGESPEED_API_KEY || serverEnv.GOOGLE_PLACES_API_KEY),
    lead_intake: Boolean(serverEnv.CRM_LEAD_INTAKE_SECRET),
    sereno_sync: Boolean(serverEnv.VIGIA_CUSTOMERS_URL && serverEnv.VIGIA_SYNC_SECRET),
    digest_email: Boolean(serverEnv.DIGEST_EMAIL_TO),
  }
}

export async function GET() {
  const [db, env] = [await checkDb(), checkEnv()]
  const allOk = db.ok && env.ok

  const body = {
    ok: allOk,
    uptime_s: Math.round((Date.now() - STARTED_AT) / 1000),
    checks: { db, env },
    services: serviceStatus(),
    version: serverEnv.NEXT_PUBLIC_GIT_SHA ?? serverEnv.RAILWAY_GIT_COMMIT_SHA ?? 'unknown',
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(body, {
    status: allOk ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex',
    },
  })
}
