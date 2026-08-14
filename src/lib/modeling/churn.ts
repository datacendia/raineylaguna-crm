import type { Deal } from '../types'
import { isActiveAt } from './revenue'
import { monthsBetween, singleCurrency, sumDefined, type Cents } from './money'
import {
  belowMinimum,
  insufficient,
  MINIMUMS,
  noData,
  ok,
  type ModelResult,
} from './result'

/**
 * Churn and retention.
 *
 * Two distinct measurements that are routinely conflated:
 *
 *   logo churn    what fraction of CUSTOMERS left
 *   revenue churn what fraction of RECURRING REVENUE left
 *
 * They diverge sharply in an SMB base like this one, where losing ten small
 * retainers and losing one large one are the same logo churn and very
 * different revenue churn. Both are reported; neither is presented as "churn"
 * unqualified.
 *
 * Net revenue retention is reported separately again, because it can exceed
 * 100% when expansion outruns churn, and collapsing it into a churn figure
 * hides the thing worth knowing.
 */

export type ChurnRates = {
  currency: string
  periodStart: string
  periodEnd: string
  /** Customers live at the start of the window. */
  startingCustomers: number
  churnedCustomers: number
  /** churnedCustomers / startingCustomers, 0-1. */
  logoChurnRate: number
  startingMrrCents: Cents
  churnedMrrCents: Cents
  /** churnedMrr / startingMrr, 0-1. Gross — ignores expansion. */
  grossRevenueChurnRate: number
}

/**
 * Churn over a window.
 *
 * Denominator is customers live at `periodStart`, not customers ever — the
 * "ever" denominator is the classic way to report a flatteringly low churn
 * rate that falls further the longer you operate.
 */
export function churnRates(
  deals: Deal[],
  periodStart: Date,
  periodEnd: Date,
): ModelResult<ChurnRates> {
  const everWon = deals.filter((d) => d.status === 'won' || d.status === 'churned')
  if (everWon.length === 0) {
    return noData<ChurnRates>('customer', [
      'Deals marked won, with closed_at set',
      'churned_at set when a customer leaves',
    ])
  }

  const cur = singleCurrency(everWon)
  if (!cur.ok) return { ok: false, insufficient: cur.insufficient }

  const starting = everWon.filter((d) => isActiveAt(d, periodStart))
  if (starting.length === 0) {
    return insufficient<ChurnRates>({
      reason: 'insufficient_history',
      message:
        'No customer was live at the start of this window, so there is no base to churn from.',
      needed: ['A window that begins after the first deal was won'],
    })
  }
  if (starting.length < MINIMUMS.churn) {
    return belowMinimum<ChurnRates>(
      'customers live at the start of the window',
      starting.length,
      MINIMUMS.churn,
      [
        `${MINIMUMS.churn - starting.length} more live customers before a churn rate is stable`,
      ],
    )
  }

  const churned = starting.filter(
    (d) =>
      d.churned_at &&
      new Date(d.churned_at) > periodStart &&
      new Date(d.churned_at) <= periodEnd,
  )

  const startingMrr = sumDefined(starting.map((d) => d.mrr_cents))
  const churnedMrr = sumDefined(churned.map((d) => d.mrr_cents))

  return ok({
    currency: cur.value,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    startingCustomers: starting.length,
    churnedCustomers: churned.length,
    logoChurnRate: churned.length / starting.length,
    startingMrrCents: startingMrr,
    churnedMrrCents: churnedMrr,
    // Guarded: a base of live customers whose recurring revenue is all null
    // would otherwise divide by zero and report NaN as a percentage.
    grossRevenueChurnRate: startingMrr > 0 ? churnedMrr / startingMrr : 0,
  })
}

export type LifetimeEstimate = {
  /** Mean observed months from contract start to churn, over churned deals. */
  observedMeanMonths: number
  /** Deals used. Only CHURNED ones — see the note below. */
  sampleSize: number
  /**
   * Customers still active, excluded from the mean above. Reported because
   * excluding them biases the estimate DOWNWARD: the long-lived customers are
   * precisely the ones that have not churned yet, so an average over completed
   * lifetimes only is a floor, not a centre. Stated rather than corrected —
   * correcting it properly needs survival analysis and more data than exists.
   */
  stillActive: number
  censoringWarning: string
}

/**
 * Mean observed customer lifetime in months.
 *
 * Deliberately NOT the usual `1 / churn_rate` shortcut. That identity assumes
 * a constant hazard rate — that a customer is as likely to leave in month 30
 * as in month 1 — which is false for practically every SMB service business,
 * where cancellations cluster early. With a handful of months of data it
 * produces figures like "47-month average lifetime" from a business that has
 * existed for one quarter.
 */
export function meanLifetimeMonths(deals: Deal[]): ModelResult<LifetimeEstimate> {
  const churned = deals.filter(
    (d) => d.status === 'churned' && d.churned_at && d.contract_start,
  )
  const active = deals.filter((d) => d.status === 'won')

  if (churned.length === 0) {
    return noData<LifetimeEstimate>('churned customer', [
      'At least one deal with status churned and both contract_start and churned_at set',
      `Realistically ${MINIMUMS.churn}+ before the mean is worth quoting`,
    ])
  }
  if (churned.length < MINIMUMS.churn) {
    return belowMinimum<LifetimeEstimate>(
      'churned customers',
      churned.length,
      MINIMUMS.churn,
      [
        `${MINIMUMS.churn - churned.length} more completed customer lifecycles`,
        'Expect 6-12 months of logged outcomes before a lifetime figure is stable',
      ],
    )
  }

  const months = churned.map((d) =>
    Math.max(0, monthsBetween(d.contract_start as string, d.churned_at as string)),
  )

  return ok({
    observedMeanMonths: months.reduce((a, b) => a + b, 0) / months.length,
    sampleSize: churned.length,
    stillActive: active.length,
    censoringWarning:
      `Mean is over completed lifetimes only; ${active.length} active customers are excluded ` +
      'and their eventual lifetimes will be longer than average, so this is a floor rather than a centre.',
  })
}
