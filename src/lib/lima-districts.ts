import { DISTRICTS } from './types'

/**
 * Lima district intelligence — one source of truth for:
 *   1. Affordability tiers (used by the priority score so a San Isidro lead
 *      outranks a Villa María del Triunfo lead at otherwise-equal signals).
 *   2. Resolving the TRUE district from a Google `formattedAddress`, instead of
 *      trusting the district we searched for (which is how foreign "Santa Rosa
 *      de Lima" salons and intra-Lima mislabels leak in).
 *
 * Structural facts live here; the *factors* the score multiplies by live in
 * DEFAULT_WEIGHTS.geo so they stay tunable via CRM_PRIORITY_WEIGHTS.
 */

export type DistrictTier = 'A' | 'B' | 'C'

/**
 * Affordability tier per district, tuned for Rainey Laguna's premium
 * positioning (can this storefront realistically pay S/3,500+ for a build?) —
 * NOT a census income ranking. Anything not listed defaults to Tier C.
 *
 *   A — consolidated / high-income core where the boutique offer lands
 *   B — mixed / emerging districts
 *   C — price-sensitive outer cones (the default)
 */
export const DISTRICT_TIER: Record<string, DistrictTier> = {
  // Tier A — premium core
  'San Isidro': 'A',
  Miraflores: 'A',
  Barranco: 'A',
  'Santiago de Surco': 'A',
  'La Molina': 'A',
  'San Borja': 'A',
  Surquillo: 'A',
  'Magdalena del Mar': 'A',
  'Jesús María': 'A',
  Lince: 'A',
  'Pueblo Libre': 'A',
  'San Miguel': 'A',
  // Tier B — mixed / emerging
  'Los Olivos': 'B',
  Chorrillos: 'B',
  'La Victoria': 'B',
  Breña: 'B',
  'Lima Cercado': 'B',
  Rímac: 'B',
  'San Luis': 'B',
  'Santa Anita': 'B',
  Ate: 'B',
  'San Martín de Porres': 'B',
  Chaclacayo: 'B',
  Cieneguilla: 'B',
}

/** Tier for a district name. Unknown / unrecognised → Tier C (deprioritise). */
export function tierForDistrict(district?: string | null): DistrictTier {
  if (!district) return 'C'
  return DISTRICT_TIER[district.trim()] ?? 'C'
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Pre-normalised district names, longest first, so "San Juan de Lurigancho"
// wins over "Lurigancho" and "San Juan de Miraflores" over "Miraflores".
const DISTRICTS_BY_LENGTH = [...DISTRICTS]
  .map((d) => ({ name: d, n: norm(d) }))
  .sort((a, b) => b.n.length - a.n.length)

/**
 * Resolve the real Lima district from a Google `formattedAddress` by scanning
 * for any of the 43 known district names. Returns null when none appears
 * (foreign address, or a locality we don't track) — callers decide whether to
 * fall back to the searched district or flag the row.
 */
export function districtFromAddress(address?: string | null): string | null {
  if (!address) return null
  const a = norm(address)
  for (const d of DISTRICTS_BY_LENGTH) {
    if (a.includes(d.n)) return d.name
  }
  return null
}

/**
 * Conservative foreign-address detector. Only returns true when the address is
 * present, contains no "Perú/Peru" token, AND matches none of the 43 Lima
 * districts — i.e. the Caracas / San Salvador "Santa Rosa de Lima" case. Absent
 * addresses are NOT treated as foreign (we simply don't know yet).
 */
export function looksForeign(address?: string | null): boolean {
  if (!address) return false
  const a = norm(address)
  if (/\bperu\b/.test(a)) return false
  return districtFromAddress(address) === null
}

/**
 * Bounding rectangle of Lima Province (SW corner → NE corner) for the Google
 * Places `locationRestriction` field — a hard fence, not a bias. Shared by the
 * discover and enrich scripts so the geography stays defined in exactly one
 * place.
 */
export const LIMA_RECTANGLE = {
  low: { latitude: -12.55, longitude: -77.25 },
  high: { latitude: -11.5, longitude: -76.6 },
}
