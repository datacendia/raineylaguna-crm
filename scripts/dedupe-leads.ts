/**
 * Report and optionally merge duplicate leads.
 *
 * The base holds 2,221 duplicate rows across 1,474 groups — "Tienda Mass" x83,
 * "Casa" x67, Starbucks LA x36 — and 1,936 rows sharing a phone with another
 * row. Batch Outreach says "Will schedule for 36809 filtered leads" with no
 * dedupe in front of it, so every one of those is a prospect who gets
 * contacted twice.
 *
 * DRY RUN BY DEFAULT. Merging is destructive and irreversible, so this prints
 * what it would do and changes nothing unless DEDUPE_APPLY=true is set. The
 * survivor chosen in a dry run is the survivor a live run will choose — the
 * ranking is fully deterministic (see pickSurvivor).
 *
 * What a merge does, per group:
 *   1. Backfills empty fields on the survivor from the rows being merged, so
 *      an email that only exists on a duplicate is not thrown away.
 *   2. Repoints outreach events, drafts and video audits at the survivor.
 *   3. Soft-deletes the duplicates (deleted_at), never a hard DELETE — the
 *      rows stay recoverable and the merge stays auditable.
 *
 * Only IDENTITY duplicates are ever merged: same brand, same city, same
 * district. Contact collisions are reported but never merged automatically —
 * a shared phone is as likely to be a chain's head office, and the franchise
 * rules already treat 3+ shared numbers as a chain.
 *
 * Usage:
 *   npm run dedupe                          report only
 *   DEDUPE_APPLY=true npm run dedupe        perform the merge
 *   DEDUPE_LIMIT=50 npm run dedupe          cap groups processed (for a trial)
 */
import { Pool } from 'pg'
import { config } from 'dotenv'
import { dedupeReport, type DedupeCandidate } from '../src/lib/lead-dedupe'

config({ path: '.env.local' })

const APPLY = process.env.DEDUPE_APPLY === 'true'
const LIMIT = Number(process.env.DEDUPE_LIMIT ?? '0') || Infinity

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    const { rows } = await pool.query<DedupeCandidate>(
      `SELECT id, name, city, district, phone, email, website_url,
              digital_health_score, audited_at, pipeline_stage, created_at
         FROM crm_leads
        WHERE deleted_at IS NULL`,
    )

    const report = dedupeReport(rows)

    console.log(`\n[dedupe] ${APPLY ? 'APPLY' : 'DRY RUN'} — ${rows.length} live leads`)
    console.log(`  identity duplicate groups : ${report.identityGroups.length}`)
    console.log(`  rows that would merge away: ${report.mergeableRows}`)
    console.log(`  distinct businesses after : ${report.distinctAfterMerge}`)
    console.log(`  contact collisions (review only): ${report.contactCollisions.length}`)

    console.log('\n  largest identity groups:')
    for (const g of report.identityGroups.slice(0, 15)) {
      console.log(`    ${String(g.size).padStart(4)}x  ${g.key}`)
    }

    if (!APPLY) {
      console.log('\n[dedupe] DRY RUN: nothing changed. Set DEDUPE_APPLY=true to merge.')
      return
    }

    let merged = 0
    let groupsDone = 0

    for (const group of report.identityGroups) {
      if (groupsDone >= LIMIT) break
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // 1. Backfill anything the survivor is missing. COALESCE picks the
        //    survivor's own value first, so this only ever fills blanks.
        await client.query(
          `UPDATE crm_leads s SET
             email        = COALESCE(s.email, d.email),
             phone        = COALESCE(s.phone, d.phone),
             website_url  = COALESCE(s.website_url, d.website_url),
             address      = COALESCE(s.address, d.address),
             instagram_url = COALESCE(s.instagram_url, d.instagram_url),
             facebook_url  = COALESCE(s.facebook_url, d.facebook_url),
             digital_health_score = COALESCE(s.digital_health_score, d.digital_health_score),
             audit_findings = COALESCE(s.audit_findings, d.audit_findings),
             audited_at     = COALESCE(s.audited_at, d.audited_at),
             notes = CONCAT_WS(E'\n', s.notes, d.notes)
           FROM (
             SELECT * FROM crm_leads WHERE id = ANY($2::uuid[]) ORDER BY created_at LIMIT 1
           ) d
           WHERE s.id = $1`,
          [group.survivorId, group.duplicateIds],
        )

        // 2. Repoint children. Without this the merge orphans the history that
        //    made the survivor worth keeping.
        for (const table of ['crm_outreach_events', 'crm_outreach_drafts', 'crm_video_audits']) {
          await client.query(
            `UPDATE ${table} SET lead_id = $1 WHERE lead_id = ANY($2::uuid[])`,
            [group.survivorId, group.duplicateIds],
          )
        }

        // 3. Soft-delete, never DELETE — recoverable and auditable.
        const res = await client.query(
          `UPDATE crm_leads
              SET deleted_at = NOW(),
                  notes = CONCAT_WS(E'\n', notes, 'merged into ' || $1::text)
            WHERE id = ANY($2::uuid[]) AND deleted_at IS NULL`,
          [group.survivorId, group.duplicateIds],
        )

        await client.query('COMMIT')
        merged += res.rowCount ?? 0
        groupsDone++
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        console.error(`  ! group ${group.key} failed:`, (err as Error).message)
      } finally {
        client.release()
      }
    }

    console.log(`\n[dedupe] merged ${merged} rows across ${groupsDone} groups.`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[dedupe] failed:', err)
  process.exit(1)
})
