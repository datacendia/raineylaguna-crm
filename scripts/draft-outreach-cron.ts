/**
 * Mon/Wed/Fri 6am batch draft generator. ROADMAP item 10.
 *
 * For every "cold" lead — no outreach events ever, no snooze, no pending
 * draft already, created ≥ 7 days ago, still in the "Lead" stage — generate a
 * personalized WhatsApp opener using the same prompt/lib the on-demand
 * endpoint uses (`src/lib/draft-outreach.ts`, ROADMAP item 12).
 *
 * Operator setup:
 *   Railway cron:  npm run draft-outreach-cron
 *   Schedule:      0 6 * * 1,3,5  (America/Lima → cron runs in UTC;
 *                                  set Railway TZ or use 11 UTC).
 *   Env required:  DATABASE_URL, ANTHROPIC_API_KEY
 *   Env optional:  DRAFT_CRON_MAX_LEADS  (safety cap per run, default 25)
 *                  DRAFT_CRON_MIN_AGE_DAYS (default 7)
 *                  DRAFT_CRON_DRY_RUN=true (skip Anthropic/insert, just print)
 *
 * Idempotent: the SELECT excludes leads that already have a pending draft,
 * so re-running within the same day won't duplicate work. If the operator
 * discards a draft, the lead becomes eligible again on the next run.
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { generateDraftForLead } from '../src/lib/draft-outreach'

config({ path: '.env.local' })

const MAX_LEADS = Number(process.env.DRAFT_CRON_MAX_LEADS ?? '25')
const MIN_AGE_DAYS = Number(process.env.DRAFT_CRON_MIN_AGE_DAYS ?? '7')
const DRY_RUN = process.env.DRAFT_CRON_DRY_RUN === 'true'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  if (!DRY_RUN && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required (or set DRAFT_CRON_DRY_RUN=true)')
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  // Eligible = cold leads with no outreach history, no active snooze,
  // no pending draft, created at least MIN_AGE_DAYS ago, still in "Lead" stage.
  // Ordered oldest-first so the queue drains FIFO.
  const { rows: leads } = await pool.query(
    `SELECT l.*
       FROM crm_leads l
      WHERE l.pipeline_stage = 'Lead'
        AND l.deleted_at IS NULL
        AND l.created_at <= NOW() - ($1 || ' days')::interval
        AND (l.snoozed_until IS NULL OR l.snoozed_until <= NOW())
        AND NOT EXISTS (
          SELECT 1 FROM crm_outreach_events e WHERE e.lead_id = l.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM crm_outreach_drafts d
           WHERE d.lead_id = l.id AND d.status = 'pending'
        )
      ORDER BY l.created_at ASC
      LIMIT $2`,
    [String(MIN_AGE_DAYS), MAX_LEADS]
  )

  console.log(
    `[draft-outreach-cron] ${new Date().toISOString()} | ` +
    `${leads.length} eligible lead(s) | dry_run=${DRY_RUN} | ` +
    `max=${MAX_LEADS} min_age=${MIN_AGE_DAYS}d`
  )

  let ok = 0
  let failed = 0
  for (const lead of leads) {
    const tag = `${lead.name} (${String(lead.id).slice(0, 8)})`
    if (DRY_RUN) {
      console.log(`  · would draft: ${tag}`)
      continue
    }
    try {
      const draft = await generateDraftForLead(pool, lead)
      console.log(`  ✓ drafted ${tag} → draft ${String(draft.id).slice(0, 8)}`)
      ok++
      // Gentle pacing: Anthropic tier-1 = 50 RPM. 1.5s between calls keeps
      // us well under that and leaves headroom for the on-demand UI.
      await new Promise((r) => setTimeout(r, 1500))
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ failed ${tag}: ${msg}`)
    }
  }

  console.log(`[draft-outreach-cron] done: ${ok} ok, ${failed} failed`)
  await pool.end()
}

main().catch((err) => {
  console.error('[draft-outreach-cron] fatal:', err)
  process.exit(1)
})
