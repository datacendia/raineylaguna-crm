/**
 * BullMQ worker that processes scheduled outreach jobs.
 *
 * Behaviour is delegated to the shared dispatcher (src/lib/outreach-send.ts)
 * so this worker and the on-demand drafts queue send identically:
 *   - WhatsApp -> Twilio (real send + StatusCallback for delivery/read).
 *   - Email    -> Resend (real send).
 *   - Instagram DM / LinkedIn -> no sanctioned API; left Pending and flagged
 *     `manual_channel:*` for the operator to send by hand and mark sent.
 *
 * We only ever mark an event Sent when a provider actually accepted it, and
 * we never overwrite the message body in `notes` — defer/failure reasons go
 * to the dedicated `failed_reason` column and the provider id to
 * `provider_message_id`.
 *
 * Run: npm run worker
 */
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { Pool } from 'pg'
import { config } from 'dotenv'
import type { OutreachJob } from '../src/lib/queue'
import { sendOutreach } from '../src/lib/outreach-send'

config({ path: '.env.local' })

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function markSent(eventId: string, providerId: string | undefined) {
  await pool.query(
    `UPDATE crm_outreach_events
        SET status = 'Sent', sent_at = NOW(),
            provider_message_id = COALESCE($2, provider_message_id),
            failed_reason = NULL
      WHERE id = $1`,
    [eventId, providerId ?? null]
  )
}

// Stays Pending; the reason is captured in failed_reason WITHOUT clobbering
// the message body that lives in `notes`.
async function markDeferred(eventId: string, reason: string) {
  await pool.query(
    `UPDATE crm_outreach_events SET status = 'Pending', failed_reason = $2 WHERE id = $1`,
    [eventId, reason]
  )
}

const worker = new Worker<OutreachJob>(
  'crm-outreach',
  async (job) => {
    const { lead_id, channel, body, subject } = job.data
    const eventId = job.id as string

    const { rows } = await pool.query<{ phone: string | null; email: string | null }>(
      'SELECT phone, email FROM crm_leads WHERE id = $1',
      [lead_id]
    )
    const lead = rows[0]

    const outcome = await sendOutreach({
      channel,
      body,
      subject,
      phone: lead?.phone,
      email: lead?.email,
      eventId,
    })

    const ts = new Date().toISOString()
    if (outcome.status === 'sent') {
      await markSent(eventId, outcome.providerId)
      console.log(
        `[outreach] ${ts} sent ${channel} to lead ${lead_id} (${outcome.providerId ?? 'no-id'})`
      )
      return { ok: true, providerId: outcome.providerId }
    }

    // 'pending' (retryable: missing config/recipient) or 'manual' (no API).
    await markDeferred(eventId, outcome.reason)
    console.log(
      `[outreach] ${ts} defer ${channel} to lead ${lead_id} (${outcome.status}: ${outcome.reason})`
    )
    return { ok: false, reason: outcome.reason }
  },
  { connection, concurrency: 4 }
)

worker.on('completed', (job, ret) => console.log('completed', job.id, ret))
worker.on('failed', (job, err) => console.error('failed', job?.id, err.message))

console.log('Outreach worker running. Ctrl+C to stop.')
