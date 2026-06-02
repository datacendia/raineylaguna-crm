/**
 * Maps a lead's free-text `potential` (the service/build opportunity, e.g.
 * "Full Web Build", "Catalog Modernization") to the matching service page on
 * raineylaguna.com, so the digest can link each Potential to a real offer.
 *
 * The mapping is a small, deterministic keyword heuristic — `potential` is
 * free-text (operator/AI authored) so there is no fixed enum. It is intended
 * to be edited by hand: add/adjust keywords in RULES as new Potential phrasings
 * appear. Diacritics are stripped before matching, so rules stay ASCII.
 *
 * Canonical service slugs/URLs were taken from raineylaguna.com (/servicios/*).
 */

export const SITE = 'https://raineylaguna.com'

export type ServiceKey =
  | 'websites'
  | 'marca'
  | 'care'
  | 'sereno'
  | 'garua'
  | 'espejo'
  | 'socio'
  | 'vitrina'
  | 'demolicion'
  | 'apertura'
  | 'memoria'
  | 'auditoria'

export interface Service {
  key: ServiceKey
  /** Display name as used on the marketing site. */
  name: string
  /** Absolute URL of the service page. */
  url: string
  /** One-line Spanish blurb (also fed to the pitch generator for context). */
  blurb: string
}

export const SERVICES: Record<ServiceKey, Service> = {
  websites: {
    key: 'websites',
    name: 'Websites',
    url: `${SITE}/servicios/websites`,
    blurb: 'Sitios bilingües hechos a medida que reciben reservas, pedidos o matrículas.',
  },
  marca: {
    key: 'marca',
    name: 'Marca',
    url: `${SITE}/servicios/marca`,
    blurb: 'Identidad visual completa que la calle reconoce — sistema, no solo logo.',
  },
  care: {
    key: 'care',
    name: 'Care',
    url: `${SITE}/servicios/care`,
    blurb: 'Hosting, seguridad y atención humana mensual — alguien está mirando tu sitio.',
  },
  sereno: {
    key: 'sereno',
    name: 'Sereno',
    url: `${SITE}/servicios/sereno`,
    blurb: 'Brief semanal por WhatsApp con lo que hicieron tus competidores.',
  },
  garua: {
    key: 'garua',
    name: 'Garúa',
    url: `${SITE}/servicios/garua`,
    blurb: 'Marketing climático automático — campañas que se disparan con el cielo de Lima.',
  },
  espejo: {
    key: 'espejo',
    name: 'Espejo',
    url: `${SITE}/servicios/espejo`,
    blurb: 'Visita anónima trimestral con informe en 72 horas — el reverso de Sereno.',
  },
  socio: {
    key: 'socio',
    name: 'Socio',
    url: `${SITE}/servicios/socio`,
    blurb: 'Asistente de WhatsApp 24/7 entrenado con tu carta, horarios, política y voz.',
  },
  vitrina: {
    key: 'vitrina',
    name: 'Vitrina',
    url: `${SITE}/servicios/vitrina`,
    blurb: 'Tu Google Business Profile cuidado cada semana — donde el 70% te encuentran.',
  },
  demolicion: {
    key: 'demolicion',
    name: 'Demolición',
    url: `${SITE}/servicios/demolicion`,
    blurb: 'Tu web actual reescrita y relanzada en 24 horas — con IA, terminada a mano.',
  },
  apertura: {
    key: 'apertura',
    name: 'Apertura',
    url: `${SITE}/servicios/apertura`,
    blurb: 'El paquete completo para abrir un negocio en Lima — marca, web y Google en 10 días.',
  },
  memoria: {
    key: 'memoria',
    name: 'Memoria',
    url: `${SITE}/servicios/memoria`,
    blurb: 'El año de tu negocio impreso a mano — un libro de tapa dura, una sola edición.',
  },
  auditoria: {
    key: 'auditoria',
    name: 'Auditoría',
    url: SITE,
    blurb: 'Diagnóstico escrito de tu presencia digital — entregado en 48 horas.',
  },
}

/**
 * `potential` values that describe a LEVEL (High/Medium/Low) rather than a
 * service type. These get no service link / demo button.
 */
const LEVEL_WORDS = new Set([
  'high', 'medium', 'low', 'alta', 'media', 'baja', 'alto', 'medio', 'bajo',
  'n/a', 'na', 'none', 'tbd', '-', '—',
])

/**
 * Keyword rules, evaluated top-to-bottom; first match wins. Keywords are
 * matched as substrings against the diacritic-stripped, lower-cased potential.
 * More specific/brand services are listed before the generic `websites` catch.
 */
const RULES: Array<{ key: ServiceKey; match: string[] }> = [
  { key: 'marca', match: ['marca', 'brand', 'identity', 'identidad', 'logo', 'rebrand'] },
  { key: 'vitrina', match: ['google', 'gbp', 'business profile', 'maps', 'listing', 'ficha', 'vitrina'] },
  { key: 'socio', match: ['assistant', 'asistente', 'chatbot', 'socio', 'concierge', 'whatsapp bot'] },
  { key: 'sereno', match: ['competit', 'intelligence', 'inteligencia', 'monitor', 'sereno', 'vigilancia'] },
  { key: 'care', match: ['maintenance', 'mantenimiento', 'hosting', 'care', 'soporte', 'support', 'security', 'seguridad'] },
  { key: 'garua', match: ['marketing', 'campaign', 'campana', 'ads', 'publicidad', 'garua'] },
  { key: 'espejo', match: ['mystery', 'anonymous', 'anonim', 'espejo', 'secret shopper'] },
  { key: 'memoria', match: ['memoria', 'yearbook', 'libro', 'print', 'impres'] },
  { key: 'apertura', match: ['opening', 'apertura', 'new business', 'launch business', 'startup', 'nuevo negocio', 'grand opening'] },
  { key: 'demolicion', match: ['modern', 'relaunch', 'relanz', 'rewrite', 'reescrit', 'redesign', 'redise', 'revamp', 'rebuild', 'overhaul', 'refresh', 'migrat', 'demolic'] },
  { key: 'websites', match: ['web', 'website', 'site', 'sitio', 'portal', 'ux', 'catalog', 'ecommerce', 'commerce', 'tienda', 'store', 'landing', 'lead gen', 'leadgen', 'digital id', 'digital identity', 'presence', 'presencia', 'microsite', 'portfolio', 'one-pager', 'onepager', 'booking', 'reservas'] },
  { key: 'auditoria', match: ['audit', 'auditor', 'diagnos', 'assessment', 'evaluaci'] },
]

const deburr = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export interface MapOptions {
  /**
   * Whether the lead has an existing website. Disambiguates
   * "modernization/rewrite"-style potentials: Demolición only makes sense when
   * there is a current site to rewrite — otherwise it's a fresh Websites build.
   * Leave undefined when unknown (treated as "no confirmed site" → Websites).
   */
  hasSite?: boolean
}

/**
 * Resolve a `potential` to a service. Returns null for empty values or
 * level-words (High/Medium/Low), which should render as plain text. Any other
 * unrecognised text falls back to `websites` (the studio's flagship offer).
 */
export function mapPotentialToService(
  potential: string | null | undefined,
  opts: MapOptions = {},
): Service | null {
  const p = deburr(potential ?? '')
  if (!p) return null
  if (LEVEL_WORDS.has(p)) return null
  for (const rule of RULES) {
    if (rule.match.some((kw) => p.includes(kw))) {
      // "Modernize/rewrite an existing site" → Demolición only when we're
      // confident a site exists; otherwise build it fresh (Websites).
      if (rule.key === 'demolicion' && opts.hasSite !== true) return SERVICES.websites
      return SERVICES[rule.key]
    }
  }
  return SERVICES.websites
}

/**
 * A fuller, operator-facing description of what a given `potential` build type
 * actually delivers — shown under the crisp label in the digest / demo page.
 * Keyword-based (diacritic-insensitive); falls back to a generic line that
 * references the mapped service. English, to match the English build labels.
 * Returns '' for empty values and level-words (High/Medium/Low).
 */
const DESC_RULES: Array<{ match: string[]; text: string }> = [
  { match: ['brand', 'identity', 'identidad', 'logo', 'rebrand'], text: 'A complete visual identity — logo system, colour and type, not just a logo.' },
  { match: ['google', 'gbp', 'business profile', 'maps', 'ficha', 'vitrina'], text: 'A weekly-managed Google Business Profile so locals find them first.' },
  { match: ['assistant', 'asistente', 'chatbot', 'socio', 'concierge'], text: 'A 24/7 WhatsApp assistant trained on their menu, hours and voice.' },
  { match: ['competit', 'intelligence', 'inteligencia', 'monitor', 'sereno', 'vigilancia'], text: 'Weekly competitive intelligence delivered by WhatsApp.' },
  { match: ['maintenance', 'mantenimiento', 'hosting', 'care', 'soporte', 'support', 'security', 'seguridad'], text: 'Monthly hosting, security and human care for their site.' },
  { match: ['marketing', 'campaign', 'campana', 'ads', 'publicidad', 'garua'], text: 'Automated, weather-triggered marketing campaigns for Lima.' },
  { match: ['mystery', 'anonymous', 'anonim', 'espejo', 'secret shopper'], text: 'A quarterly anonymous mystery-visit with a 72-hour report.' },
  { match: ['memoria', 'yearbook', 'libro', 'print', 'impres'], text: 'Their business year, printed by hand as a single hardcover edition.' },
  { match: ['opening', 'apertura', 'new business', 'launch business', 'startup', 'nuevo negocio', 'grand opening'], text: 'The full launch pack to open a business — brand, web and Google in 10 days.' },
  { match: ['portal'], text: 'A client-facing web portal — logins, bookings, order status or payments in one place.' },
  { match: ['catalog'], text: 'A modern online catalog of what they sell — easy to browse and order.' },
  { match: ['portfolio', 'portafolio'], text: 'A polished one-page portfolio that showcases their work.' },
  { match: ['landing', 'lead gen', 'leadgen'], text: 'A focused landing page built to capture and convert leads.' },
  { match: ['ux'], text: 'A UX-led website rebuild focused on clean flows and conversion.' },
  { match: ['digital id', 'digital identity'], text: 'A complete digital presence — site, brand and Google working together.' },
  { match: ['modern', 'relaunch', 'relanz', 'rewrite', 'reescrit', 'redesign', 'redise', 'revamp', 'rebuild', 'overhaul', 'migrat', 'demolic'], text: 'Their existing site rewritten and relaunched — modern, fast, done in days.' },
  { match: ['web', 'website', 'site', 'sitio', 'microsite', 'ecommerce', 'commerce', 'tienda', 'store', 'booking', 'reservas', 'presence', 'presencia'], text: 'A complete bespoke website — bilingual and ready to take bookings or orders.' },
  { match: ['audit', 'auditor', 'diagnos', 'assessment', 'evaluaci'], text: 'A written diagnostic of their digital presence, delivered in 48 hours.' },
]

export function describePotential(potential: string | null | undefined): string {
  const p = deburr(potential ?? '')
  if (!p || LEVEL_WORDS.has(p)) return ''
  for (const rule of DESC_RULES) {
    if (rule.match.some((kw) => p.includes(kw))) return rule.text
  }
  const svc = mapPotentialToService(potential)
  return svc ? `A tailored ${svc.name} engagement, built around their business.` : ''
}
