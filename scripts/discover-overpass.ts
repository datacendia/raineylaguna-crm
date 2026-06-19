/**
 * Discover NEW leads across metropolitan Lima via the FREE OpenStreetMap
 * Overpass API — a no-cost alternative to scripts/discover-places.ts (Google
 * Places, which is metered and can run up a real bill).
 *
 * For each canonical niche it runs ONE Overpass query over the Lima bounding
 * box, maps OSM businesses to leads, resolves the district from address tags,
 * and inserts anything new. Contact fields (phone, website) come from the same
 * response — no second request, no fabrication.
 *
 * Idempotent: dedupes on osm_id (added as a column on first run) AND skips any
 * lead whose phone already exists, so it won't re-add businesses the Google
 * sweep already found.
 *
 * Overpass is a shared volunteer resource — this throttles between niche
 * queries and sends a descriptive User-Agent. Override the endpoint with
 * OVERPASS_URL (e.g. a mirror) if the default is busy.
 *
 * Usage:
 *   $env:DATABASE_URL='...'
 *   npx tsx scripts/discover-overpass.ts --dry-run
 *   npx tsx scripts/discover-overpass.ts --niches "Gastronomy,Fitness"
 *   npx tsx scripts/discover-overpass.ts --max-per-niche 300
 */
import { Pool } from 'pg'
import { config } from 'dotenv'
import { districtFromAddress, LIMA_RECTANGLE } from '../src/lib/lima-districts'
import {
  NICHE_OSM_FILTERS,
  buildOverpassQuery,
  osmElementToLead,
  type Bbox,
  type OsmElement,
} from '../src/lib/overpass'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set.')
  process.exit(1)
}

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const nIdx = args.indexOf('--niches')
const NICHE_FILTER = nIdx >= 0 ? args[nIdx + 1].split(',').map((s) => s.trim()) : null
const mIdx = args.indexOf('--max-per-niche')
const MAX_PER_NICHE = mIdx >= 0 ? Math.max(1, parseInt(args[mIdx + 1], 10)) : 500

// LIMA_RECTANGLE is the Google shape ({low:{latitude,longitude}, high:{…}});
// convert to the Overpass (south, west, north, east) order. Same hard geo
// fence, so no separate foreign-address check is needed here.
const BBOX: Bbox = {
  south: LIMA_RECTANGLE.low.latitude,
  west: LIMA_RECTANGLE.low.longitude,
  north: LIMA_RECTANGLE.high.latitude,
  east: LIMA_RECTANGLE.high.longitude,
}

const pool = new Pool({ connectionString: DATABASE_URL })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const digitsOf = (s: string | null) => (s ? s.replace(/\D/g, '') : '')

async function ensureSchema() {
  await pool.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS osm_id text')
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_osm_id_uidx ON crm_leads (osm_id) WHERE osm_id IS NOT NULL',
  )
}

async function fetchNiche(niche: string): Promise<OsmElement[]> {
  const query = buildOverpassQuery(niche, BBOX)
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'raineylaguna-crm discovery (https://raineylaguna.com; hola@raineylaguna.com)',
    },
    body: 'data=' + encodeURIComponent(query),
  })
  if (!res.ok) {
    throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = (await res.json()) as { elements?: OsmElement[] }
  return data.elements ?? []
}

async function main() {
  const niches = (NICHE_FILTER ?? Object.keys(NICHE_OSM_FILTERS)).filter((n) => {
    if (NICHE_OSM_FILTERS[n]) return true
    console.error(`  ! unknown niche "${n}" — skipping`)
    return false
  })
  if (niches.length === 0) {
    console.error('✗ No valid niches to sweep.')
    process.exit(1)
  }
  if (!DRY_RUN) await ensureSchema()

  // Pre-load existing osm_ids (idempotent re-runs) and phones (cross-source
  // de-dupe with the Google-discovered set).
  const seenOsm = new Set<string>()
  const seenPhones = new Set<string>()
  if (!DRY_RUN) {
    const a = await pool.query<{ osm_id: string }>(
      'SELECT osm_id FROM crm_leads WHERE osm_id IS NOT NULL',
    )
    for (const r of a.rows) seenOsm.add(r.osm_id)
    const b = await pool.query<{ phone: string }>(
      "SELECT phone FROM crm_leads WHERE phone IS NOT NULL AND phone <> ''",
    )
    for (const r of b.rows) {
      const d = digitsOf(r.phone)
      if (d) seenPhones.add(d)
    }
  }

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Overpass sweep: ${niches.length} niches over Lima bbox (endpoint ${OVERPASS_URL})\n`,
  )

  let inserted = 0
  let dupOsm = 0
  let dupPhone = 0
  let unnamed = 0
  let districtUnknown = 0

  for (const niche of niches) {
    let elements: OsmElement[]
    try {
      elements = await fetchNiche(niche)
    } catch (err) {
      console.error(`  ! ${niche}: ${(err as Error).message}`)
      await sleep(5000)
      continue
    }

    let added = 0
    let processed = 0
    for (const el of elements) {
      if (processed >= MAX_PER_NICHE) break
      const lead = osmElementToLead(el)
      if (!lead) {
        unnamed++
        continue
      }
      processed++
      if (seenOsm.has(lead.osmId)) {
        dupOsm++
        continue
      }
      const pd = digitsOf(lead.phone)
      if (pd && seenPhones.has(pd)) {
        dupPhone++
        continue
      }

      // Canonicalise the Lima district from the address, then the OSM district
      // tag; default 'Otro' when neither resolves (bbox already fences geo).
      const district =
        districtFromAddress(lead.address) ?? districtFromAddress(lead.district) ?? 'Otro'
      if (district === 'Otro') districtUnknown++
      const status = lead.website ? 'Has Website' : 'No Website'

      seenOsm.add(lead.osmId)
      if (pd) seenPhones.add(pd)

      if (DRY_RUN) {
        console.log(
          `  + ${district}/${niche}: ${lead.name} (site:${lead.website ?? '—'} phone:${lead.phone ?? '—'})`,
        )
        inserted++
        added++
        continue
      }

      try {
        const r = await pool.query(
          // 'discovery' is the canonical lead-source bucket (src/lib/lead-source.ts);
          // osm_id retains the provenance (e.g. 'node/123456').
          `INSERT INTO crm_leads (name, district, niche, phone, website_url, website_status, source, osm_id, address)
           VALUES ($1,$2,$3,$4,$5,$6,'discovery',$7,$8)
           ON CONFLICT (osm_id) WHERE osm_id IS NOT NULL DO NOTHING`,
          [lead.name, district, niche, lead.phone, lead.website, status, lead.osmId, lead.address],
        )
        if ((r.rowCount ?? 0) > 0) {
          inserted++
          added++
        } else {
          dupOsm++
        }
      } catch (err) {
        console.error(`  ! insert ${lead.name}: ${(err as Error).message}`)
      }
    }

    console.log(`  ${niche}: ${elements.length} osm elements → +${added} new`)
    await sleep(4000) // be kind to the shared Overpass instance
  }

  console.log(
    `\nDone. new_leads=${inserted}, dup_osm=${dupOsm}, dup_phone=${dupPhone}, unnamed_skipped=${unnamed}, district_unknown=${districtUnknown}.`,
  )
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
