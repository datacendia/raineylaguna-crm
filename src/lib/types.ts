import type { ManualAudit } from './audit-workbench'

export type Lead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string | null
  /** Market/city this lead belongs to (markets.ts). Backfilled to 'Lima'. */
  city: string
  district: string
  niche: string
  category: string | null
  instagram_active: boolean | null
  instagram_url: string | null
  facebook_url: string | null
  linkedin_url: string | null
  tiktok_url: string | null
  google_place_id: string | null
  address: string | null
  website_url: string | null
  website_status: string | null
  digital_health_score: number | null
  audit_findings: AuditFindings | null
  audited_at: string | null
  /** Whether digital_health_score is a measurement or a placeholder standing
   *  in for one. Optional: undefined on rows predating the migration. */
  audit_status?: AuditStatus | null
  audit_confidence?: AuditConfidence | null
  manual_audit: ManualAudit | null
  manual_audit_score: number | null
  manual_audited_at: string | null
  evaluation: string | null
  strategic_action: string | null
  potential: string | null
  /** Flagged by the franchise-detection migration: corporate/chain storefront
   * (OXXO, Tambo, …) or placeholder row. Not sellable as a boutique build, so
   * the priority score crushes it and the dashboard excludes it from the
   * addressable count. Optional: undefined on rows predating the migration. */
  is_chain?: boolean | null
  /** What linked this row to a chain — `phone:…`, `email:…`, `brand:…`, or
   * `placeholder`. Lets the operator audit the franchise grouping. */
  chain_key?: string | null
  pipeline_stage: PipelineStage
  notes: string | null
  next_action: string | null
  snoozed_until: string | null
  sereno_customer: boolean
  sereno_checked_at: string | null
  /** Persisted priority score. Optional: undefined on rows predating the
   *  migration, null until the scorer has run. */
  priority_score?: number | null
  priority_band?: ScoreBand | null
  priority_breakdown?: PersistedPriorityBreakdown | null
  priority_weights_version?: string | null
  priority_scored_at?: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Priority band. Defined here rather than in priority-score.ts because Lead
 * now carries a persisted band, and priority-score.ts already imports Lead —
 * owning it there would make the cycle a real one. priority-score.ts
 * re-exports it so existing importers are unaffected.
 */
export type ScoreBand = 'Crítico' | 'Alto' | 'Medio' | 'Bajo'

/** Shape written to crm_leads.priority_breakdown. */
export type PersistedPriorityBreakdown = {
  recency: number
  website: number
  niche: number
  workability: number
  base: number
  geoFactor: number
}

// ---------------------------------------------------------------------------
// Commercial outcomes
// ---------------------------------------------------------------------------

export type DealStatus = 'open' | 'won' | 'lost' | 'churned'
export type BillingPeriod = 'one_time' | 'monthly' | 'annual'

/**
 * A commercial relationship with a lead. Mirrors crm_deals.
 *
 * All money is in MINOR units (cents) — never float. `mrr_cents` is normalised
 * to a monthly figure whatever the billing period, so MRR is a straight sum.
 * `currency` is per-row because the base spans six cities across four
 * currencies; the models refuse to aggregate across them rather than quietly
 * adding soles to dollars.
 */
export type Deal = {
  id: string
  lead_id: string
  status: DealStatus
  amount_cents: number | null
  mrr_cents: number | null
  currency: string
  billing_period: BillingPeriod
  /** Cohort key: the month a paying relationship began. */
  contract_start: string | null
  contract_end: string | null
  opened_at: string
  closed_at: string | null
  churned_at: string | null
  churn_reason: string | null
  channel: string | null
  acquisition_cost_cents: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type DealEventType =
  | 'opened'
  | 'won'
  | 'lost'
  | 'renewed'
  | 'expanded'
  | 'contracted'
  | 'churned'
  | 'reactivated'

/**
 * Append-only lifecycle record. Mirrors crm_deal_events.
 *
 * `occurred_at` is when it happened in the world, which for backfilled history
 * is nothing like `created_at`. Every time-shaped model reads occurred_at.
 * Summing `mrr_delta_cents` in occurred_at order reconstructs MRR at any past
 * date, which is what makes net revenue retention computable at all.
 */
export type DealEvent = {
  id: string
  deal_id: string
  event_type: DealEventType
  occurred_at: string
  mrr_delta_cents: number | null
  amount_cents: number | null
  note: string | null
  created_at: string
}

export type OutreachEvent = {
  id: string
  lead_id: string
  channel: 'Email' | 'Instagram DM' | 'WhatsApp' | 'LinkedIn'
  status: string
  scheduled_for: string | null
  sent_at: string | null
  notes: string | null
  provider_message_id: string | null
  delivered_at: string | null
  read_at: string | null
  replied_at: string | null
  failed_reason: string | null
  draft_id: string | null
  created_at: string
  updated_at: string
}

export type OutreachDraft = {
  id: string
  lead_id: string
  channel: 'WhatsApp' | 'Email' | 'Instagram DM' | 'LinkedIn'
  body: string
  model: string | null
  prompt_version: string | null
  status: 'pending' | 'sent' | 'discarded'
  generated_at: string
  acted_at: string | null
  acted_by: string | null
}

export type VideoAudit = {
  id: string
  lead_id: string
  loom_url: string | null
  conversion_status: string
  created_at: string
  updated_at: string
}

/**
 * Which world an audit landed in.
 *
 * This exists because `digital_health_score` alone cannot distinguish "we
 * measured this site and it is bad" from "we never managed to measure it".
 * computeHealth returns 10 for unreachable and 15 for social-only, and the
 * priority model reads both as near-maximum opportunity — so a crawler timeout
 * outranks a genuinely dreadful measured site. A status is the honest way to
 * say a measurement is absent; a number is not.
 *
 * `unreachable` deliberately does NOT mean "the site is down". From the
 * crawler's position a bot block, a rate limit and a dead host are
 * indistinguishable, and treating them as the same thing is what produces
 * outreach claiming a live site did not load.
 */
export type AuditStatus =
  | 'measured'
  | 'unreachable'
  | 'social_only'
  | 'no_website'
  | 'not_audited'

/** What the score actually rests on. 67% of audited rows are heuristics-only. */
export type AuditConfidence = 'pagespeed' | 'heuristics' | 'none'

export type AuditFlagSeverity = 'high' | 'medium' | 'low'

export type AuditFlag = {
  id: string
  label: string
  severity: AuditFlagSeverity
}

export type AuditScores = {
  performance: number | null
  seo: number | null
  accessibility: number | null
  bestPractices: number | null
}

export type AuditMetrics = {
  lcpMs: number | null
}

/**
 * Result of a digital-presence audit for one lead. Stored as jsonb in
 * crm_leads.audit_findings; `score` is mirrored to digital_health_score.
 */
export type AuditFindings = {
  score: number
  /** Whether `score` is a measurement at all — see AuditStatus. Optional
   *  because rows audited before this existed have no status recorded; the
   *  migration backfills the column, not the historic jsonb. */
  status?: AuditStatus
  confidence?: AuditConfidence
  hadSite: boolean
  reachable: boolean
  scores: AuditScores
  metrics: AuditMetrics
  flags: AuditFlag[]
  summary: string
  /** Provenance for audits that arrived via the public site's audit tool
   *  (POST /api/leads/public) rather than a CRM-run audit. Undefined on
   *  CRM-run audits. `reportUrl` deep-links to the exact /auditoria/r/<id>
   *  report the prospect saw. */
  source?: string
  runId?: string | null
  reportUrl?: string | null
}

export const DISTRICTS = [
  'Ancón', 'Ate', 'Barranco', 'Breña', 'Carabayllo', 'Chaclacayo', 'Chorrillos',
  'Cieneguilla', 'Comas', 'El Agustino', 'Independencia', 'Jesús María', 'La Molina',
  'La Victoria', 'Lima Cercado', 'Lince', 'Los Olivos', 'Lurigancho', 'Lurín',
  'Magdalena del Mar', 'Miraflores', 'Pachacámac', 'Pucusana', 'Pueblo Libre',
  'Puente Piedra', 'Punta Hermosa', 'Punta Negra', 'Rímac', 'San Bartolo', 'San Borja',
  'San Isidro', 'San Juan de Lurigancho', 'San Juan de Miraflores', 'San Luis',
  'San Martín de Porres', 'San Miguel', 'Santa Anita', 'Santa María del Mar',
  'Santa Rosa', 'Santiago de Surco', 'Surquillo', 'Villa El Salvador',
  'Villa María del Triunfo',
] as const

export const NICHES = [
  'Gastronomy',
  'Professional Services',
  'Beauty & Wellness',
  'Automotive',
  'Fitness',
  'Industrial & Commercial',
] as const

export const STAGES = ['Lead', 'Contacted', 'Audited', 'Proposal', 'Closed'] as const

/**
 * Pipeline stage union derived from STAGES so the two stay in sync.
 * Use this type anywhere a pipeline stage is passed around (form state,
 * drag-and-drop handlers, API payloads) to avoid `string`-based casts.
 */
export type PipelineStage = (typeof STAGES)[number]

export const CHANNELS = ['Email', 'Instagram DM', 'WhatsApp', 'LinkedIn'] as const
