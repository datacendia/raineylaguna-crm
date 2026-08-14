import type { Deal } from '../types'
import { meanLifetimeMonths } from './churn'
import { singleCurrency, sumDefined, type Cents } from './money'
import {
  belowMinimum,
  insufficient,
  MINIMUMS,
  noData,
  ok,
  type ModelResult,
} from './result'

/**
 * Lifetime value, CAC and payback.
 *
 * LTV is the figure most often quoted and least often earned. The arithmetic
 * is trivial; everything that makes it trustworthy is upstream of the
 * arithmetic, so this module refuses in more places than it computes.
 *
 * Two bases, never blended:
 *
 *   revenue      ARPA × lifetime. What the customer pays.
 *   contribution ARPA × lifetime × gross margin. What the business keeps.
 *
 * `contribution` needs a gross margin, which is a business input nobody has
 * supplied and which this module will not invent. Asked for contribution
 * without one, it refuses rather than defaulting to a plausible-looking 70%.
 * A margin assumption buried in code is indistinguishable from a measurement
 * by the time it reaches a slide.
 */

export type LtvBasis = 'revenue' | 'contribution'

export type LtvEstimate = {
  currency: string
  basis: LtvBasis
  valueCents: Cents
  /** Recurring revenue per account per month. */
  arpaCents: Cents
  meanLifetimeMonths: number
  /** Only set on the contribution basis. 0-1. */
  grossMargin?: number
  sampleSize: number
  /** Carried through from the lifetime estimate — this figure is a floor. */
  censoringWarning: string
}

export type LtvOptions = {
  basis?: LtvBasis
  /** 0-1. Required for the contribution basis; never defaulted. */
  grossMargin?: number
}

export function estimateLtv(
  deals: Deal[],
  options: LtvOptions = {},
): ModelResult<LtvEstimate> {
  const basis: LtvBasis = options.basis ?? 'revenue'

  if (basis === 'contribution') {
    const m = options.grossMargin
    if (typeof m !== 'number' || !Number.isFinite(m)) {
      return insufficient<LtvEstimate>({
        reason: 'missing_input',
        message:
          'Contribution LTV needs a gross margin, which has not been supplied. It is deliberately not defaulted — an assumed margin would be indistinguishable from a measured one downstream.',
        needed: [
          'A gross margin between 0 and 1, from actual delivery costs',
          'Or request the revenue basis, which needs no margin',
        ],
      })
    }
    if (m <= 0 || m > 1) {
      return insufficient<LtvEstimate>({
        reason: 'missing_input',
        message: `Gross margin must be between 0 and 1; received ${m}.`,
        needed: ['A gross margin expressed as a fraction, e.g. 0.65 for 65%'],
      })
    }
  }

  const won = deals.filter((d) => d.status === 'won' || d.status === 'churned')
  if (won.length === 0) {
    return noData<LtvEstimate>('won deal', [
      'Deals marked won with mrr_cents and contract_start',
      'Completed lifecycles (churned_at) before a lifetime can be observed',
    ])
  }
  if (won.length < MINIMUMS.ltv) {
    return belowMinimum<LtvEstimate>('won deals', won.length, MINIMUMS.ltv, [
      `${MINIMUMS.ltv - won.length} more won deals`,
      'Plus completed lifecycles, without which lifetime is unobservable',
    ])
  }

  const cur = singleCurrency(won)
  if (!cur.ok) return { ok: false, insufficient: cur.insufficient }

  // Lifetime is the hard input and owns its own refusals — including the
  // censoring caveat, which propagates rather than being quietly dropped.
  const lifetime = meanLifetimeMonths(deals)
  if (!lifetime.ok) return { ok: false, insufficient: lifetime.insufficient }

  const recurring = won.filter((d) => typeof d.mrr_cents === 'number')
  if (recurring.length === 0) {
    return insufficient<LtvEstimate>({
      reason: 'missing_input',
      message:
        'No won deal carries a recurring amount, so there is no per-month value to multiply by a lifetime. For one-off work, average contract value is the meaningful figure instead.',
      needed: ['mrr_cents on recurring deals'],
    })
  }

  const arpaCents = Math.round(
    sumDefined(recurring.map((d) => d.mrr_cents)) / recurring.length,
  )
  const gross = arpaCents * lifetime.value.observedMeanMonths
  const valueCents = Math.round(
    basis === 'contribution' ? gross * (options.grossMargin as number) : gross,
  )

  return ok({
    currency: cur.value,
    basis,
    valueCents,
    arpaCents,
    meanLifetimeMonths: lifetime.value.observedMeanMonths,
    ...(basis === 'contribution' ? { grossMargin: options.grossMargin } : {}),
    sampleSize: recurring.length,
    censoringWarning: lifetime.value.censoringWarning,
  })
}

export type CacEstimate = {
  currency: string
  cacCents: Cents
  sampleSize: number
  /** Won deals with no acquisition cost recorded, excluded from the mean. */
  excludedForMissingCost: number
}

/**
 * Customer acquisition cost, from costs actually recorded against deals.
 *
 * Only deals carrying an acquisition_cost_cents count. Treating a missing cost
 * as zero would drag CAC toward zero in exact proportion to how badly costs
 * were tracked, which makes the metric best-looking when the data is worst.
 */
export function estimateCac(deals: Deal[]): ModelResult<CacEstimate> {
  const won = deals.filter((d) => d.status === 'won' || d.status === 'churned')
  const withCost = won.filter((d) => typeof d.acquisition_cost_cents === 'number')

  if (withCost.length === 0) {
    return noData<CacEstimate>('deal with an acquisition cost', [
      'acquisition_cost_cents recorded against won deals',
    ])
  }
  if (withCost.length < MINIMUMS.cac) {
    return belowMinimum<CacEstimate>(
      'deals with an acquisition cost',
      withCost.length,
      MINIMUMS.cac,
      [`${MINIMUMS.cac - withCost.length} more won deals with acquisition_cost_cents`],
    )
  }

  const cur = singleCurrency(withCost)
  if (!cur.ok) return { ok: false, insufficient: cur.insufficient }

  return ok({
    currency: cur.value,
    cacCents: Math.round(
      sumDefined(withCost.map((d) => d.acquisition_cost_cents)) / withCost.length,
    ),
    sampleSize: withCost.length,
    excludedForMissingCost: won.length - withCost.length,
  })
}

export type UnitEconomics = {
  currency: string
  ltvCents: Cents
  cacCents: Cents
  /** LTV ÷ CAC. */
  ratio: number
  /** Months of ARPA needed to repay CAC. */
  paybackMonths: number
  basis: LtvBasis
}

/** LTV:CAC and payback. Refuses if either input refuses. */
export function unitEconomics(
  deals: Deal[],
  options: LtvOptions = {},
): ModelResult<UnitEconomics> {
  const ltv = estimateLtv(deals, options)
  if (!ltv.ok) return { ok: false, insufficient: ltv.insufficient }

  const cac = estimateCac(deals)
  if (!cac.ok) return { ok: false, insufficient: cac.insufficient }

  if (ltv.value.arpaCents <= 0) {
    return insufficient<UnitEconomics>({
      reason: 'below_minimum',
      message: 'Average recurring revenue is zero, so payback period is undefined.',
      needed: ['Non-zero mrr_cents on won deals'],
    })
  }

  return ok({
    currency: ltv.value.currency,
    ltvCents: ltv.value.valueCents,
    cacCents: cac.value.cacCents,
    ratio: cac.value.cacCents > 0 ? ltv.value.valueCents / cac.value.cacCents : Infinity,
    paybackMonths: cac.value.cacCents / ltv.value.arpaCents,
    basis: ltv.value.basis,
  })
}
