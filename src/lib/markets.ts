/**
 * Market registry — the single source of truth that turns the CRM from a
 * Lima-only tool into a multi-city one. Each market is a data entry: its
 * districts/neighbourhoods, affordability tiers (for the priority score), a
 * discovery bounding box (for Overpass/Places), and locale facts (currency,
 * timezone, phone code) that Phase-2 outreach localization will read.
 *
 * Adding a city is a few lines here — nothing else hard-codes geography.
 *
 * Lima reuses the existing intelligence in `lima-districts.ts` so its district
 * list + tiers stay defined in exactly one place. The new markets (Boston,
 * Glasgow, Los Angeles) ship with sensible STARTER neighbourhood lists and
 * tiers — edit them freely; the dashboard, scoring, and discovery all read
 * from here.
 */
import { DISTRICTS as LIMA_DISTRICTS } from './types'
import { DISTRICT_TIER as LIMA_TIERS, LIMA_RECTANGLE } from './lima-districts'

export type DistrictTier = 'A' | 'B' | 'C'

/** Bounding box in Overpass order (south, west, north, east). */
export type Bbox = { south: number; west: number; north: number; east: number }

export type Market = {
  /** Display name; also the value stored in `crm_leads.city`. */
  name: string
  country: string
  /** ISO-4217 currency (Phase 2: pitch pricing). */
  currency: string
  /** IANA timezone (Phase 2: outreach quiet-hours). */
  timezone: string
  /** E.164 country calling code, no '+' (Phase 2: phone formatting). */
  phoneCode: string
  /** Outreach language for this market — drives bilingual draft generation. */
  locale: 'es' | 'en'
  /** Neighbourhoods / districts in this market. */
  districts: string[]
  /** Affordability tier per district; anything unlisted defaults to 'C'. */
  tiers: Record<string, DistrictTier>
  /** Hard geographic fence for discovery (Overpass + Places). */
  bbox: Bbox
  /** When true, NO automated outreach (Email/WhatsApp) is sent for leads in
   *  this market — the operator contacts every lead by hand. A safe default for
   *  a newly added city until its per-channel consent path is established. */
  manualOnly?: boolean
}

// Lima's box, converted from the Google-shaped LIMA_RECTANGLE.
const LIMA_BBOX: Bbox = {
  south: LIMA_RECTANGLE.low.latitude,
  west: LIMA_RECTANGLE.low.longitude,
  north: LIMA_RECTANGLE.high.latitude,
  east: LIMA_RECTANGLE.high.longitude,
}

// --- Boston (USA) — starter list ------------------------------------------
const BOSTON_DISTRICTS = [
  'Back Bay', 'Beacon Hill', 'North End', 'South End', 'Fenway', 'Kenmore',
  'Allston', 'Brighton', 'Charlestown', 'Jamaica Plain', 'Dorchester',
  'South Boston', 'Roxbury', 'Roslindale', 'West Roxbury', 'Hyde Park',
  'Mattapan', 'East Boston', 'Mission Hill', 'Downtown', 'Seaport',
  'Cambridge', 'Somerville', 'Brookline',
]
const BOSTON_TIERS: Record<string, DistrictTier> = {
  'Back Bay': 'A', 'Beacon Hill': 'A', Seaport: 'A', Downtown: 'A', 'South End': 'A',
  Cambridge: 'A', Brookline: 'A',
  Fenway: 'B', Kenmore: 'B', Charlestown: 'B', 'Jamaica Plain': 'B', 'South Boston': 'B',
  Somerville: 'B', Allston: 'B', Brighton: 'B', 'North End': 'B',
}

// --- Glasgow (UK) — starter list ------------------------------------------
const GLASGOW_DISTRICTS = [
  'City Centre', 'Merchant City', 'West End', 'Finnieston', 'Hillhead', 'Hyndland',
  'Dowanhill', 'Kelvinbridge', 'Partick', 'Dennistoun', 'Shawlands', 'Strathbungo',
  'Pollokshields', 'Mount Florida', 'Cathcart', 'Govan', 'Govanhill', 'East End',
  'Southside',
]
const GLASGOW_TIERS: Record<string, DistrictTier> = {
  'City Centre': 'A', 'Merchant City': 'A', 'West End': 'A', Finnieston: 'A', Hillhead: 'A',
  Hyndland: 'A', Dowanhill: 'A', Kelvinbridge: 'A', Pollokshields: 'A',
  Shawlands: 'B', Strathbungo: 'B', Partick: 'B', Dennistoun: 'B', 'Mount Florida': 'B',
  Cathcart: 'B',
}

// --- Los Angeles (USA) — starter list -------------------------------------
const LA_DISTRICTS = [
  'Downtown', 'Hollywood', 'West Hollywood', 'Beverly Hills', 'Santa Monica',
  'Venice', 'Silver Lake', 'Echo Park', 'Los Feliz', 'Koreatown', 'Culver City',
  'Pasadena', 'Studio City', 'Sherman Oaks', 'Westwood', 'Brentwood',
  'Highland Park', 'Eagle Rock', 'Atwater Village', 'Mid-Wilshire', 'Mar Vista',
  'Marina del Rey',
]
const LA_TIERS: Record<string, DistrictTier> = {
  'Beverly Hills': 'A', 'Santa Monica': 'A', 'West Hollywood': 'A', Brentwood: 'A',
  Westwood: 'A', 'Culver City': 'A', Pasadena: 'A', 'Studio City': 'A', 'Marina del Rey': 'A',
  Hollywood: 'B', 'Silver Lake': 'B', 'Echo Park': 'B', 'Los Feliz': 'B', Venice: 'B',
  'Sherman Oaks': 'B', 'Mar Vista': 'B', 'Atwater Village': 'B', 'Mid-Wilshire': 'B',
}

// --- Bogotá (Colombia) — starter list, manual-only -------------------------
const BOGOTA_DISTRICTS = [
  'Usaquén', 'Chapinero', 'Chicó', 'Rosales', 'El Nogal', 'Cabrera', 'Country Club',
  'Zona Rosa', 'Zona T', 'Quinta Camacho', 'Cedritos', 'Teusaquillo', 'Galerías',
  'Salitre', 'Modelia', 'La Candelaria', 'Santa Fe', 'Macarena', 'Suba', 'Engativá',
  'Fontibón', 'Kennedy',
]
const BOGOTA_TIERS: Record<string, DistrictTier> = {
  Usaquén: 'A', Chicó: 'A', Rosales: 'A', 'El Nogal': 'A', Cabrera: 'A',
  'Country Club': 'A', 'Zona Rosa': 'A', 'Zona T': 'A',
  Chapinero: 'B', 'Quinta Camacho': 'B', Cedritos: 'B', Teusaquillo: 'B',
  Galerías: 'B', Salitre: 'B', Modelia: 'B',
}

// --- Buenos Aires (Argentina) — starter list, manual-only ------------------
const BUENOS_AIRES_DISTRICTS = [
  'Puerto Madero', 'Recoleta', 'Palermo', 'Belgrano', 'Núñez', 'Barrio Norte',
  'Las Cañitas', 'Colegiales', 'Villa Crespo', 'Caballito', 'Villa Urquiza',
  'San Telmo', 'Retiro', 'Almagro', 'Boedo', 'Flores', 'Microcentro', 'Monserrat',
  'Saavedra', 'Coghlan', 'Villa Devoto',
]
const BUENOS_AIRES_TIERS: Record<string, DistrictTier> = {
  'Puerto Madero': 'A', Recoleta: 'A', Palermo: 'A', Belgrano: 'A', Núñez: 'A',
  'Barrio Norte': 'A', 'Las Cañitas': 'A',
  Colegiales: 'B', 'Villa Crespo': 'B', Caballito: 'B', 'Villa Urquiza': 'B',
  'San Telmo': 'B', Retiro: 'B', Almagro: 'B',
}

// --- Santiago (Chile) — starter list, manual-only -------------------------
const SANTIAGO_DISTRICTS = [
  'Las Condes', 'Vitacura', 'Lo Barnechea', 'Providencia', 'Ñuñoa', 'La Reina',
  'Santiago Centro', 'Lastarria', 'Barrio Italia', 'Bellavista', 'Macul',
  'San Miguel', 'Recoleta', 'Independencia', 'Maipú', 'La Florida', 'Peñalolén',
  'Estación Central', 'Quinta Normal',
]
const SANTIAGO_TIERS: Record<string, DistrictTier> = {
  'Las Condes': 'A', Vitacura: 'A', 'Lo Barnechea': 'A', Providencia: 'A',
  Ñuñoa: 'B', 'La Reina': 'B', 'Santiago Centro': 'B', Lastarria: 'B',
  'Barrio Italia': 'B', Bellavista: 'B',
}

// --- Montevideo (Uruguay) — starter list, manual-only ---------------------
const MONTEVIDEO_DISTRICTS = [
  'Carrasco', 'Punta Carretas', 'Pocitos', 'Punta Gorda', 'Buceo', 'Malvín',
  'Cordón', 'Centro', 'Ciudad Vieja', 'Parque Rodó', 'Tres Cruces', 'Prado',
  'La Blanqueada', 'Aguada', 'Palermo', 'Parque Batlle', 'Cerrito',
]
const MONTEVIDEO_TIERS: Record<string, DistrictTier> = {
  Carrasco: 'A', 'Punta Carretas': 'A', Pocitos: 'A', 'Punta Gorda': 'A',
  Buceo: 'B', Malvín: 'B', Cordón: 'B', 'Parque Rodó': 'B', Centro: 'B',
  'Parque Batlle': 'B',
}

// --- Medellín (Colombia) — starter list, manual-only ----------------------
const MEDELLIN_DISTRICTS = [
  'El Poblado', 'Provenza', 'Manila', 'Envigado', 'Laureles', 'Conquistadores',
  'Estadio', 'Sabaneta', 'Belén', 'La América', 'El Centro', 'Buenos Aires',
  'Robledo', 'Itagüí', 'La Floresta', 'Castropol',
]
const MEDELLIN_TIERS: Record<string, DistrictTier> = {
  'El Poblado': 'A', Provenza: 'A', Manila: 'A', Envigado: 'A', Castropol: 'A',
  Laureles: 'B', Conquistadores: 'B', Estadio: 'B', Sabaneta: 'B', 'La Floresta': 'B',
}

// --- Quito (Ecuador) — starter list, manual-only --------------------------
const QUITO_DISTRICTS = [
  'Cumbayá', 'González Suárez', 'La Carolina', 'Quito Tenis', 'La Floresta',
  'El Batán', 'La Coruña', 'Bellavista', 'La Mariscal', 'La Pradera',
  'Centro Histórico', 'Guápulo', 'El Bosque', 'Iñaquito', 'La Carolina Norte',
]
const QUITO_TIERS: Record<string, DistrictTier> = {
  Cumbayá: 'A', 'González Suárez': 'A', 'La Carolina': 'A', 'Quito Tenis': 'A',
  'La Floresta': 'B', 'El Batán': 'B', 'La Coruña': 'B', Bellavista: 'B',
  Iñaquito: 'B', 'La Mariscal': 'B',
}

export const MARKETS: Record<string, Market> = {
  Lima: {
    name: 'Lima', country: 'Peru', currency: 'PEN', timezone: 'America/Lima', phoneCode: '51', locale: 'es',
    districts: [...LIMA_DISTRICTS], tiers: LIMA_TIERS, bbox: LIMA_BBOX,
  },
  Boston: {
    name: 'Boston', country: 'USA', currency: 'USD', timezone: 'America/New_York', phoneCode: '1', locale: 'en',
    districts: BOSTON_DISTRICTS, tiers: BOSTON_TIERS,
    bbox: { south: 42.22, west: -71.2, north: 42.45, east: -70.98 },
  },
  Glasgow: {
    name: 'Glasgow', country: 'UK', currency: 'GBP', timezone: 'Europe/London', phoneCode: '44', locale: 'en',
    districts: GLASGOW_DISTRICTS, tiers: GLASGOW_TIERS,
    bbox: { south: 55.78, west: -4.4, north: 55.93, east: -4.1 },
  },
  'Los Angeles': {
    name: 'Los Angeles', country: 'USA', currency: 'USD', timezone: 'America/Los_Angeles', phoneCode: '1', locale: 'en',
    districts: LA_DISTRICTS, tiers: LA_TIERS,
    bbox: { south: 33.7, west: -118.69, north: 34.34, east: -118.12 },
  },
  // Manual-only markets: discovery + scoring + manual outreach work; automated
  // Email/WhatsApp stay off (see manualOnly) until a consent path is in place.
  'Bogotá': {
    name: 'Bogotá', country: 'Colombia', currency: 'COP', timezone: 'America/Bogota', phoneCode: '57', locale: 'es',
    districts: BOGOTA_DISTRICTS, tiers: BOGOTA_TIERS, manualOnly: true,
    bbox: { south: 4.48, west: -74.22, north: 4.84, east: -74.0 },
  },
  'Buenos Aires': {
    name: 'Buenos Aires', country: 'Argentina', currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires', phoneCode: '54', locale: 'es',
    districts: BUENOS_AIRES_DISTRICTS, tiers: BUENOS_AIRES_TIERS, manualOnly: true,
    bbox: { south: -34.71, west: -58.53, north: -34.53, east: -58.33 },
  },
  Santiago: {
    name: 'Santiago', country: 'Chile', currency: 'CLP', timezone: 'America/Santiago', phoneCode: '56', locale: 'es',
    districts: SANTIAGO_DISTRICTS, tiers: SANTIAGO_TIERS, manualOnly: true,
    bbox: { south: -33.65, west: -70.82, north: -33.3, east: -70.5 },
  },
  Montevideo: {
    name: 'Montevideo', country: 'Uruguay', currency: 'UYU', timezone: 'America/Montevideo', phoneCode: '598', locale: 'es',
    districts: MONTEVIDEO_DISTRICTS, tiers: MONTEVIDEO_TIERS, manualOnly: true,
    bbox: { south: -34.95, west: -56.43, north: -34.82, east: -56.03 },
  },
  'Medellín': {
    name: 'Medellín', country: 'Colombia', currency: 'COP', timezone: 'America/Bogota', phoneCode: '57', locale: 'es',
    districts: MEDELLIN_DISTRICTS, tiers: MEDELLIN_TIERS, manualOnly: true,
    bbox: { south: 6.13, west: -75.64, north: 6.34, east: -75.52 },
  },
  Quito: {
    name: 'Quito', country: 'Ecuador', currency: 'USD', timezone: 'America/Guayaquil', phoneCode: '593', locale: 'es',
    districts: QUITO_DISTRICTS, tiers: QUITO_TIERS, manualOnly: true,
    bbox: { south: -0.35, west: -78.58, north: -0.02, east: -78.4 },
  },
}

/** Default market for legacy rows / unspecified input. */
export const DEFAULT_CITY = 'Lima'

/** All market names, in registry order. */
export const MARKET_NAMES = Object.keys(MARKETS)

export function getMarket(city?: string | null): Market | undefined {
  return city ? MARKETS[city.trim()] : undefined
}

/** Whether a market is flagged manual-only (no automated outreach). Unknown or
 *  missing city → false (the automated channels then apply their own gates). */
export function isManualOnlyMarket(city?: string | null): boolean {
  return getMarket(city)?.manualOnly === true
}

export function districtsForCity(city?: string | null): string[] {
  return getMarket(city)?.districts ?? []
}

/** Outreach language for a city's market. Defaults to Spanish (the base market). */
export function localeForCity(city?: string | null): 'es' | 'en' {
  return getMarket(city)?.locale ?? 'es'
}

/** Affordability tier for a (city, district). Unknown city/district → 'C'. */
export function tierForDistrict(city?: string | null, district?: string | null): DistrictTier {
  const m = getMarket(city)
  if (!m || !district) return 'C'
  return m.tiers[district.trim()] ?? 'C'
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve a canonical district for a city by scanning an address (or any free
 * text) for the market's district names, longest first so multi-word names win
 * (e.g. "San Juan de Lurigancho" over "Lurigancho"). Null when none match.
 */
export function districtFromAddress(city?: string | null, address?: string | null): string | null {
  const m = getMarket(city)
  if (!m || !address) return null
  const a = norm(address)
  const byLength = [...m.districts]
    .map((d) => ({ name: d, n: norm(d) }))
    .sort((x, y) => y.n.length - x.n.length)
  for (const d of byLength) {
    if (a.includes(d.n)) return d.name
  }
  return null
}
