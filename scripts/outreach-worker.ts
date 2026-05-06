/**
 * BullMQ worker that processes scheduled outreach jobs.
 *
 * Behaviour by channel:
 *   - WhatsApp: if Twilio env is configured (TWILIO_ACCOUNT_SID +
 *     TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM, plus TWILIO_TEMPLATE_SID
 *     for production outbound), the message is sent via Twilio and the
 *     event is marked Sent. If Twilio is not configured or the send
 *     fails, the event stays Pending and the failure is logged into
 *     crm_outreach_events.notes for the operator to review.
 *   - Email / Instagram DM / LinkedIn: not yet wired. Events stay Pending
 *     with a note explaining which provider is missing.
 *
 * The previous version of this worker unconditionally marked every event
 * as Sent regardless of whether anything was actually sent. That has been
 * removed — we no longer lie to the dashboard.
 *
 * Run: npm run worker
 */
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { Pool } from 'pg'
import { config } from 'dotenv'
import type { OutreachJob } from '../src/lib/queue'
import { getTwilioConfig, sendWhatsapp } from '../src/lib/twilio'

config({ path: '.env.local' })

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function markSent(eventId: string, providerSid: string | undefined) {
  const note = providerSid ? `twilio_sid=${providerSid}` : null
  await pool.query(
    `UPDATE crm_outreach_events
     SET status = 'Sent', sent_at = NOW(), notes = COALESCE($2, notes)
     WHERE id = $1`,
    [eventId, note]
  )
}

async function markPending(eventId: string, reason: string) {
  await pool.query(
    `UPDATE crm_outreach_events
     SET status = 'Pending', notes = $2
     WHERE id = $1`,
    [eventId, reason]
  )
}

const worker = new Worker<OutreachJob>(
  'crm-outreach',
  async (job) => {
    const { lead_id, channel, body } = job.data
    const eventId = job.id as string

    if (channel !== 'WhatsApp') {
      const reason = `provider_not_wired:${channel.toLowerCase().replace(/\s+/g, '_')}`
      await markPending(eventId, reason)
      console.log(
        `[outreach] ${new Date().toISOString()} skip ${channel} to lead ${lead_id} (${reason})`
      )
      return { ok: false, reason }
    }

    const cfg = getTwilioConfig()
    if (!cfg) {
      await markPending(eventId, 'twilio_not_configured')
      console.log(
        `[outreach] ${new Date().toISOString()} skip WhatsApp to lead ${lead_id} (twilio_not_configured)`
      )
      return { ok: false, reason: 'twilio_not_configured' }
    }

    const { rows } = await pool.query<{ phone: string | null }>(
      'SELECT phone FROM crm_leads WHERE id = $1',
      [lead_id]
    )
    const phone = rows[0]?.phone
    if (!phone) {
      await markPending(eventId, 'lead_phone_missing')
      console.warn(
        `[outreach] ${new Date().toISOString()} skip WhatsApp to lead ${lead_id} (no phone on lead)`
      )
      return { ok: false, reason: 'lead_phone_missing' }
    }

    const result = await sendWhatsapp(cfg, phone, body)
    if (!result.ok) {
      await markPending(eventId, `twilio_error:${result.error ?? 'unknown'}`)
      console.error(
        `[outreach] ${new Date().toISOString()} fail WhatsApp to lead ${lead_id}: ${result.error}`
      )
      return { ok: false, reason: result.error }
    }

    await markSent(eventId, result.sid)
    console.log(
      `[outreach] ${new Date().toISOString()} sent WhatsApp to lead ${lead_id} (${result.sid}, ${body.length} chars)`
    )
    return { ok: true, sid: result.sid }
  },
  { connection, concurrency: 4 }
)

worker.on('completed', (job, ret) => console.log('completed', job.id, ret))
worker.on('failed', (job, err) => console.error('failed', job?.id, err.message))

console.log('Outreach worker running. Ctrl+C to stop.')
