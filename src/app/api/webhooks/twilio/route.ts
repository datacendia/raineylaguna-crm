import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import pool from '@/lib/db'
import { serverEnv } from '@/lib/env'

export const runtime = 'nodejs'

/**
 * POST /api/webhooks/twilio?token=...&event_id=...
 *
 * Twilio StatusCallback receiver (ROADMAP: delivery/read tracking). Twilio
 * POSTs form-encoded delivery events for each message we send (see
 * src/lib/twilio.ts → StatusCallback, built in outreach-send.ts).
 *
 * Auth: a shared `token` query param (TWILIO_STATUS_CALLBACK_TOKEN), compared
 * in constant time. This path is intentionally outside the proxy matcher so it
 * needs no session.
 *
 * Mapping onto our coarse status enum (we don't extend the enum; precise
 * timestamps live in dedicated columns):
 *   queued/sending/sent  -> status 'Sent',   sets sent_at + provider_message_id
 *   delivered            -> delivered_at,    keeps 'Sent'
 *   read                 -> read_at,         status 'Opened'
 *   undelivered/failed   -> failed_reason 'twilio:<code>'
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function POST(req: NextRequest) {
  const expected = serverEnv.TWILIO_STATUS_CALLBACK_TOKEN
  const url = new URL(req.url)
  const provided = url.searchParams.get('token') ?? ''
  if (!expected || !constantTimeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const eventId = url.searchParams.get('event_id')

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'expected form-encoded body' }, { status: 400 })
  }
  const messageStatus = String(form.get('MessageStatus') ?? form.get('SmsStatus') ?? '').toLowerCase()
  const messageSid = form.get('MessageSid') ? String(form.get('MessageSid')) : null
  const errorCode = form.get('ErrorCode') ? String(form.get('ErrorCode')) : null

  // Locate the event: prefer the correlation id we attached, fall back to SID.
  const where = eventId ? 'id = $1' : 'provider_message_id = $1'
  const key = eventId ?? messageSid
  if (!key) {
    return NextResponse.json({ ok: false, error: 'no correlation id' }, { status: 400 })
  }

  const sets: string[] = []
  const vals: unknown[] = [key]
  const push = (frag: string, val?: unknown) => {
    if (val === undefined) {
      sets.push(frag)
    } else {
      vals.push(val)
      sets.push(frag.replace('?', `$${vals.length}`))
    }
  }

  switch (messageStatus) {
    case 'queued':
    case 'sending':
    case 'sent':
      push(`status = 'Sent'`)
      push(`sent_at = COALESCE(sent_at, NOW())`)
      if (messageSid) push(`provider_message_id = ?`, messageSid)
      break
    case 'delivered':
      push(`delivered_at = NOW()`)
      push(`status = CASE WHEN status = 'Pending' THEN 'Sent' ELSE status END`)
      break
    case 'read':
      push(`read_at = NOW()`)
      push(`status = 'Opened'`)
      break
    case 'undelivered':
    case 'failed':
      push(`failed_reason = ?`, `twilio:${errorCode ?? messageStatus}`)
      break
    default:
      // Unknown/ignored status — ack so Twilio doesn't retry.
      return NextResponse.json({ ok: true, ignored: messageStatus })
  }

  try {
    await pool.query(`UPDATE crm_outreach_events SET ${sets.join(', ')} WHERE ${where}`, vals)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[webhooks/twilio] update failed', message)
    // Still 200 so Twilio doesn't hammer retries on a transient DB blip.
    return NextResponse.json({ ok: false, error: message })
  }
}
