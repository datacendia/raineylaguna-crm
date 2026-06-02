/**
 * Sereno (vigia) customer cross-reference sync. ROADMAP #3.
 *
 * Answers the most important business question — "of the leads we audited and
 * pitched, who actually became a Sereno customer?" — by matching crm_leads
 * emails against vigia's customer list and stamping crm_leads.sereno_customer.
 *
 * Data source: a read-only endpoint on vigia (VIGIA_CUSTOMERS_URL) gated by a
 * shared bearer secret (VIGIA_SYNC_SECRET). The vigia side must expose customer
 * emails; this script is tolerant of two shapes:
 *   { "emails": ["a@x.com", ...] }
 *   { "customers": [{ "email": "a@x.com" }, ...] }
 *
 * The match is recomputed for every lead with an email on each run, so a
 * churned customer correctly flips back to false. Idempotent.
 *
 * Operator setup (Railway cron, e.g. daily 0 12 * * *):
 *   npm run sync-sereno
 *   Env: DATABASE_URL, VIGIA_CUSTOMERS_URL, VIGIA_SYNC_SECRET
 *   Optional: SERENO_SYNC_DRY_RUN=true
 */
import { Pool } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DRY_RUN = process.env.SERENO_SYNC_DRY_RUN === 'true'

async function fetchCustomerEmails(url: string, secret: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`vigia customers endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = (await res.json()) as
    | { emails?: string[] }
    | { customers?: Array<{ email?: string }> }
  const raw =
    'emails' in data && Array.isArray(data.emails)
      ? data.emails
      : 'customers' in data && Array.isArray(data.customers)
        ? data.customers.map((c) => c.email ?? '')
        : []
  return [...new Set(raw.map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
}

async function main() {
  const url = process.env.VIGIA_CUSTOMERS_URL
  const secret = process.env.VIGIA_SYNC_SECRET
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  if (!url || !secret) {
    throw new Error('VIGIA_CUSTOMERS_URL and VIGIA_SYNC_SECRET are required')
  }

  const emails = await fetchCustomerEmails(url, secret)
  console.log(
    `[sync-sereno] ${new Date().toISOString()} | ${emails.length} customer email(s) from vigia | dry_run=${DRY_RUN}`,
  )
  if (DRY_RUN) {
    console.log(`  would match against crm_leads.email (lowercased).`)
    return
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const res = await pool.query<{ matched: number }>(
      `WITH updated AS (
         UPDATE crm_leads
            SET sereno_customer = (lower(email) = ANY($1::text[])),
                sereno_checked_at = NOW()
          WHERE email IS NOT NULL AND deleted_at IS NULL
        RETURNING sereno_customer
       )
       SELECT COUNT(*) FILTER (WHERE sereno_customer)::int AS matched FROM updated`,
      [emails],
    )
    console.log(`  ✓ ${res.rows[0]?.matched ?? 0} lead(s) flagged as Sereno customers.`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[sync-sereno] fatal:', err)
  process.exit(1)
})
