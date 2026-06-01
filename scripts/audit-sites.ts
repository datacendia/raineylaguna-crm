/**
 * Digital Presence Audit batch runner for crm_leads.
 *
 * For each lead it computes a 0-100 Digital Health Score (higher = healthier
 * site, lower = bigger sales opportunity) plus concrete findings, using Google
 * PageSpeed Insights + homepage HTML heuristics (see src/lib/audit.ts). No
 * fabrication — only what the site actually exposes.
 *
 * Idempotent: by default only audits leads where audited_at IS NULL. Use
 * --force to re-audit (monthly freshness sweeps). Leads with no website score
 * 0 instantly (no network).
 *
 * PageSpeed is rate-limited and ~10-20s per call, so concurrency is low and an
 * API key (GOOGLE_PAGESPEED_API_KEY) is recommended for large runs.
 *
 * Usage:
 *   $env:DATABASE_URL='...'; $env:GOOGLE_PAGESPEED_API_KEY='...'
 *   npx tsx scripts/audit-sites.ts --dry-run --limit 20
 *   npx tsx scripts/audit-sites.ts --limit 200 --concurrency 5
 *   npx tsx scripts/audit-sites.ts --force --district Miraflores
 */
import { Pool } from 'pg'
import { config } from 'dotenv'
import { auditWebsite } from '../src/lib/audit'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set.')
  process.exit(1)
}
const API_KEY =
  process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PLACES_API_KEY || undefined

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null
const concIdx = args.indexOf('--concurrency')
const CONCURRENCY = concIdx >= 0 ? Math.max(1, parseInt(args[concIdx + 1], 10)) : 5
const distIdx = args.indexOf('--district')
const DISTRICT = distIdx >= 0 ? args[distIdx + 1] : null

const pool = new Pool({ connectionString: DATABASE_URL })

type Row = { id: string; name: string; website_url: string | null }

async function ensureSchema() {
  await pool.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS digital_health_score SMALLINT')
  await pool.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS audit_findings JSONB')
  await pool.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS audited_at TIMESTAMPTZ')
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>) {
  let i = 0
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx])
    }
  })
  await Promise.all(runners)
}

async function main() {
  if (!DRY_RUN) await ensureSchema()
  if (!API_KEY) {
    console.warn(
      '! No GOOGLE_PAGESPEED_API_KEY / GOOGLE_PLACES_API_KEY set — using keyless PageSpeed (low quota).',
    )
  }

  const where: string[] = ['1=1']
  const params: unknown[] = []
  if (!FORCE) where.push('audited_at IS NULL')
  if (DISTRICT) {
    params.push(DISTRICT)
    where.push(`district = $${params.length}`)
  }
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : ''
  const { rows } = await pool.query<Row>(
    `SELECT id, name, website_url FROM crm_leads
      WHERE ${where.join(' AND ')} ORDER BY created_at ${limitSql}`,
    params,
  )

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Auditing ${rows.length} leads (concurrency ${CONCURRENCY})…\n`,
  )

  let done = 0
  let scoreSum = 0
  const tally = { noSite: 0, unreachable: 0, audited: 0 }

  await runPool(rows, async (lead) => {
    const findings = await auditWebsite({ websiteUrl: lead.website_url, apiKey: API_KEY })
    done++
    scoreSum += findings.score
    tally.audited++
    if (!findings.hadSite) tally.noSite++
    else if (!findings.reachable) tally.unreachable++

    if (DRY_RUN) {
      console.log(`  ${String(findings.score).padStart(3)} | ${lead.name} — ${findings.summary}`)
    } else {
      await pool.query(
        `UPDATE crm_leads
            SET digital_health_score = $2, audit_findings = $3, audited_at = now()
          WHERE id = $1`,
        [lead.id, findings.score, JSON.stringify(findings)],
      )
    }
    if (done % 25 === 0) {
      console.log(
        `  …${done}/${rows.length} (avg ${Math.round(scoreSum / done)}, no-site ${tally.noSite}, unreachable ${tally.unreachable})`,
      )
    }
  })

  const avg = tally.audited ? Math.round(scoreSum / tally.audited) : 0
  console.log(
    `\nDone. audited=${tally.audited}, avg_health=${avg}, no_site=${tally.noSite}, unreachable=${tally.unreachable}.`,
  )
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
