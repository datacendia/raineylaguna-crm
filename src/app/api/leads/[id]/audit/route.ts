import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { auditWebsite } from '@/lib/audit'

export const runtime = 'nodejs'
// PageSpeed Insights can take 10-30s; give the request room.
export const maxDuration = 60

/** POST → run a fresh digital-presence audit for this lead and persist it. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const res = await pool.query('SELECT id, website_url FROM crm_leads WHERE id = $1', [id])
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    const findings = await auditWebsite({
      websiteUrl: res.rows[0].website_url,
      apiKey: serverEnv.GOOGLE_PAGESPEED_API_KEY,
    })
    const updated = await pool.query(
      `UPDATE crm_leads
          SET digital_health_score = $2, audit_findings = $3, audited_at = now()
        WHERE id = $1
      RETURNING *`,
      [id, findings.score, JSON.stringify(findings)],
    )
    return NextResponse.json(updated.rows[0])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[audit] failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
