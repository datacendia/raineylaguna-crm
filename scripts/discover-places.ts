/**
 * Discover NEW leads across metropolitan Lima via Google Places API (New).
 *
 * For every (district × niche) it runs a Text Search ("<niche term> en
 * <district>, Lima, Peru"), paginates up to --max-pages, and inserts any
 * business not already in crm_leads. Contact fields (phone, website) come
 * straight from the same call — no second request, no fabrication.
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

// 43 districts of Lima Province.
const ALL_DISTRICTS = [
  'Ancón', 'Ate', 'Barranco', 'Breña', 'Carabayllo', 'Chaclacayo', 'Chorrillos',
  'Cieneguilla', 'Comas', 'El Agustino', 'Independencia', 'Jesús María', 'La Molina',
  'La Victoria', 'Lima Cercado', 'Lince', 'Los Olivos', 'Lurigancho', 'Lurín',
  'Magdalena del Mar', 'Miraflores', 'Pachacámac', 'Pucusana', 'Pueblo Libre',
  'Puente Piedra', 'Punta Hermosa', 'Punta Negra', 'Rímac', 'San Bartolo', 'San Borja',
  'San Isidro', 'San Juan de Lurigancho', 'San Juan de Miraflores', 'San Luis',
  'San Martín de Porres', 'San Miguel', 'Santa Anita', 'Santa María del Mar',
  'Santa Rosa', 'Santiago de Surco', 'Surquillo', 'Villa El Salvador',
  'Villa María del Triunfo',
]

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
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.businessStatus',
  'nextPageToken',
].join(',')

const pool = new Pool({ connectionString: DATABASE_URL })

type Place = {
  id: string
  displayName?: { text?: string }
  internationalPhoneNumber?: string
  websiteUri?: string
  businessStatus?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function searchPage(query: string, pageToken?: string): Promise<{ places: Place[]; next?: string }> {
  const body: Record<string, unknown> = { textQuery: query, languageCode: 'es', regionCode: 'PE', maxResultCount: 20 }
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
  const districts = DISTRICT_FILTER ?? ALL_DISTRICTS
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
          if (DRY_RUN) {
            console.log(`  + ${district}/${niche}: ${name} (site:${website ?? '—'} phone:${phone ?? '—'})`)
            inserted++
          } else {
            try {
              const r = await pool.query(
                `INSERT INTO crm_leads (name, district, niche, phone, website_url, website_status, source, google_place_id)
                 VALUES ($1,$2,$3,$4,$5,$6,'google_places',$7)
                 ON CONFLICT (google_place_id) WHERE google_place_id IS NOT NULL DO NOTHING`,
                [name, district, niche, phone, website, status, p.id],
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

  console.log(`\nDone. api_calls=${calls}, new_leads=${inserted}, duplicates_skipped=${skippedDup}.`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
