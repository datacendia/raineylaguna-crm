import type { Lead } from './types'

/**
 * Smart Prioritization Score — replaces the static High/Med/Low `potential`
 * field with a 0-100 composite signal computed from facts already on the
 * lead row. Higher = more urgent.
 *
 * Components (weights chosen by gut + Q1 outreach data; tune later):
 *   - Recency       (0-25)  : freshly-imported leads decay slowly over 60 days
 *   - Website gap   (0-30)  : the bigger the gap, the bigger the opportunity
 *   - Niche fit     (0-25)  : niches that historically convert well
 *   - Workability   (0-20)  : has phone? not snoozed? still in early stage?
 *
 * Pure function with no I/O — deterministic for a given Lead. Used by the
 * leads list (Score column + sort), the dashboard (top-N), and the digest.
 */
export type ScoreBand = 'Crítico' | 'Alto' | 'Medio' | 'Bajo'

export type PriorityBreakdown = {
  recency: number
  website: number
  niche: number
  workability: number
}

export type PriorityScore = {
  score: number
  band: ScoreBand
  breakdown: PriorityBreakdown
  /** Short, human-readable explanation for tooltips. */
  why: string
}

export type PriorityWeights = {
  recency: { max: number; freshDays: number; zeroDays: number; invalidFallback: number }
  website: { max: number }
  niche: { default: number; weights: Record<string, number> }
  workability: {
    phone: number
    email: number
    stageLead: number
    stageContacted: number
    snoozeExpiredBonus: number
    snoozeRecentHours: number
    max: number
  }
  bands: { critico: number; alto: number; medio: number }
}

/**
 * Default weights. Every magic number the score depends on lives here so the
 * model is tunable in one place and overridable per-environment via the
 * CRM_PRIORITY_WEIGHTS env var (a partial JSON object deep-merged over these).
 *
 * NOTE: CRM_PRIORITY_WEIGHTS is a server-only var, so server consumers (digest,
 * cron, APIs) honour overrides; the client leads list computes scores in the
 * browser and therefore always uses these defaults. Keep overrides modest to
 * avoid visible client/server drift, or promote the var to NEXT_PUBLIC_ if
 * exact parity is required.
 */
export const DEFAULT_WEIGHTS: PriorityWeights = {
  recency: { max: 25, freshDays: 7, zeroDays: 60, invalidFallback: 8 },
  website: { max: 30 },
  niche: {
    default: 12,
    weights: {
      'Beauty & Wellness': 25,
      Fitness: 24,
      Gastronomy: 22,
      'Professional Services': 18,
      'Industrial & Commercial': 14,
      Automotive: 12,
    },
  },
  workability: {
    phone: 8,
    email: 3,
    stageLead: 5,
    stageContacted: 3,
    snoozeExpiredBonus: 4,
    snoozeRecentHours: 48,
    max: 20,
  },
  bands: { critico: 75, alto: 55, medio: 35 },
}

function mergeWeights(base: PriorityWeights, o: any): PriorityWeights {
  if (!o || typeof o !== 'object') return base
  return {
    recency: { ...base.recency, ...(o.recency ?? {}) },
    website: { ...base.website, ...(o.website ?? {}) },
    niche: {
      default: o.niche?.default ?? base.niche.default,
      weights: { ...base.niche.weights, ...(o.niche?.weights ?? {}) },
    },
    workability: { ...base.workability, ...(o.workability ?? {}) },
    bands: { ...base.bands, ...(o.bands ?? {}) },
  }
}

let _weightsKey: string | undefined
let _weightsVal: PriorityWeights = DEFAULT_WEIGHTS

/**
 * Resolve the active weights. Reads CRM_PRIORITY_WEIGHTS lazily and memoises on
 * the raw string, so tests can mutate process.env between cases and a malformed
 * value degrades to defaults (with a single warning) rather than throwing.
 */
export function getPriorityWeights(): PriorityWeights {
  const raw = (typeof process !== 'undefined' ? process.env.CRM_PRIORITY_WEIGHTS : undefined) ?? ''
  if (raw === _weightsKey) return _weightsVal
  _weightsKey = raw
  if (!raw.trim()) {
    _weightsVal = DEFAULT_WEIGHTS
    return _weightsVal
  }
  try {
    _weightsVal = mergeWeights(DEFAULT_WEIGHTS, JSON.parse(raw))
  } catch {
    if (typeof console !== 'undefined') {
      console.warn('[priority-score] CRM_PRIORITY_WEIGHTS is not valid JSON; using defaults')
    }
    _weightsVal = DEFAULT_WEIGHTS
  }
  return _weightsVal
}

/** Returns 0..website.max based on website state. The worse it is, the bigger the sale. */
function websitePoints(lead: Lead, w: PriorityWeights): number {
  const max = w.website.max
  // Status constants are tuned against the default max of 30; scale them so a
  // custom website.max shifts the whole band proportionally.
  const scale = (base: number) => Math.round((base * max) / 30)
  // A real digital audit, when present, is a far more precise opportunity
  // signal than the free-text status — lower health = bigger sale.
  if (typeof lead.digital_health_score === 'number') {
    return Math.round(max * (1 - lead.digital_health_score / 100))
  }
  const status = (lead.website_status ?? '').toLowerCase().trim()
  if (!lead.website_url || status === 'none' || status === 'no website' || status === 'sin web') return max
  if (status.includes('broken') || status.includes('404') || status.includes('rota')) return scale(28)
  if (status.includes('outdated') || status.includes('old') || status.includes('desactualiz')) return scale(22)
  if (status.includes('basic') || status.includes('básic') || status.includes('weak')) return scale(16)
  if (status.includes('decent') || status.includes('ok')) return scale(6)
  if (status.includes('modern') || status.includes('strong')) return scale(2)
  // Unknown state — assume mid.
  return scale(12)
}

/** Returns 0..recency.max; max if fresh, decays linearly to 0 at zeroDays. */
function recencyPoints(lead: Lead, now: Date, w: PriorityWeights): number {
  const { max, freshDays, zeroDays, invalidFallback } = w.recency
  const created = new Date(lead.created_at).getTime()
  if (!Number.isFinite(created)) return invalidFallback
  const days = (now.getTime() - created) / (1000 * 60 * 60 * 24)
  if (days <= freshDays) return max
  if (days >= zeroDays) return 0
  // Linear decay between freshDays and zeroDays.
  return Math.round(max * (1 - (days - freshDays) / (zeroDays - freshDays)))
}

function nichePoints(lead: Lead, w: PriorityWeights): number {
  return w.niche.weights[lead.niche] ?? w.niche.default
}

function workabilityPoints(lead: Lead, now: Date, w: PriorityWeights): number {
  const wk = w.workability
  let pts = 0
  if (lead.phone) pts += wk.phone
  if (lead.email) pts += wk.email
  // Stage progress — early-stage cold leads are most actionable for outreach
  if (lead.pipeline_stage === 'Lead') pts += wk.stageLead
  else if (lead.pipeline_stage === 'Contacted') pts += wk.stageContacted
  // Snooze reduces workability to zero (it's literally "not now")
  if (lead.snoozed_until) {
    const until = new Date(lead.snoozed_until).getTime()
    if (until > now.getTime()) return 0
    // If the snooze just expired, surface it loudly.
    if (now.getTime() - until < 1000 * 60 * 60 * wk.snoozeRecentHours) pts += wk.snoozeExpiredBonus
  }
  return Math.min(wk.max, pts)
}

function bandFor(score: number, w: PriorityWeights): ScoreBand {
  if (score >= w.bands.critico) return 'Crítico'
  if (score >= w.bands.alto) return 'Alto'
  if (score >= w.bands.medio) return 'Medio'
  return 'Bajo'
}

export function computePriorityScore(lead: Lead, now: Date = new Date()): PriorityScore {
  const w = getPriorityWeights()
  const breakdown: PriorityBreakdown = {
    recency: recencyPoints(lead, now, w),
    website: websitePoints(lead, w),
    niche: nichePoints(lead, w),
    workability: workabilityPoints(lead, now, w),
  }
  const score = breakdown.recency + breakdown.website + breakdown.niche + breakdown.workability
  const band = bandFor(score, w)

  // Build a short "why" line tuned for hover tooltips on the leads list.
  const reasons: string[] = []
  if (breakdown.website >= 25) reasons.push('sin web o web rota')
  else if (breakdown.website >= 15) reasons.push('web débil')
  if (breakdown.recency >= 20) reasons.push('lead reciente')
  else if (breakdown.recency <= 5) reasons.push('lead frío')
  if (breakdown.niche >= 22) reasons.push('nicho con alta conversión')
  if (breakdown.workability === 0) reasons.push('en snooze')
  else if (breakdown.workability >= 12) reasons.push('contactable')
  const why = reasons.length ? reasons.join(' · ') : 'señales mixtas'

  return { score, band, breakdown, why }
}

/** Color token for the score badge — kept here so UI stays consistent across pages. */
export function bandColor(band: ScoreBand): { bg: string; text: string } {
  switch (band) {
    case 'Crítico':
      return { bg: 'bg-red-100', text: 'text-red-800' }
    case 'Alto':
      return { bg: 'bg-amber-100', text: 'text-amber-900' }
    case 'Medio':
      return { bg: 'bg-blue-100', text: 'text-blue-800' }
    case 'Bajo':
      return { bg: 'bg-gray-100', text: 'text-gray-600' }
  }
}
