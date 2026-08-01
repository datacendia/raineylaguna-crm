/**
 * Discover NEW leads across metropolitan Lima via Google Places API (New).
 *
 * For every (district × niche) it runs a Text Search ("<niche term> en
 * <district>, Lima, Peru"), paginates up to --max-pages, and inserts any
 * business not already in crm_leads. Contact fields (phone, website) come
 * straight from the same call — no second request, no fabrication.
 *
 * Geography is trusted from the place's own formattedAddress, NOT the district
 * we searched for: results outside Lima Province are fenced out by a hard
 * locationRestriction AND re-checked against the address before insert, and the
 * stored district is resolved from the address (the search term is a fallback).
 *
 * Idempotent: dedupes on google_place_id (added as a column on first run).
 * Re-running only adds places discovered since last time.
 *
 * ── THIS SCRIPT SPENDS REAL MONEY ───────────────────────────────────────
 * It bills the Google Places "Text Search Enterprise" SKU — the phone and
 * website fields put it in the top tier — at roughly S/ 0.085 per call. A
 * full sweep is 58 districts × 12 niches × pages, so ~700 calls per page
 * level. Five sweeps in July 2026 cost S/ 598.19 for 7,065 calls.
 *
 * It therefore refuses to spend by default. Running it with no flags prints
 * the plan and the projected cost and makes ZERO API calls. Spending requires
 * BOTH --live and --confirm-spend, typed deliberately.
 *
 * Note the previous trap: --dry-run only skipped the database writes, not the
 * API calls, so a "dry run" was billed in full. --dry-run is now genuinely
 * free, and it is the default.
 *
 * Usage:
 *   $env:GOOGLE_PLACES_API_KEY='...'; $env:DATABASE_URL='...'
 *
 *   # Free. Prints what would be swept and what it would cost.
 *   npx tsx scripts/discover-places.ts --districts "San Miguel,Lince"
 *
 *   # Spends money. Both flags required.
 *   npx tsx scripts/discover-places.ts --live --confirm-spend --max-pages 1 --districts Barranco
 */
import { Pool } from 'pg'
import { config } from 'dotenv'
import { DISTRICTS } from '../src/lib/types'
import { districtFromAddress, looksForeign, LIMA_RECTANGLE } from '../src/lib/lima-districts'

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

/**
 * Spending is opt-in, twice. `--live` says "make real calls"; `--confirm-spend`
 * says "and I know they are billed". Two flags rather than one because the
 * failure this guards against is a re-run from shell history, and a single
 * flag is exactly the thing shell history remembers.
 */
const LIVE = args.includes('--live') && args.includes('--confirm-spend')
/** Anything that is not an explicit, confirmed live run costs nothing. */
const DRY_RUN = !LIVE

const mpIdx = args.indexOf('--max-pages')
// Default 1, not 2. Page two is the long tail: it doubles the bill for the
// weakest half of the results.
const MAX_PAGES = mpIdx >= 0 ? Math.max(1, parseInt(args[mpIdx + 1], 10)) : 1

/** Observed rate: S/ 598.19 across 7,065 Text Search Enterprise calls. */
const SOLES_PER_CALL = 0.0847
const dIdx = args.indexOf('--districts')
const DISTRICT_FILTER = dIdx >= 0 ? args[dIdx + 1].split(',').map((s) => s.trim()) : null

// One focused Spanish search term per niche (best signal-to-noise for Peru).
const NICHES: Array<{ niche: string; term: string }> = [
  { niche: 'Gastronomy', term: 'restaurantes' },
  { niche: 'Professional Services', term: 'estudio de abogados' },
  { niche: 'Beauty & Wellness', term: 'salón de belleza' },
  { niche: 'Automotive', term: 'taller mecánico' },
  { niche: 'Fitness', term: 'gimnasio' },
  { niche: 'Retail', term: 'tienda' },
  { niche: 'Healthcare', term: 'clínica dental' },
  { niche: 'Education', term: 'academia' },
  { niche: 'Hospitality', term: 'hotel' },
  { niche: 'Real Estate', term: 'inmobiliaria' },
  { niche: 'Professional Services', term: 'contador' },
]

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
// Hard geographic fence around Lima Province — see LIMA_RECTANGLE in
// src/lib/lima-districts. Unlike regionCode (only a bias), locationRestriction
// EXCLUDES results outside the box, stopping "Santa Rosa de Lima" salons in
// Caracas / San Salvador from ever entering the pipeline.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.businessStatus',
  'places.formattedAddress',
  'nextPageToken',
].join(',')

const pool = new Pool({ connectionString: DATABASE_URL })

type Place = {
  id: string
  displayName?: { text?: string }
  internationalPhoneNumber?: string
  websiteUri?: string
  businessStatus?: string
  formattedAddress?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function searchPage(query: string, pageToken?: string): Promise<{ places: Place[]; next?: string }> {
  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: 'es',
    regionCode: 'PE',
    maxResultCount: 20,
    locationRestriction: { rectangle: LIMA_RECTANGLE },
  }
  if (pageToken) body.pageToken = pageToken
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY as string,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = (await res.json()) as { places?: Place[]; nextPageToken?: string }
  return { places: data.places ?? [], next: data.nextPageToken }
}

async function ensureSchema() {
  await pool.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS google_place_id text')
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_google_place_id_uidx ON crm_leads (google_place_id) WHERE google_place_id IS NOT NULL',
  )
}

async function main() {
  const districts = DISTRICT_FILTER ?? DISTRICTS
  if (!DRY_RUN) await ensureSchema()

  // Pre-load existing place ids so we don't re-insert across runs.
  const seen = new Set<string>()
  if (!DRY_RUN) {
    const { rows } = await pool.query<{ google_place_id: string }>(
      'SELECT google_place_id FROM crm_leads WHERE google_place_id IS NOT NULL',
    )
    for (const r of rows) seen.add(r.google_place_id)
  }

  const projectedCalls = districts.length * NICHES.length * MAX_PAGES
  const projectedCost = (projectedCalls * SOLES_PER_CALL).toFixed(2)

  // Hard stop. No API call happens on this path — this is the whole point of
  // the guard, and the reason --dry-run was not enough before: it used to skip
  // only the database writes while still paying for every search.
  if (DRY_RUN) {
    console.log(
      `\n  PLAN ONLY — no API calls made, nothing billed.\n\n` +
        `  Districts:  ${districts.length}${DISTRICT_FILTER ? ` (${districts.join(', ')})` : ' (all)'}\n` +
        `  Niches:     ${NICHES.length}\n` +
        `  Pages each: ${MAX_PAGES}\n` +
        `  ──────────────────────────────\n` +
        `  Would make: ${projectedCalls} Text Search Enterprise calls\n` +
        `  Would cost: ~S/ ${projectedCost}\n\n` +
        `  To actually run it:\n` +
        `    npx tsx scripts/discover-places.ts --live --confirm-spend${
          DISTRICT_FILTER ? ` --districts "${districts.join(',')}"` : ''
        } --max-pages ${MAX_PAGES}\n\n` +
        `  Narrow it first with --districts. A full sweep re-searches every\n` +
        `  district you have already covered, and you pay for the search even\n` +
        `  when every result is a duplicate you already hold.\n`,
    )
    await pool.end()
    return
  }

  console.log(
    `LIVE RUN — this will bill ~S/ ${projectedCost} (${projectedCalls} calls).\n` +
      `Sweeping ${districts.length} districts × ${NICHES.length} niches (max ${MAX_PAGES} pages each)…\n`,
  )

  let inserted = 0
  let skippedDup = 0
  let skippedForeign = 0
  let calls = 0

  for (const district of districts) {
    let districtNew = 0
    for (const { niche, term } of NICHES) {
      const query = `${term} en ${district}, Lima, Peru`
      let token: string | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        let result: { places: Place[]; next?: string }
        try {
          if (page > 0 && token) await sleep(2000) // token needs a moment to activate
          result = await searchPage(query, token)
          calls++
        } catch (err) {
          console.error(`  ! ${district}/${niche} p${page}: ${(err as Error).message}`)
          break
        }
        for (const p of result.places) {
          if (seen.has(p.id)) {
            skippedDup++
            continue
          }
          seen.add(p.id)
          const name = p.displayName?.text?.trim()
          if (!name) continue
          const phone = p.internationalPhoneNumber ?? null
          const website = p.websiteUri ?? null
          const status = website ? 'Has Website' : 'No Website'
          const address = p.formattedAddress ?? null
          // Trust the address, not the search term. Drop anything that still
          // looks foreign (belt-and-suspenders with the location fence) and
          // store the district Google actually places this business in.
          if (looksForeign(address)) {
            skippedForeign++
            continue
          }
          const resolvedDistrict = districtFromAddress(address) ?? district
          {
            // Only reachable on a confirmed live run — the plan-only path
            // returns before any search is issued.
            try {
              const r = await pool.query(
                // 'discovery' is the canonical lead-source bucket (see
                // src/lib/lead-source.ts); google_place_id retains the provenance.
                `INSERT INTO crm_leads (name, district, niche, phone, website_url, website_status, source, google_place_id, address)
                 VALUES ($1,$2,$3,$4,$5,$6,'discovery',$7,$8)
                 ON CONFLICT (google_place_id) WHERE google_place_id IS NOT NULL DO NOTHING`,
                [name, resolvedDistrict, niche, phone, website, status, p.id, address],
              )
              if ((r.rowCount ?? 0) > 0) {
                inserted++
                districtNew++
              } else {
                skippedDup++
              }
            } catch (err) {
              console.error(`  ! insert ${name}: ${(err as Error).message}`)
            }
          }
        }
        token = result.next
        if (!token) break
        await sleep(200)
      }
    }
    console.log(`  ${district}: +${districtNew} new`)
  }

  console.log(
    `\nDone. api_calls=${calls}, new_leads=${inserted}, duplicates_skipped=${skippedDup}, foreign_skipped=${skippedForeign}.`,
  )
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
