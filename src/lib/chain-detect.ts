/**
 * Chain / multi-location detection.
 *
 * The existing rules (2026-06-03-franchise-flag.sql) catch two things: leads
 * sharing a phone or email with 3+ others, and a hand-written list of Peruvian
 * brands. Both miss the case that actually matters, because a big chain's
 * branches usually carry DIFFERENT phone numbers and the brand list can only
 * ever contain names someone thought to add.
 *
 * The result is visible on the analytics page right now: Opportunity Radar's
 * top three are Bodytech, Adidas and Marathon Sports — all scored Crítico 89,
 * all counted inside "Addressable (independents): 35,328". Adidas appears 42
 * times, Bodytech 26. A one-person studio cannot sell a website to Adidas Peru;
 * their web presence is decided several countries away.
 *
 * The general rule added here needs no brand list:
 *
 *     the same business name in THREE OR MORE DISTINCT DISTRICTS is a chain
 *
 * A single business does not operate under one name in three districts at
 * once. This catches Adidas, Bodytech, Marathon Sports, Starbucks, Home Depot
 * and Tienda Mass without anyone having to enumerate them, and it keeps
 * working for whatever gets scraped next.
 *
 * The district test is what separates a chain from a duplicate, and the two
 * need opposite treatment:
 *
 *     same name, MANY districts -> chain      (real, unsellable, demote)
 *     same name, ONE district   -> duplicate  (one business, merge)
 *
 * Without that split, "Casa" x67 would be flagged as a national chain when it
 * is really 67 scraped rows for businesses that share a very common word.
 * Duplicates are lead-dedupe.ts's problem, not this module's.
 */

/** Legal-form and branch-qualifier noise that must not split one brand in two. */
const LEGAL_SUFFIX_RE =
  /\b(s\.?a\.?c\.?|s\.?a\.?a\.?|s\.?r\.?l\.?|e\.?i\.?r\.?l\.?|s\.?a\.?|ltda?|inc|llc|corp|co|company|group|grupo|peru|perú)\b/gi

/**
 * Branch markers: "Adidas - Jockey Plaza", "Bodytech Sede El Polo",
 * "Starbucks (Larcomar)", "Tienda Mass 231". Everything from the marker
 * onward is location, not identity.
 */
const BRANCH_MARKER_RE =
  /\s*(?:[-–—|/(]|\b(?:sede|sucursal|tienda|local|store|branch|agencia|mall|cc)\b)\s*.*$/i

/**
 * Reduce a raw lead name to the brand it represents.
 *
 * Deliberately aggressive: the cost of over-normalising is grouping two
 * genuinely different businesses, which the 3-district threshold then filters
 * out anyway; the cost of under-normalising is a chain slipping through as 42
 * independent prospects, which is the bug being fixed.
 */
export function normaliseBrand(name: string): string {
  return (
    String(name ?? '')
      .normalize('NFD')
      // Strip combining accents so "Perú" and "Peru" are one brand.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(BRANCH_MARKER_RE, '')
      .replace(LEGAL_SUFFIX_RE, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Names too generic to group on. "Casa" in three districts is three unrelated
 * businesses, not a chain; grouping on it would demote real independents,
 * which is worse than missing a chain.
 */
const GENERIC_NAMES = new Set([
  'casa',
  'restaurante',
  'restaurant',
  'bodega',
  'minimarket',
  'market',
  'salon',
  'peluqueria',
  'barberia',
  'gimnasio',
  'gym',
  'cafe',
  'cafeteria',
  'bar',
  'hotel',
  'hostal',
  'clinica',
  'farmacia',
  'botica',
  'taller',
  'ferreteria',
  'panaderia',
  'pizzeria',
  'polleria',
  'chifa',
  'cevicheria',
  'spa',
  'lavanderia',
  'estudio',
  'oficina',
  'tienda',
  'negocio',
  'empresa',
  'local',
  'sin nombre',
])

export function isGenericName(brand: string): boolean {
  return brand.length < 3 || GENERIC_NAMES.has(brand)
}

export type ChainCandidateInput = {
  id: string
  name: string
  city?: string | null
  district?: string | null
}

export type ChainGroup = {
  brand: string
  leadIds: string[]
  /** Distinct districts the brand appears in — the evidence for the call. */
  districts: string[]
  count: number
}

/** Distinct districts a brand must span before it counts as a chain. */
export const CHAIN_DISTRICT_THRESHOLD = 3

/**
 * Group leads into multi-location brands.
 *
 * Returns only groups that clear the district threshold, so every returned
 * group is a defensible chain call with its evidence attached.
 */
export function detectChains(
  leads: ChainCandidateInput[],
  districtThreshold: number = CHAIN_DISTRICT_THRESHOLD,
): ChainGroup[] {
  const byBrand = new Map<string, { ids: string[]; districts: Set<string> }>()

  for (const lead of leads) {
    const brand = normaliseBrand(lead.name)
    if (!brand || isGenericName(brand)) continue

    let entry = byBrand.get(brand)
    if (!entry) {
      entry = { ids: [], districts: new Set() }
      byBrand.set(brand, entry)
    }
    entry.ids.push(lead.id)
    // City-qualified so the same district name in two cities counts twice —
    // and so a brand in one district of six cities is still a chain.
    const where = `${lead.city ?? '?'}/${lead.district ?? '?'}`
    entry.districts.add(where)
  }

  const groups: ChainGroup[] = []
  for (const [brand, entry] of byBrand) {
    if (entry.districts.size < districtThreshold) continue
    groups.push({
      brand,
      leadIds: entry.ids,
      districts: [...entry.districts].sort(),
      count: entry.ids.length,
    })
  }

  return groups.sort((a, b) => b.count - a.count)
}

/**
 * International brands that can appear only once or twice in the base and
 * still obviously not be sellable. The district rule handles the rest; this is
 * the short backstop for the ones with a single flagship store.
 *
 * Kept small on purpose. A brand list is unmaintainable as a primary strategy
 * — that is precisely why the existing migration missed Adidas — so this exists
 * only to catch what a threshold cannot.
 */
const KNOWN_GLOBAL_BRANDS = [
  'adidas', 'nike', 'puma', 'reebok', 'under armour', 'new balance', 'skechers',
  'zara', 'h m', 'forever 21', 'gap', 'uniqlo', 'mango',
  'starbucks', 'mcdonalds', 'burger king', 'kfc', 'subway', 'dominos',
  'pizza hut', 'papa johns', 'dunkin', 'popeyes', 'wendys',
  'home depot', 'ikea', 'walmart', 'costco', 'target',
  'bodytech', 'smart fit', 'gold s gym', 'anytime fitness',
  'marathon sports', 'decathlon', 'foot locker',
  'apple', 'samsung', 'huawei', 'xiaomi',
  'banco de credito', 'bbva', 'scotiabank', 'interbank',
]

export function isKnownGlobalBrand(name: string): boolean {
  const brand = normaliseBrand(name)
  if (!brand) return false
  return KNOWN_GLOBAL_BRANDS.some((b) => brand === b || brand.startsWith(`${b} `))
}

/**
 * Should this lead be treated as a chain, given the groups already computed?
 * Combines both signals so callers have one question to ask.
 */
export function isChainLead(
  lead: ChainCandidateInput,
  chainBrands: ReadonlySet<string>,
): boolean {
  if (isKnownGlobalBrand(lead.name)) return true
  return chainBrands.has(normaliseBrand(lead.name))
}
