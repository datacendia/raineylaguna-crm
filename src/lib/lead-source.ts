/**
 * Canonical lead-source vocabulary (ROADMAP #13).
 *
 * One place that defines the channel buckets the dashboard groups / filters
 * on, plus a normaliser that maps the free-text `source` strings the various
 * ingestion paths write — the public site's 'audit-tool' / 'contacto-home' /
 * 'whatsapp' / '/proto', the discovery script's 'google_places', CSV imports,
 * legacy 'public-intake', … — into that set.
 *
 * Pure and client-safe (the leads dashboard imports it), no server deps.
 */

export const LEAD_SOURCES = [
  { value: 'audit', label: 'Audit tool' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'contact-form', label: 'Contact form' },
  { value: 'proto', label: '60-second site' },
  { value: 'discovery', label: 'Discovery (Places)' },
  { value: 'import', label: 'CSV import' },
  { value: 'referral', label: 'Referral' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]['value']

export const LEAD_SOURCE_VALUES: LeadSource[] = LEAD_SOURCES.map((s) => s.value)

const LABELS = Object.fromEntries(LEAD_SOURCES.map((s) => [s.value, s.label])) as Record<
  LeadSource,
  string
>

export function leadSourceLabel(value: LeadSource): string {
  return LABELS[value] ?? value
}

/**
 * Map an arbitrary stored / incoming source string to a canonical bucket.
 * Substring-matched (case-insensitive) so it is robust to label variants
 * ('audit-tool', 'website-audit-tool' → 'audit'). Unknown / empty → 'other'.
 *
 * NOTE: the backfill migration `2026-06-19-normalize-source.sql` encodes the
 * same mapping in SQL — keep the two in step.
 */
export function normalizeSource(raw: string | null | undefined): LeadSource {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return 'other'
  if (s.includes('audit')) return 'audit'
  if (s.includes('whatsapp') || s === 'wa') return 'whatsapp'
  if (s.includes('contact')) return 'contact-form' // matches 'contacto', 'contacto-home', 'contact'
  if (s.includes('proto')) return 'proto'
  if (s.includes('places') || s.includes('discover') || s.includes('google')) return 'discovery'
  if (s.includes('import') || s.includes('csv') || s.includes('bulk')) return 'import'
  if (s.includes('referr')) return 'referral'
  if (s.includes('event')) return 'event'
  return 'other'
}
