/**
 * Enrich crm_leads with VERIFIED contact data from the Google Places API (New).
 *
 * For each lead it runs a Text Search ("<name>, <district>, Lima, Peru"),
 * takes the top match, and writes back ONLY fields Google actually returns:
 *   - phone        (internationalPhoneNumber)
 *   - website_url  (websiteUri)
 *   - website_status is re-derived from reality:
 *       'Has Website'  when websiteUri is present
 *       'No Website'   when the place exists but has no site
 *       (left untouched when no confident match is found)
 *   - address      (formattedAddress) — persisted, not discarded
 *   - district     re-resolved FROM the address (corrects the search-term echo
 *                  that mislabels districts); left untouched if unresolvable
 *   - notes gets an audit line with the matched name + place id + match score
 *
 * It does NOT invent anything. If Places returns no confident match, the lead
 * is left exactly as-is and logged as UNMATCHED. Matches whose address still
 * looks foreign (despite the Lima location fence) are skipped, not written.
 * Instagram is NOT available from Places — that is a separate web-search pass
 * (scripts/enrich-instagram).
 *
 * Idempotent: re-running only overwrites phone/website_url/website_status/
 * address/district and refreshes the audit note. Safe to resume after
 * interruption.
 *
 * Usage:
 *   $env:GOOGLE_PLACES_API_KEY='...'; $env:DATABASE_URL='...'
 *   npx tsx scripts/enrich-places.ts                 # all un-enriched leads
 *   npx tsx scripts/enrich-places.ts --limit 10      # first 10 (sample)
 *   npx tsx scripts/enrich-places.ts --dry-run       # no DB writes; prints plan
 *   npx tsx scripts/enrich-places.ts --force         # re-enrich already-done rows
 */
import { Pool } from 'pg'
import { config } from 'dotenv'
import { districtFromAddress, looksForeign, LIMA_RECTANGLE } from '../src/lib/lima-districts'

config({ path: '.env.local' })

const API_KEY = process.env.GOOGLE_PLACES_API_KEY
const DATABASE_URL = process.env.DATABASE_URL

if (!API_KEY) {
  console.error('✗ GOOGLE_PLACES_API_KEY is not set. Refusing to run (no fabrication).')
  process.exit(1)
}
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set.')
  process.exit(1)
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null

const pool = new Pool({ connectionString: DATABASE_URL })

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
// Only request the fields we use — keeps cost on the cheapest SKU tier.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.businessStatus',
].join(',')

type Lead = { id: string; name: string; district: string | null; niche: string | null }

type PlaceMatch = {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  businessStatus?: string
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Token-overlap score in [0,1] between the lead name and a candidate name. */
function matchScore(leadName: string, candidate: string): number {
  const a = new Set(normalize(leadName).split(' ').filter(Boolean))
  const b = new Set(normalize(candidate).split(' ').filter(Boolean))
  if (a.size === 0 || b.size === 0) return 0
  let hits = 0
  for (const t of a) if (b.has(t)) hits++
  return hits / a.size
}

async function searchPlace(lead: Lead): Promise<{ match: PlaceMatch; score: number } | null> {
  const query = [lead.name, lead.district, 'Lima', 'Peru'].filter(Boolean).join(', ')
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY as string,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'es',
      regionCode: 'PE',
      maxResultCount: 5,
      locationRestriction: { rectangle: LIMA_RECTANGLE },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Places API ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { places?: PlaceMatch[] }
  const places = data.places ?? []
  if (places.length === 0) return null

  // Pick the best token-overlap match; require >= 0.5 to accept (avoids
  // attaching a random business when the real one isn't on Google).
  let best: PlaceMatch | null = null
  let bestScore = 0
  for (const p of places) {
    const score = matchScore(lead.name, p.displayName?.text ?? '')
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  if (!best || bestScore < 0.5) return null
  return { match: best, score: bestScore }
}

async function main() {
  const where = FORCE ? '' : 'WHERE website_url IS NULL AND phone IS NULL'
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : ''
  const { rows } = await pool.query<Lead>(
    `SELECT id, name, district, niche FROM crm_leads ${where} ORDER BY created_at ${limitSql}`,
  )

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Enriching ${rows.length} leads via Google Places (New)…\n`)

  let matched = 0
  let unmatched = 0
  let foreign = 0
  let withSite = 0
  let withPhone = 0

  for (const lead of rows) {
    try {
      const result = await searchPlace(lead)
      if (!result) {
        unmatched++
        console.log(`  UNMATCHED  ${lead.name} (${lead.district ?? '?'})`)
        continue
      }
      const { match, score } = result
      const address = match.formattedAddress ?? null
      // The location fence should keep matches inside Lima, but if a foreign
      // same-name place still slips through, do NOT overwrite this lead's data
      // with it — skip and log.
      if (looksForeign(address)) {
        foreign++
        console.log(`  FOREIGN?   ${lead.name} -> ${address} (skipped)`)
        continue
      }
      const phone = match.internationalPhoneNumber ?? null
      const website = match.websiteUri ?? null
      const status = website ? 'Has Website' : 'No Website'
      // null → leave the existing district untouched (don't blank a good value).
      const resolvedDistrict = districtFromAddress(address)
      const note = `[places ${new Date().toISOString().slice(0, 10)}] matched "${match.displayName?.text}" (score ${score.toFixed(2)}, id ${match.id}, ${match.businessStatus ?? 'status?'})`

      matched++
      if (website) withSite++
      if (phone) withPhone++

      const shownDistrict = resolvedDistrict ?? lead.district ?? '?'
      if (DRY_RUN) {
        console.log(`  MATCH ${score.toFixed(2)}  ${lead.name} -> ${shownDistrict} site:${website ?? '—'} phone:${phone ?? '—'}`)
      } else {
        await pool.query(
          `UPDATE crm_leads
             SET phone = COALESCE($2, phone),
                 website_url = COALESCE($3, website_url),
                 website_status = $4,
                 address = COALESCE($5, address),
                 district = COALESCE($6, district),
                 notes = CASE WHEN notes IS NULL OR notes = '' THEN $7
                              ELSE notes || E'\\n' || $7 END,
                 updated_at = now()
           WHERE id = $1`,
          [lead.id, phone, website, status, address, resolvedDistrict, note],
        )
        console.log(`  ✓ ${score.toFixed(2)}  ${lead.name} -> ${shownDistrict} site:${website ?? '—'} phone:${phone ?? '—'}`)
      }
    } catch (err) {
      console.error(`  ! ERROR  ${lead.name}: ${(err as Error).message}`)
    }
    // Gentle pacing: ~5 req/s, well under Places default quotas.
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(
    `\nDone. matched=${matched} unmatched=${unmatched} foreign_skipped=${foreign} (of ${rows.length}); with website=${withSite}, with phone=${withPhone}.`,
  )
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
