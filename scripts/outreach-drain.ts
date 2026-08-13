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
 *   - AT-MOST-ONCE delivery, deliberately. Each event is claimed as Sent in a
 *     short transaction BEFORE the provider is called, and the provider call
 *     then happens outside any transaction. Previously the send sat between
 *     BEGIN and COMMIT, so a redeploy (SIGTERM) landing mid-send rolled the row
 *     back to Pending after the message had already gone out — and the next
 *     drain sent it again.
 *
 *     The trade is explicit: a crash between claim and send loses that one
 *     message rather than duplicating it. For cold outreach that is the correct
 *     direction — a duplicate is the behavioural signature of a spam bot, and
 *     complaints feed the SES/Twilio thresholds that can suspend sending
 *     entirely. Losing one low-probability prospect is cheaper than putting the
 *     sending domain at risk. (For transactional mail you would want the
 *     opposite: an in-flight 'Sending' state and at-least-once.)
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
import type { AuditStatus } from '../src/lib/types'

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
  city: string | null
  /** Blocks the send when 'unreachable' — see unverifiedUnreachable. */
  audit_status: string | null
}

/** Oldest due, not-yet-attempted Pending event, locked for this run only. */
const SELECT_NEXT_DUE = `
  SELECT e.id, e.lead_id, e.channel::text AS channel, e.notes AS body, e.subject,
         l.phone, l.email, l.city, l.audit_status
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

/**
 * Optimistically claim the event as Sent BEFORE the provider is called.
 *
 * This is the at-most-once half of the design (see the header note). Once this
 * commits, the row is no longer selectable by any drain, so a crash during the
 * provider call can never produce a second send.
 */
async function claimAsSent(client: PoolClient, id: string) {
  await client.query(
    `UPDATE crm_outreach_events
        SET status = 'Sent', sent_at = NOW(), failed_reason = NULL
      WHERE id = $1`,
    [id],
  )
}

/** Attach the provider's message id once the send actually succeeded. */
async function recordProviderId(db: Pool, id: string, providerId?: string) {
  if (!providerId) return
  await db.query(
    `UPDATE crm_outreach_events
        SET provider_message_id = COALESCE($2, provider_message_id)
      WHERE id = $1`,
    [id, providerId],
  )
}

/**
 * The send did not happen after all — release the optimistic claim so the row
 * reflects reality. status returns to Pending, and failed_reason both records
 * why and excludes it from re-selection, matching the pre-existing contract.
 */
async function releaseClaim(db: Pool, id: string, reason: string) {
  await db.query(
    `UPDATE crm_outreach_events
        SET status = 'Pending', sent_at = NULL, failed_reason = $2
      WHERE id = $1`,
    [id, reason.slice(0, 500)],
  )
}

/**
 * Recipient is on the do-not-contact list. Terminal: move the event out of
 * Pending entirely rather than leaving it deferred, so it stops appearing in
 * backlog counts and can never be revived by clearing failed_reason.
 */
async function markSuppressed(db: Pool, id: string, reason: string) {
  await db.query(
    `UPDATE crm_outreach_events
        SET status = 'Not Interested', sent_at = NULL, failed_reason = $2
      WHERE id = $1`,
    [id, reason.slice(0, 500)],
  )
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

async function drainLive(pool: Pool): Promise<{ sent: number; deferred: number; suppressed: number }> {
  let sent = 0
  let deferred = 0
  let suppressed = 0
  let processed = 0

  while (processed < MAX) {
    // ── Phase 1: claim ──────────────────────────────────────────────────────
    // Short transaction. Lock the next due row and mark it Sent BEFORE anything
    // leaves the process. Nothing slow happens inside here — no network, no
    // provider call — so the transaction is held for microseconds.
    const client = await pool.connect()
    let ev: DueEvent | null = null
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<DueEvent>(SELECT_NEXT_DUE, [String(GRACE_HOURS)])
      if (rows.length === 0) {
        await client.query('ROLLBACK')
        break
      }
      ev = rows[0]
      await claimAsSent(client, ev.id)
      await client.query('COMMIT')
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {})
      throw txErr
    } finally {
      client.release()
    }
    if (!ev) break
    processed++

    // ── Phase 2: send ───────────────────────────────────────────────────────
    // Deliberately OUTSIDE any transaction. A provider call is irreversible;
    // Postgres can roll back its half but Twilio cannot roll back a delivered
    // WhatsApp message. Holding a transaction across this is what allowed a
    // redeploy mid-send to resurrect the row and message the prospect twice.
    let outcome
    try {
      outcome = await sendOutreach({
        channel: ev.channel,
        body: ev.body ?? '',
        subject: ev.subject,
        phone: ev.phone,
        email: ev.email,
        city: ev.city,
        eventId: ev.id,
        auditStatus: ev.audit_status as AuditStatus | null,
      })
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : 'unknown'
      await releaseClaim(pool, ev.id, `exception:${msg}`)
      deferred++
      console.error(`  ! error ${ev.channel} -> lead ${ev.lead_id}: ${msg}`)
      continue
    }

    // ── Phase 3: reconcile ──────────────────────────────────────────────────
    // The claim was optimistic, so anything other than a real send has to be
    // walked back. A crash before reaching here leaves the row claimed and the
    // message unsent — the accepted at-most-once cost.
    if (outcome.status === 'sent') {
      await recordProviderId(pool, ev.id, outcome.providerId)
      sent++
      console.log(`  ✓ sent ${ev.channel} -> lead ${ev.lead_id} (${outcome.providerId ?? 'no-id'})`)
    } else if (outcome.status === 'suppressed') {
      await markSuppressed(pool, ev.id, outcome.reason)
      suppressed++
      console.log(`  ⊘ suppressed ${ev.channel} -> lead ${ev.lead_id} (${outcome.reason})`)
    } else {
      await releaseClaim(pool, ev.id, outcome.reason)
      deferred++
      console.log(`  · defer ${ev.channel} -> lead ${ev.lead_id} (${outcome.status}: ${outcome.reason})`)
    }
  }

  return { sent, deferred, suppressed }
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
    const { sent, deferred, suppressed } = await drainLive(pool)
    console.log(
      `[outreach-drain] done | sent=${sent} deferred=${deferred} suppressed=${suppressed}`,
    )
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[outreach-drain] fatal:', err)
  process.exit(1)
})
