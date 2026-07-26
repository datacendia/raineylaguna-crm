import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import pool from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { isOptOut, suppress } from '@/lib/suppression'

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

/**
 * The visible part of an email reply — everything above the quoted original.
 *
 * This matters for opt-out detection. `isOptOut` matches whole messages only
 * (so "no me gusta el stop motion" isn't read as an opt-out), but a real email
 * reply is almost never just the word: it's "BAJA" followed by the entire
 * thread quoted underneath. Without trimming that, a genuine opt-out would
 * never match and the person would keep being emailed.
 *
 * Cuts at the first quote marker: a `>` line, or an attribution line in
 * English or Spanish ("On … wrote:", "El … escribió:"), or Outlook's divider.
 */
function topOfReply(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    const l = line.trim()
    if (l.startsWith('>')) break
    if (/^-{2,}\s*(original message|mensaje original)/i.test(l)) break
    if (/^_{5,}$/.test(l)) break
    if (/^(on|el)\b.*\b(wrote|escribió|escribio):$/i.test(l)) break
    if (/^de:\s|^from:\s/i.test(l) && out.length > 0) break
    out.push(line)
  }
  return out.join('\n').trim()
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
    const leadId = leadRes.rows[0]?.id ?? null

    // ── Opt-out ──────────────────────────────────────────────────────────────
    // Checked BEFORE the no-match drop below, and deliberately so: someone who
    // says "unsubscribe" from an address we don't currently hold as a lead must
    // still be suppressed, or the next import re-adds them and we message
    // someone who already told us not to.
    const replyTop = topOfReply(body.text ?? '')
    if (isOptOut(replyTop) || isOptOut(body.subject ?? '')) {
      await suppress(pool, {
        email: from,
        reason: 'opt_out',
        source: 'email',
        leadId,
        note: replyTop.slice(0, 500) || (body.subject ?? '').slice(0, 500),
      })
      if (leadId) {
        await pool.query(
          `UPDATE crm_outreach_events
              SET status = 'Not Interested', failed_reason = 'opt_out:email'
            WHERE lead_id = $1 AND status = 'Pending'`,
          [leadId],
        )
      }
      console.log(`[webhooks/inbound-email] opt-out recorded for ${from}`)
      return NextResponse.json({ ok: true, matched: Boolean(leadId), opted_out: true })
    }

    if (!leadId) {
      return NextResponse.json({ ok: true, matched: false })
    }

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
