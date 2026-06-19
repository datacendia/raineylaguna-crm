/**
 * OpenStreetMap / Overpass API discovery helpers — a FREE alternative to the
 * Google Places discovery path (see scripts/discover-overpass.ts vs
 * scripts/discover-places.ts). Pure and unit-tested: the niche → OSM-tag
 * mapping, the Overpass QL builder, and the OSM-element → lead mapper. All
 * network + DB work lives in the script.
 *
 * Overpass is community-run and fair-use: callers MUST throttle between
 * queries, send a descriptive User-Agent, and keep bounding boxes/timeouts
 * reasonable. It is free, but it is a shared volunteer resource.
 */

/** Overpass bounding box, in Overpass order (south, west, north, east). */
export type Bbox = { south: number; west: number; north: number; east: number }

/**
 * Overpass tag selectors per canonical CRM niche (src/lib/types.ts NICHES).
 * Each entry is [tagKey, [acceptedValues]] and expands to node+way statements
 * with a value regex. Tuned for SMB storefronts, not exhaustive coverage.
 */
export const NICHE_OSM_FILTERS: Record<string, Array<[string, string[]]>> = {
  Gastronomy: [
    ['amenity', ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'food_court']],
    ['shop', ['bakery', 'pastry', 'confectionery', 'deli', 'coffee']],
  ],
  'Professional Services': [
    [
      'office',
      [
        'lawyer', 'accountant', 'estate_agent', 'financial', 'insurance',
        'tax_advisor', 'consulting', 'it', 'notary', 'architect', 'company',
      ],
    ],
  ],
  'Beauty & Wellness': [
    ['shop', ['hairdresser', 'beauty', 'cosmetics', 'massage', 'nails', 'perfumery']],
    ['leisure', ['spa']],
    ['amenity', ['spa']],
  ],
  Automotive: [
    ['shop', ['car', 'car_repair', 'tyres', 'car_parts', 'motorcycle']],
    ['amenity', ['car_wash']],
    ['craft', ['car_repair']],
  ],
  Fitness: [
    ['leisure', ['fitness_centre', 'sports_centre']],
    ['shop', ['sports']],
  ],
  'Industrial & Commercial': [
    ['shop', ['hardware', 'doityourself', 'trade', 'electrical']],
    ['craft', ['carpenter', 'electrician', 'plumber', 'metal_construction', 'painter', 'joiner']],
    ['office', ['company']],
  ],
}

/** Keep only tag-safe characters so a value can never break out of the regex. */
function safeValues(values: string[]): string {
  return values.map((v) => v.replace(/[^a-z0-9_]/gi, '')).filter(Boolean).join('|')
}

/**
 * Build an Overpass QL query for one niche over a bounding box. Emits node+way
 * statements per tag key and `out center;` so ways get a representative
 * lat/lon. Throws for a niche with no configured filters.
 */
export function buildOverpassQuery(niche: string, bbox: Bbox, timeoutS = 90): string {
  const filters = NICHE_OSM_FILTERS[niche]
  if (!filters || filters.length === 0) {
    throw new Error(`No OSM filters configured for niche "${niche}"`)
  }
  const box = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`
  const stmts: string[] = []
  for (const [key, values] of filters) {
    const sel = `["${key}"~"^(${safeValues(values)})$"]`
    stmts.push(`  node${sel}${box};`)
    stmts.push(`  way${sel}${box};`)
  }
  return `[out:json][timeout:${timeoutS}];\n(\n${stmts.join('\n')}\n);\nout center;`
}

/** A raw element as returned by the Overpass API. */
export type OsmElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** A discovery candidate distilled from an OSM element. */
export type OsmLead = {
  osmId: string
  name: string
  phone: string | null
  website: string | null
  address: string | null
  /** OSM-provided district candidate (addr:*), still to be canonicalised. */
  district: string | null
  lat: number | null
  lon: number | null
}

function pickPhone(t: Record<string, string>): string | null {
  const p = t.phone || t['contact:phone'] || t['contact:mobile'] || null
  if (!p) return null
  const first = p.split(';')[0].trim()
  return first || null
}

function pickWebsite(t: Record<string, string>): string | null {
  const w = t.website || t['contact:website'] || t.url || null
  if (!w) return null
  const first = w.trim().split(/[\s;,]/)[0]
  if (!first) return null
  return /^https?:\/\//i.test(first) ? first : `https://${first}`
}

function buildAddress(t: Record<string, string>): string | null {
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ').trim()
  const parts = [
    street,
    t['addr:suburb'] || t['addr:city_district'] || t['addr:neighbourhood'],
    t['addr:city'],
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/**
 * Map a raw Overpass element to a lead candidate, or null when it has no name
 * (an unnamed POI is useless for outreach).
 */
export function osmElementToLead(el: OsmElement): OsmLead | null {
  const t = el.tags ?? {}
  const name = (t.name || '').trim()
  if (!name) return null
  return {
    osmId: `${el.type}/${el.id}`,
    name,
    phone: pickPhone(t),
    website: pickWebsite(t),
    address: buildAddress(t),
    district: t['addr:city_district'] || t['addr:suburb'] || t['addr:neighbourhood'] || null,
    lat: el.lat ?? el.center?.lat ?? null,
    lon: el.lon ?? el.center?.lon ?? null,
  }
}
