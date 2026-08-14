import type { Deal } from '../types'
import { monthKey, monthsBetween, singleCurrency, sumDefined, type Cents } from './money'
import { insufficient, MINIMUMS, noData, ok, type ModelResult } from './result'

/**
 * Cohort retention.
 *
 * Customers are grouped by the month their contract started, then followed
 * forward: of the deals that began in June, how many were still paying in
 * month 1, month 2, month 3? This is the only view that separates "churn got
 * worse" from "we sold to a worse cohort", and the two call for opposite
 * responses.
 *
 * Two rules make the output honest, and both cost rows:
 *
 *   1. A cohort is only reported for periods that have actually elapsed. A
 *      cohort three months old has no month-6 number, and rendering one as 0%
 *      (or as a gap the eye reads as a drop) is the most common way cohort
 *      tables lie.
 *   2. Cohorts below a minimum size are withheld. In a base this small a
 *      2-customer cohort produces 0%/50%/100% steps that look like signal.
 */

export type CohortPeriod = {
  /** Months since contract start. 0 is the starting month. */
  period: number
  retainedCustomers: number
  retentionRate: number
  retainedMrrCents: Cents
  /** Retained MRR ÷ starting MRR. Can exceed 1 when accounts expand. */
  netRevenueRetention: number
}

export type Cohort = {
  /** `YYYY-MM` of contract start. */
  cohort: string
  startingCustomers: number
  startingMrrCents: Cents
  /** Only periods that have fully elapsed for this cohort. */
  periods: CohortPeriod[]
}

export type CohortTable = {
  currency: string
  asOf: string
  cohorts: Cohort[]
  /** Cohorts suppressed for being below MINIMUMS.cohortSize, for transparency. */
  suppressedCohorts: Array<{ cohort: string; size: number }>
}

/** Was this deal still paying `period` months after its cohort month began? */
function retainedAt(deal: Deal, cohortStart: Date, period: number): boolean {
  const at = new Date(
    Date.UTC(cohortStart.getUTCFullYear(), cohortStart.getUTCMonth() + period, 1),
  )
  if (deal.churned_at && new Date(deal.churned_at) <= at) return false
  return true
}

export function cohortRetention(
  deals: Deal[],
  asOf: Date = new Date(),
): ModelResult<CohortTable> {
  const started = deals.filter(
    (d) => (d.status === 'won' || d.status === 'churned') && d.contract_start,
  )
  if (started.length === 0) {
    return noData<CohortTable>('customer with a contract start date', [
      'contract_start set on won deals — it is the cohort key',
      'churned_at set when a customer leaves',
    ])
  }

  const cur = singleCurrency(started)
  if (!cur.ok) return { ok: false, insufficient: cur.insufficient }

  const groups = new Map<string, Deal[]>()
  for (const d of started) {
    const key = monthKey(d.contract_start as string)
    const list = groups.get(key)
    if (list) list.push(d)
    else groups.set(key, [d])
  }

  if (groups.size < MINIMUMS.cohortMonths) {
    return insufficient<CohortTable>({
      reason: 'insufficient_history',
      message: `Only ${groups.size} monthly cohort${groups.size === 1 ? '' : 's'} exist; ${MINIMUMS.cohortMonths} are needed before a retention curve has a shape.`,
      needed: [
        `${MINIMUMS.cohortMonths - groups.size} more months with at least one contract start`,
      ],
      have: groups.size,
      require: MINIMUMS.cohortMonths,
    })
  }

  const cohorts: Cohort[] = []
  const suppressedCohorts: Array<{ cohort: string; size: number }> = []

  for (const [key, members] of [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (members.length < MINIMUMS.cohortSize) {
      suppressedCohorts.push({ cohort: key, size: members.length })
      continue
    }

    const cohortStart = new Date(`${key}-01T00:00:00.000Z`)
    // Only periods fully elapsed as of `asOf`. This is rule 1 above.
    const elapsed = Math.max(0, monthsBetween(cohortStart, asOf))
    const startingMrr = sumDefined(members.map((d) => d.mrr_cents))

    const periods: CohortPeriod[] = []
    for (let p = 0; p <= elapsed; p++) {
      const retained = members.filter((d) => retainedAt(d, cohortStart, p))
      const retainedMrr = sumDefined(retained.map((d) => d.mrr_cents))
      periods.push({
        period: p,
        retainedCustomers: retained.length,
        retentionRate: retained.length / members.length,
        retainedMrrCents: retainedMrr,
        netRevenueRetention: startingMrr > 0 ? retainedMrr / startingMrr : 0,
      })
    }

    cohorts.push({
      cohort: key,
      startingCustomers: members.length,
      startingMrrCents: startingMrr,
      periods,
    })
  }

  if (cohorts.length === 0) {
    return insufficient<CohortTable>({
      reason: 'below_minimum',
      message: `Every cohort has fewer than ${MINIMUMS.cohortSize} customers, which is too few for a retention rate to mean anything.`,
      needed: [`Cohorts of at least ${MINIMUMS.cohortSize} customers`],
      have: Math.max(...[...groups.values()].map((g) => g.length)),
      require: MINIMUMS.cohortSize,
    })
  }

  return ok({
    currency: cur.value,
    asOf: asOf.toISOString(),
    cohorts,
    suppressedCohorts,
  })
}
