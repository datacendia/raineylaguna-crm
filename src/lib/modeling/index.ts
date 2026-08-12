import type { Deal, DealEvent } from '../types'
import { churnRates, meanLifetimeMonths } from './churn'
import { cohortRetention } from './cohort'
import {
  funnelShape,
  leadToCustomerRate,
  salesCycle,
  winRate,
  type StageCounts,
} from './funnel'
import { estimateCac, estimateLtv, unitEconomics, type LtvOptions } from './ltv'
import { averageContractValue, mrrMovement, revenueSnapshot } from './revenue'
import type { ModelResult } from './result'

export * from './result'
export * from './money'
export * from './revenue'
export * from './churn'
export * from './cohort'
export * from './ltv'
export * from './funnel'

/**
 * Every model, run over one dataset.
 *
 * Each entry is independently either a result or a refusal, so a caller can
 * render the funnel (which is computable today) alongside LTV (which is not)
 * without one blocking the other. Nothing here throws on missing data —
 * absence is a value, not an exception.
 */
export type ModelSuite = {
  revenue: ReturnType<typeof revenueSnapshot>
  mrrMovement: ReturnType<typeof mrrMovement>
  averageContractValue: ReturnType<typeof averageContractValue>
  churn: ReturnType<typeof churnRates>
  lifetime: ReturnType<typeof meanLifetimeMonths>
  cohorts: ReturnType<typeof cohortRetention>
  ltv: ReturnType<typeof estimateLtv>
  cac: ReturnType<typeof estimateCac>
  unitEconomics: ReturnType<typeof unitEconomics>
  funnel: ReturnType<typeof funnelShape>
  winRate: ReturnType<typeof winRate>
  salesCycle: ReturnType<typeof salesCycle>
  leadToCustomer: ReturnType<typeof leadToCustomerRate>
}

export type ModelSuiteInput = {
  deals: Deal[]
  events: DealEvent[]
  /** Leads per pipeline stage — counts, so callers aggregate in SQL. */
  stageCounts: StageCounts
  asOf?: Date
  /** Window for the churn rate. Defaults to the 12 months ending at asOf. */
  churnWindow?: { start: Date; end: Date }
  ltv?: LtvOptions
}

export function runModelSuite(input: ModelSuiteInput): ModelSuite {
  const { deals, events, stageCounts } = input
  const totalLeads = Object.values(stageCounts).reduce((a, b) => a + (b ?? 0), 0)
  const asOf = input.asOf ?? new Date()
  const window =
    input.churnWindow ??
    {
      start: new Date(
        Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), asOf.getUTCDate()),
      ),
      end: asOf,
    }

  return {
    revenue: revenueSnapshot(deals, asOf),
    mrrMovement: mrrMovement(events),
    averageContractValue: averageContractValue(deals),
    churn: churnRates(deals, window.start, window.end),
    lifetime: meanLifetimeMonths(deals),
    cohorts: cohortRetention(deals, asOf),
    ltv: estimateLtv(deals, input.ltv ?? {}),
    cac: estimateCac(deals),
    unitEconomics: unitEconomics(deals, input.ltv ?? {}),
    funnel: funnelShape(stageCounts),
    winRate: winRate(deals),
    salesCycle: salesCycle(deals),
    leadToCustomer: leadToCustomerRate(totalLeads, deals),
  }
}

/**
 * How much of the suite can actually answer.
 *
 * Surfacing this as a first-class number is the point: "3 of 13 models can
 * report" is the honest headline for this system today, and it improves
 * visibly as outcome data lands. It also stops a dashboard of thirteen empty
 * panels reading as a broken page rather than an empty dataset.
 */
export function suiteCoverage(suite: ModelSuite): {
  answerable: number
  total: number
  blocked: Array<{ model: string; reason: string; message: string }>
} {
  const entries = Object.entries(suite) as Array<[string, ModelResult<unknown>]>
  const blocked = entries
    .filter(([, r]) => !r.ok)
    .map(([model, r]) => ({
      model,
      reason: (r as { ok: false; insufficient: { reason: string } }).insufficient.reason,
      message: (r as { ok: false; insufficient: { message: string } }).insufficient
        .message,
    }))

  return { answerable: entries.length - blocked.length, total: entries.length, blocked }
}
