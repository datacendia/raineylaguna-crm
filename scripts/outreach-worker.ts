/**
 * BullMQ worker that processes scheduled outreach jobs.
 * For now it doesn't actually SEND (no email/IG/WA gateway wired yet) —
 * instead it marks the corresponding crm_outreach_event as `Sent` at the
 * scheduled time, so the inbox/feed reflects what should have gone out.
 *
 * Run: npm run worker
 *
 * Wire a real sender later by replacing the `// TODO: send` block with a call
 * to your provider (Resend, Twilio, Meta Graph API, etc.).
 */
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { Pool } from 'pg'
import { config } from 'dotenv'
import type { OutreachJob } from '../src/lib/queue'

config({ path: '.env.local' })

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const worker = new Worker<OutreachJob>(
  'crm-outreach',
  async (job) => {
    const { lead_id, channel, body } = job.data

    // TODO: send via real provider here.
    // For now we just mark the event as Sent so the dashboard updates.
    await pool.query(
      `UPDATE crm_outreach_events
       SET status = 'Sent', sent_at = NOW()
       WHERE id = $1`,
      [job.id]
    )

    console.log(`[outreach] ${new Date().toISOString()} sent ${channel} to lead ${lead_id} (${body.length} chars)`)
    return { ok: true }
  },
  { connection, concurrency: 4 }
)

worker.on('completed', (job) => console.log('completed', job.id))
worker.on('failed', (job, err) => console.error('failed', job?.id, err.message))

console.log('Outreach worker running. Ctrl+C to stop.')
