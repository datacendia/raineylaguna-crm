import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import pool from '@/lib/db'
import { serverEnv } from '@/lib/env'

export const runtime = 'nodejs'

/**
 * POST /api/webhooks/inbound-email  (ROADMAP #11)
 *
 * Inbound-email-to-CRM. A Cloudflare Email Worker (free) forwards replies here
 * as JSON; we attach the reply to the matching lead (by sender email) and flip
 * that lead's most-recent outreach event to "Replied". We deliberately do NOT
 * create a lead on no-match: crm_leads.district/niche are NOT NULL and we won't
 * invent them — unmatched mail is acknowledged and dropped.
 *
 * Auth: shared secret in the `X-Inbound-Secret` header (or `?token=`), compared
 * in constant time. Outside the proxy matcher, so no session required.
 *
 * Body: { from: string, to?: string, subject?: string, text?: string }
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function POST(req: NextRequest) {
  const expected = serverEnv.CRM_INBOUND_EMAIL_SECRET
  const provided =
    req.headers.get('x-inbound-secret') ?? new URL(req.url).searchParams.get('token') ?? ''
  if (!expected || !constantTimeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    from?: string
    subject?: string
    text?: string
  }
  const from = (body.from ?? '').trim().toLowerCase()
  if (!from) {
    return NextResponse.json({ ok: false, error: 'missing from' }, { status: 400 })
  }

  try {
    const leadRes = await pool.query<{ id: string }>(
      `SELECT id FROM crm_leads
        WHERE lower(email) = $1 AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
      [from],
    )
    if (leadRes.rows.length === 0) {
      return NextResponse.json({ ok: true, matched: false })
    }
    const leadId = leadRes.rows[0].id

    const snippet = [
      `↩ Reply ${new Date().toISOString()}`,
      body.subject ? `Subject: ${body.subject}` : null,
      (body.text ?? '').trim().slice(0, 2000),
    ]
      .filter(Boolean)
      .join('\n')

    await pool.query(
      `UPDATE crm_leads
          SET notes = CASE WHEN notes IS NULL OR notes = '' THEN $2 ELSE notes || E'\\n\\n' || $2 END
        WHERE id = $1`,
      [leadId, snippet],
    )

    // Mark the most recent outreach event as Replied (if any exists).
    await pool.query(
      `UPDATE crm_outreach_events
          SET status = 'Replied', replied_at = NOW()
        WHERE id = (
          SELECT id FROM crm_outreach_events
           WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1
        )`,
      [leadId],
    )

    return NextResponse.json({ ok: true, matched: true, lead_id: leadId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[webhooks/inbound-email] failed', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
