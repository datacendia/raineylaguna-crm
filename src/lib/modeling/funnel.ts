import type { Deal, Lead, PipelineStage } from '../types'
import { STAGES } from '../types'
import { monthsBetween } from './money'
import { belowMinimum, insufficient, MINIMUMS, noData, ok, type ModelResult } from './result'

/**
 * Funnel: win rate, sales-cycle length, and stage-to-stage conversion.
 *
 * The pipeline distribution is computable today — it just says something
 * bleak. All 36,809 leads sit in `Lead` and none has ever reached Contacted,
 * so stage conversion is reported as a real measurement of zero movement,
 * which is different from refusing. Win rate needs closed deals and refuses
 * until they exist.
 */

export type StageDistribution = {
  stage: PipelineStage
  count: number
  /** Share of the whole base, 0-1. */
  share: number
  /** Share of the leads that reached the previous stage, 0-1. Null for the first. */
  conversionFromPrevious: number | null
}

export type FunnelShape = {
  totalLeads: number
  stages: StageDistribution[]
  /** True when every lead is in the first stage — no movement ever recorded. */
  stalled: boolean
}

/**
 * Leads per stage. Taken as counts rather than rows so callers can aggregate
 * in Postgres — materialising 36,809 objects merely to count them is what
 * /api/leads already does wrong.
 */
export type StageCounts = Partial<Record<PipelineStage, number>>

/** Count stages from actual rows, for callers that already hold them. */
export function countStages(leads: Pick<Lead, 'pipeline_stage'>[]): StageCounts {
  const counts: StageCounts = {}
  for (const l of leads) {
    counts[l.pipeline_stage] = (counts[l.pipeline_stage] ?? 0) + 1
  }
  return counts
}

/**
 * Current pipeline shape.
 *
 * Note this is a snapshot of where leads sit NOW, not a true funnel: a lead
 * that moved Lead → Contacted → Closed is counted only in Closed. Reading
 * these as conversion rates is sound only while the pipeline is append-only,
 * which it currently is because nothing has moved. Once stages start moving,
 * this wants replacing with a stage-transition log — the same reason deals got
 * an event table rather than only a status column.
 */
export function funnelShape(input: StageCounts): ModelResult<FunnelShape> {
  const counts = new Map<PipelineStage, number>()
  for (const s of STAGES) counts.set(s, input[s] ?? 0)

  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  if (total === 0) {
    return noData<FunnelShape>('lead', ['Leads in crm_leads'])
  }

  // Reached-stage counts: everyone in a later stage also passed through here.
  const reached = new Map<PipelineStage, number>()
  let running = 0
  for (let i = STAGES.length - 1; i >= 0; i--) {
    running += counts.get(STAGES[i]) ?? 0
    reached.set(STAGES[i], running)
  }

  const stages: StageDistribution[] = STAGES.map((stage, i) => {
    const prevReached = i === 0 ? null : (reached.get(STAGES[i - 1]) ?? 0)
    const thisReached = reached.get(stage) ?? 0
    return {
      stage,
      count: counts.get(stage) ?? 0,
      share: (counts.get(stage) ?? 0) / total,
      conversionFromPrevious:
        prevReached === null ? null : prevReached > 0 ? thisReached / prevReached : 0,
    }
  })

  return ok({
    totalLeads: total,
    stages,
    stalled: (counts.get(STAGES[0]) ?? 0) === total,
  })
}

export type WinRate = {
  closedDeals: number
  wonDeals: number
  /** won / (won + lost), 0-1. */
  rate: number
}

export function winRate(deals: Deal[]): ModelResult<WinRate> {
  // A churned deal was won first — excluding it would understate win rate by
  // punishing the business twice for the same customer.
  const won = deals.filter((d) => d.status === 'won' || d.status === 'churned')
  const lost = deals.filter((d) => d.status === 'lost')
  const closed = won.length + lost.length

  if (closed === 0) {
    return noData<WinRate>('closed deal', [
      'Deals marked won or lost, with closed_at set',
    ])
  }
  if (closed < MINIMUMS.winRate) {
    return belowMinimum<WinRate>('closed deals', closed, MINIMUMS.winRate, [
      `${MINIMUMS.winRate - closed} more deals reaching a won or lost outcome`,
    ])
  }

  return ok({ closedDeals: closed, wonDeals: won.length, rate: won.length / closed })
}

export type SalesCycle = {
  meanMonths: number
  medianMonths: number
  sampleSize: number
}

/** Time from deal opened to won. Lost deals are excluded — they never closed a sale. */
export function salesCycle(deals: Deal[]): ModelResult<SalesCycle> {
  const won = deals.filter(
    (d) => (d.status === 'won' || d.status === 'churned') && d.closed_at,
  )
  if (won.length === 0) {
    return noData<SalesCycle>('won deal with a close date', [
      'closed_at set on won deals',
    ])
  }
  if (won.length < MINIMUMS.arpa) {
    return belowMinimum<SalesCycle>('won deals', won.length, MINIMUMS.arpa, [
      `${MINIMUMS.arpa - won.length} more won deals with opened_at and closed_at`,
    ])
  }

  const spans = won
    .map((d) => Math.max(0, monthsBetween(d.opened_at, d.closed_at as string)))
    .sort((a, b) => a - b)

  const mid = Math.floor(spans.length / 2)
  return ok({
    meanMonths: spans.reduce((a, b) => a + b, 0) / spans.length,
    medianMonths:
      spans.length % 2 === 0 ? (spans[mid - 1] + spans[mid]) / 2 : spans[mid],
    sampleSize: spans.length,
  })
}

export type LeadToCustomerRate = {
  leads: number
  customers: number
  rate: number
}

/**
 * Overall lead → customer conversion.
 *
 * Refuses while zero conversions exist. A rate of 0/36,809 is arithmetically
 * 0% but reads as a measured conversion rate of zero, when the truth is that
 * conversion has never been tracked — no outreach event has ever been logged
 * and sereno_checked_at is null on every row.
 */
export function leadToCustomerRate(
  totalLeads: number,
  deals: Deal[],
): ModelResult<LeadToCustomerRate> {
  const customers = new Set(
    deals.filter((d) => d.status === 'won' || d.status === 'churned').map((d) => d.lead_id),
  ).size

  if (totalLeads === 0) return noData<LeadToCustomerRate>('lead', ['Leads in crm_leads'])
  if (customers === 0) {
    return insufficient<LeadToCustomerRate>({
      reason: 'no_data',
      message:
        'No lead has ever been recorded as converting, so a conversion rate would be measuring the absence of tracking rather than the performance of the funnel.',
      needed: [
        'At least one deal marked won and linked to a lead',
        'Outreach events logged, so the denominator means "leads actually worked" rather than "leads scraped"',
      ],
    })
  }

  return ok({ leads: totalLeads, customers, rate: customers / totalLeads })
}
