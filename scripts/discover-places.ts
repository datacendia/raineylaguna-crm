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
 * Usage:
 *   $env:GOOGLE_PLACES_API_KEY='...'; $env:DATABASE_URL='...'
 *   npx tsx scripts/discover-places.ts --dry-run --districts Barranco
 *   npx tsx scripts/discover-places.ts --max-pages 2          # full sweep
 *   npx tsx scripts/discover-places.ts --districts "San Miguel,Lince"
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
const DRY_RUN = args.includes('--dry-run')
const mpIdx = args.indexOf('--max-pages')
const MAX_PAGES = mpIdx >= 0 ? Math.max(1, parseInt(args[mpIdx + 1], 10)) : 2
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

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Sweeping ${districts.length} districts × ${NICHES.length} niches (max ${MAX_PAGES} pages each)…\n`,
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
          if (DRY_RUN) {
            console.log(`  + ${resolvedDistrict}/${niche}: ${name} (site:${website ?? '—'} phone:${phone ?? '—'} addr:${address ?? '—'})`)
            inserted++
          } else {
            try {
              const r = await pool.query(
                `INSERT INTO crm_leads (name, district, niche, phone, website_url, website_status, source, google_place_id, address)
                 VALUES ($1,$2,$3,$4,$5,$6,'google_places',$7,$8)
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
