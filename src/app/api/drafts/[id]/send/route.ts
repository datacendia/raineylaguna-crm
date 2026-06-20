import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { verifySession } from '@/lib/auth'
import { sendOutreach, isManualChannel } from '@/lib/outreach-send'

export const runtime = 'nodejs'

/**
 * POST /api/drafts/[id]/send
 *
 * The bridge that was missing: actually deliver an AI-reviewed draft.
 *
 *   - Automated channels (WhatsApp / Email): route through the shared
 *     dispatcher. On success we create a Sent outreach event, stamp the
 *     provider id, and mark the draft sent. On failure we roll back the event
 *     and leave the draft pending so the operator can fix config and retry.
 *   - Manual channels (Instagram DM / LinkedIn): there is no send API. The
 *     operator is sending by hand, so we record an operator-attested Sent
 *     event (no provider id) and mark the draft sent.
 *
 * The acting operator (from the session cookie) is recorded in acted_by.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const session = await verifySession(req.cookies.get('crm_auth')?.value)
    const actor = session?.email ?? null

    const draftRes = await pool.query(
      `SELECT d.*, l.phone, l.email, l.city
         FROM crm_outreach_drafts d
         JOIN crm_leads l ON l.id = d.lead_id
        WHERE d.id = $1 AND l.deleted_at IS NULL`,
      [id],
    )
    if (draftRes.rows.length === 0) {
      return NextResponse.json({ error: 'draft not found' }, { status: 404 })
    }
    const draft = draftRes.rows[0] as {
      id: string
      lead_id: string
      channel: string
      body: string
      status: string
      phone: string | null
      email: string | null
      city: string | null
    }
    if (draft.status !== 'pending') {
      return NextResponse.json({ error: 'draft already acted on' }, { status: 409 })
    }

    // Create the event first so a Twilio StatusCallback can correlate to it.
    const evRes = await pool.query(
      `INSERT INTO crm_outreach_events (lead_id, channel, status, scheduled_for, notes, draft_id)
       VALUES ($1, $2, 'Pending', NOW(), $3, $4) RETURNING id`,
      [draft.lead_id, draft.channel, draft.body, draft.id],
    )
    const eventId = evRes.rows[0].id as string

    const markDraftSent = () =>
      pool.query(
        `UPDATE crm_outreach_drafts
            SET status = 'sent', acted_at = NOW(), acted_by = $2, sent_event_id = $3
          WHERE id = $1`,
        [draft.id, actor, eventId],
      )

    if (isManualChannel(draft.channel)) {
      await pool.query(
        `UPDATE crm_outreach_events
            SET status = 'Sent', sent_at = NOW(), failed_reason = 'manual_send'
          WHERE id = $1`,
        [eventId],
      )
      await markDraftSent()
      return NextResponse.json({ status: 'manual', event_id: eventId })
    }

    const outcome = await sendOutreach({
      channel: draft.channel,
      body: draft.body,
      phone: draft.phone,
      email: draft.email,
      city: draft.city,
      eventId,
    })

    if (outcome.status === 'sent') {
      await pool.query(
        `UPDATE crm_outreach_events
            SET status = 'Sent', sent_at = NOW(), provider_message_id = $2, failed_reason = NULL
          WHERE id = $1`,
        [eventId, outcome.providerId ?? null],
      )
      await markDraftSent()
      return NextResponse.json({
        status: 'sent',
        event_id: eventId,
        provider_id: outcome.providerId ?? null,
      })
    }

    // Couldn't deliver — roll back the event, keep the draft pending for retry.
    await pool.query('DELETE FROM crm_outreach_events WHERE id = $1', [eventId])
    return NextResponse.json({ status: 'pending', reason: outcome.reason }, { status: 502 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[drafts/send] failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
