/**
 * Backfill crm_leads.address for existing leads using Google Place Details (New).
 *
 * For every lead that has a google_place_id but no address, GET
 *   https://places.googleapis.com/v1/places/<place_id>
 * with FieldMask=formattedAddress and store it.
 *
 * COST: `formattedAddress` is an Essentials-tier Place Details field (~$5 per
 * 1,000 calls at 2025 pricing, with a monthly free allotment). At ~17.8k leads
 * that is roughly $40-90 depending on the free tier. ALWAYS run --dry-run first
 * and start with a small --limit to confirm billing in the Google Cloud console.
 *
 * Idempotent: only touches rows where address IS NULL AND google_place_id IS NOT NULL,
 * and the UPDATE re-checks address IS NULL so concurrent runs never clobber.
 *
 * Usage:
 *   $env:GOOGLE_PLACES_API_KEY='...'; $env:DATABASE_URL='...'
 *   npx tsx scripts/backfill-addresses.ts --dry-run
 *   npx tsx scripts/backfill-addresses.ts --limit 50
 *   npx tsx scripts/backfill-addresses.ts            # everything remaining
 */
import { Pool } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const API_KEY = process.env.GOOGLE_PLACES_API_KEY
const DATABASE_URL = process.env.DATABASE_URL
if (!API_KEY) {
  console.error('✗ GOOGLE_PLACES_API_KEY is not set.')
  process.exit(1)
}
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set.')
  process.exit(1)
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? Math.max(1, parseInt(args[limitIdx + 1], 10)) : null
const CONCURRENCY = 8

const pool = new Pool({ connectionString: DATABASE_URL })

type Row = { id: string; google_place_id: string }

async function fetchAddress(placeId: string): Promise<string | null> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': API_KEY as string,
        'X-Goog-FieldMask': 'formattedAddress',
      },
    })
    if (res.ok) {
      const data = (await res.json()) as { formattedAddress?: string }
      return data.formattedAddress ?? null
    }
    // Retry transient rate-limit / server errors with linear backoff; other
    // 4xx (e.g. NOT_FOUND for a stale place id) are permanent — fail fast.
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
      continue
    }
    throw new Error(`${res.status}: ${(await res.text()).slice(0, 160)}`)
  }
  throw new Error('rate-limited (429/5xx) after 3 attempts')
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
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : ''
  const { rows } = await pool.query<Row>(
    `SELECT id, google_place_id FROM crm_leads
      WHERE google_place_id IS NOT NULL AND address IS NULL
      ORDER BY created_at ${limitSql}`,
  )

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}${rows.length} lead(s) need an address ` +
    `(google_place_id present, address NULL).`,
  )
  if (DRY_RUN) {
    console.log(
      `Would issue ${rows.length} Place Details calls (FieldMask=formattedAddress). No writes, no API calls made.`,
    )
    await pool.end()
    return
  }

  let updated = 0
  let noAddress = 0
  let failed = 0
  await runPool(rows, async (r) => {
    try {
      const addr = await fetchAddress(r.google_place_id)
      if (addr) {
        await pool.query(
          'UPDATE crm_leads SET address = $2, updated_at = now() WHERE id = $1 AND address IS NULL',
          [r.id, addr],
        )
        updated++
      } else {
        noAddress++
      }
    } catch (err) {
      failed++
      console.error(`  ! ${r.id}: ${(err as Error).message}`)
    }
    const seen = updated + noAddress + failed
    if (seen % 200 === 0) {
      console.log(`  …${seen}/${rows.length} (updated ${updated}, no_address ${noAddress}, failed ${failed})`)
    }
  })

  console.log(`\nDone. updated=${updated}, no_address=${noAddress}, failed=${failed}.`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
