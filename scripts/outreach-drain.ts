/**
 * Cron-drain outreach sender — the near-free alternative to an always-on
 * BullMQ worker.
 *
 * A Railway cron runs this every few minutes; it sends every Pending outreach
 * event whose scheduled_for has arrived, then exits. Because it exits, it
 * scales to zero and costs ~nothing (unlike a 24/7 worker process).
 *
 * Design:
 *   - Reuses the shared dispatcher (src/lib/outreach-send.ts), so the cron-drain
 *     and the on-demand drafts "Send" button deliver identically.
 *   - Manual channels (Instagram DM / LinkedIn) have no send API: sendOutreach
 *     returns `manual`, so we stamp failed_reason and leave the event Pending
 *     for the operator to send by hand. We never auto-"send" them.
 *   - One attempt per event: any non-sent outcome (deferred / manual /
 *     exception) writes failed_reason, which removes the row from re-selection.
 *     No retry storms, no infinite loops. The operator can re-trigger if needed.
 *   - Staleness guard: events whose scheduled_for is older than
 *     OUTREACH_DRAIN_GRACE_HOURS (default 12) are NOT auto-sent, so turning the
 *     cron on never blasts a backlog that accumulated while nothing was
 *     draining. They stay Pending and are reported as `stale_skipped`.
 *   - FOR UPDATE SKIP LOCKED + a per-run cap (OUTREACH_DRAIN_MAX, default 200)
 *     make overlapping runs safe and bound each run's work.
 *
 * Operator setup (Railway cron):
 *   Start command: npm run outreach-drain
 *   Schedule:      every few minutes (e.g. every 15 minutes)
 *   Env required:  DATABASE_URL, RESEND_API_KEY, RESEND_FROM
 *   Env optional:  TWILIO_* (WhatsApp), CRM_PUBLIC_BASE_URL +
 *                  TWILIO_STATUS_CALLBACK_TOKEN (delivery callbacks),
 *                  OUTREACH_DRAIN_DRY_RUN=true, OUTREACH_DRAIN_GRACE_HOURS,
 *                  OUTREACH_DRAIN_MAX
 */
import { Pool, type PoolClient } from 'pg'
import { config } from 'dotenv'
import { sendOutreach } from '../src/lib/outreach-send'

config({ path: '.env.local' })

const DRY_RUN = process.env.OUTREACH_DRAIN_DRY_RUN === 'true'

const GRACE_HOURS = (() => {
  const n = Number(process.env.OUTREACH_DRAIN_GRACE_HOURS ?? '12')
  return Number.isFinite(n) && n > 0 ? n : 12
})()

const MAX = (() => {
  const n = Number(process.env.OUTREACH_DRAIN_MAX ?? '200')
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200
})()

type DueEvent = {
  id: string
  lead_id: string
  channel: string
  body: string | null
  subject: string | null
  phone: string | null
  email: string | null
}

/** Oldest due, not-yet-attempted Pending event, locked for this run only. */
const SELECT_NEXT_DUE = `
  SELECT e.id, e.lead_id, e.channel::text AS channel, e.notes AS body, e.subject,
         l.phone, l.email
    FROM crm_outreach_events e
    JOIN crm_leads l ON l.id = e.lead_id AND l.deleted_at IS NULL
   WHERE e.status = 'Pending'
     AND e.failed_reason IS NULL
     AND e.scheduled_for IS NOT NULL
     AND e.scheduled_for <= NOW()
     AND e.scheduled_for >= NOW() - ($1 || ' hours')::interval
   ORDER BY e.scheduled_for ASC
   LIMIT 1
   FOR UPDATE OF e SKIP LOCKED`

async function markSent(client: PoolClient, id: string, providerId?: string) {
  await client.query(
    `UPDATE crm_outreach_events
        SET status = 'Sent', sent_at = NOW(),
            provider_message_id = COALESCE($2, provider_message_id),
            failed_reason = NULL
      WHERE id = $1`,
    [id, providerId ?? null],
  )
}

async function markDeferred(client: PoolClient, id: string, reason: string) {
  // Event stays Pending; failed_reason both records why and excludes the row
  // from re-selection so we never re-attempt the same failure every run.
  await client.query(`UPDATE crm_outreach_events SET failed_reason = $2 WHERE id = $1`, [
    id,
    reason.slice(0, 500),
  ])
}

async function staleBacklog(pool: Pool): Promise<number> {
  const res = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM crm_outreach_events
      WHERE status = 'Pending' AND failed_reason IS NULL
        AND scheduled_for IS NOT NULL
        AND scheduled_for < NOW() - ($1 || ' hours')::interval`,
    [String(GRACE_HOURS)],
  )
  return res.rows[0]?.n ?? 0
}

async function dryRun(pool: Pool, stale: number) {
  const due = await pool.query<{ id: string; lead_id: string; channel: string; scheduled_for: string }>(
    `SELECT e.id, e.lead_id, e.channel::text AS channel, e.scheduled_for::text AS scheduled_for
       FROM crm_outreach_events e
       JOIN crm_leads l ON l.id = e.lead_id AND l.deleted_at IS NULL
      WHERE e.status = 'Pending' AND e.failed_reason IS NULL
        AND e.scheduled_for IS NOT NULL
        AND e.scheduled_for <= NOW()
        AND e.scheduled_for >= NOW() - ($1 || ' hours')::interval
      ORDER BY e.scheduled_for ASC
      LIMIT $2`,
    [String(GRACE_HOURS), MAX],
  )
  console.log(
    `[outreach-drain] ${new Date().toISOString()} | DRY_RUN | due=${due.rows.length} stale_skipped=${stale} grace_h=${GRACE_HOURS} cap=${MAX}`,
  )
  for (const ev of due.rows) {
    console.log(`  would send ${ev.channel} -> lead ${ev.lead_id} (event ${ev.id}, scheduled ${ev.scheduled_for})`)
  }
  console.log('[outreach-drain] DRY_RUN: nothing sent.')
}

async function drainLive(pool: Pool): Promise<{ sent: number; deferred: number }> {
  let sent = 0
  let deferred = 0
  let processed = 0

  while (processed < MAX) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<DueEvent>(SELECT_NEXT_DUE, [String(GRACE_HOURS)])
      if (rows.length === 0) {
        await client.query('ROLLBACK')
        break
      }
      const ev = rows[0]
      processed++
      try {
        const outcome = await sendOutreach({
          channel: ev.channel,
          body: ev.body ?? '',
          subject: ev.subject,
          phone: ev.phone,
          email: ev.email,
          eventId: ev.id,
        })
        if (outcome.status === 'sent') {
          await markSent(client, ev.id, outcome.providerId)
          sent++
          console.log(`  ✓ sent ${ev.channel} -> lead ${ev.lead_id} (${outcome.providerId ?? 'no-id'})`)
        } else {
          await markDeferred(client, ev.id, outcome.reason)
          deferred++
          console.log(`  · defer ${ev.channel} -> lead ${ev.lead_id} (${outcome.status}: ${outcome.reason})`)
        }
        await client.query('COMMIT')
      } catch (sendErr) {
        // Unexpected throw from the dispatcher: stamp it so we don't loop on the
        // same row forever, then keep draining the rest.
        const msg = sendErr instanceof Error ? sendErr.message : 'unknown'
        await markDeferred(client, ev.id, `exception:${msg}`)
        deferred++
        await client.query('COMMIT')
        console.error(`  ! error ${ev.channel} -> lead ${ev.lead_id}: ${msg}`)
      }
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {})
      throw txErr
    } finally {
      client.release()
    }
  }

  return { sent, deferred }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const stale = await staleBacklog(pool)

    if (DRY_RUN) {
      await dryRun(pool, stale)
      return
    }

    console.log(
      `[outreach-drain] ${new Date().toISOString()} | grace_h=${GRACE_HOURS} cap=${MAX} stale_skipped=${stale}`,
    )
    const { sent, deferred } = await drainLive(pool)
    console.log(`[outreach-drain] done | sent=${sent} deferred=${deferred}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[outreach-drain] fatal:', err)
  process.exit(1)
})
