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

const NICHE_WEIGHTS: Record<string, number> = {
  'Beauty & Wellness': 25,
  Fitness: 24,
  Gastronomy: 22,
  'Professional Services': 18,
  'Industrial & Commercial': 14,
  Automotive: 12,
}

/** Returns 0-30 based on website state. The worse it is, the bigger the sale. */
function websitePoints(lead: Lead): number {
  // A real digital audit, when present, is a far more precise opportunity
  // signal than the free-text status — lower health = bigger sale.
  if (typeof lead.digital_health_score === 'number') {
    return Math.round(30 * (1 - lead.digital_health_score / 100))
  }
  const status = (lead.website_status ?? '').toLowerCase().trim()
  if (!lead.website_url || status === 'none' || status === 'no website' || status === 'sin web') return 30
  if (status.includes('broken') || status.includes('404') || status.includes('rota')) return 28
  if (status.includes('outdated') || status.includes('old') || status.includes('desactualiz')) return 22
  if (status.includes('basic') || status.includes('básic') || status.includes('weak')) return 16
  if (status.includes('decent') || status.includes('ok')) return 6
  if (status.includes('modern') || status.includes('strong')) return 2
  // Unknown state — assume mid.
  return 12
}

/** Returns 0-25; max if lead arrived in the last 7d, decays linearly to 0 at 60d. */
function recencyPoints(lead: Lead, now: Date): number {
  const created = new Date(lead.created_at).getTime()
  if (!Number.isFinite(created)) return 8
  const days = (now.getTime() - created) / (1000 * 60 * 60 * 24)
  if (days <= 7) return 25
  if (days >= 60) return 0
  // Linear decay between day 7 and day 60.
  return Math.round(25 * (1 - (days - 7) / 53))
}

function nichePoints(lead: Lead): number {
  return NICHE_WEIGHTS[lead.niche] ?? 12
}

function workabilityPoints(lead: Lead, now: Date): number {
  let pts = 0
  if (lead.phone) pts += 8
  if (lead.email) pts += 3
  // Stage progress — early-stage cold leads are most actionable for outreach
  if (lead.pipeline_stage === 'Lead') pts += 5
  else if (lead.pipeline_stage === 'Contacted') pts += 3
  // Snooze reduces workability to zero (it's literally "not now")
  if (lead.snoozed_until) {
    const until = new Date(lead.snoozed_until).getTime()
    if (until > now.getTime()) return 0
    // If the snooze just expired, surface it loudly.
    if (now.getTime() - until < 1000 * 60 * 60 * 48) pts += 4
  }
  return Math.min(20, pts)
}

function bandFor(score: number): ScoreBand {
  if (score >= 75) return 'Crítico'
  if (score >= 55) return 'Alto'
  if (score >= 35) return 'Medio'
  return 'Bajo'
}

export function computePriorityScore(lead: Lead, now: Date = new Date()): PriorityScore {
  const breakdown: PriorityBreakdown = {
    recency: recencyPoints(lead, now),
    website: websitePoints(lead),
    niche: nichePoints(lead),
    workability: workabilityPoints(lead, now),
  }
  const score = breakdown.recency + breakdown.website + breakdown.niche + breakdown.workability
  const band = bandFor(score)

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
