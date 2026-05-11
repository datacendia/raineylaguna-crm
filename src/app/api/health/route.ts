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
 *     version: string,
 *     timestamp: ISO-8601
 *   }
 *
 * Returns 200 only when every check is `ok`; 503 otherwise. This makes
 * the endpoint usable directly as a Railway / UptimeRobot probe target
 * without any extra parsing.
 */

import { NextResponse } from 'next/server'
import pool from '@/lib/db'

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

export async function GET() {
  const [db, env] = [await checkDb(), checkEnv()]
  const allOk = db.ok && env.ok

  const body = {
    ok: allOk,
    uptime_s: Math.round((Date.now() - STARTED_AT) / 1000),
    checks: { db, env },
    version: process.env.NEXT_PUBLIC_GIT_SHA ?? 'unknown',
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
