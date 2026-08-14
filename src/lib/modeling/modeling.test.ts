import { describe, it, expect } from 'vitest'
import type { Deal, DealEvent } from '../types'
import {
  averageContractValue,
  churnRates,
  cohortRetention,
  estimateCac,
  estimateLtv,
  funnelShape,
  leadToCustomerRate,
  meanLifetimeMonths,
  MINIMUMS,
  mrrMovement,
  revenueSnapshot,
  runModelSuite,
  salesCycle,
  suiteCoverage,
  unitEconomics,
  winRate,
} from './index'

/**
 * The central property under test is not the arithmetic — it is the refusal.
 *
 * Every model must decline to answer when the data cannot support an answer,
 * and must say what is missing. A model that quietly returns 0, NaN or an
 * assumption-derived figure is the failure mode this whole module exists to
 * prevent, so the empty and below-minimum paths are tested at least as hard as
 * the happy ones.
 */

const NOW = new Date('2026-08-12T00:00:00Z')

const deal = (o: Partial<Deal> = {}): Deal => ({
  id: `d_${Math.random().toString(36).slice(2)}`,
  lead_id: 'l_1',
  status: 'won',
  amount_cents: 320_000,
  mrr_cents: 20_000,
  currency: 'PEN',
  billing_period: 'monthly',
  contract_start: '2026-01-01',
  contract_end: null,
  opened_at: '2025-12-01T00:00:00Z',
  closed_at: '2026-01-01T00:00:00Z',
  churned_at: null,
  churn_reason: null,
  channel: null,
  acquisition_cost_cents: null,
  notes: null,
  created_at: '2025-12-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...o,
})

/** n won deals starting in the given month, optionally churning after k months. */
const cohortOf = (n: number, startMonth: string, churnAfter?: number): Deal[] =>
  Array.from({ length: n }, (_, i) => {
    const start = new Date(`${startMonth}-01T00:00:00Z`)
    const churned =
      churnAfter === undefined
        ? null
        : new Date(
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + churnAfter, 1),
          ).toISOString()
    return deal({
      id: `d_${startMonth}_${i}`,
      lead_id: `l_${startMonth}_${i}`,
      status: churned ? 'churned' : 'won',
      contract_start: `${startMonth}-01`,
      closed_at: start.toISOString(),
      churned_at: churned,
    })
  })

// ---------------------------------------------------------------------------
// The state the system is actually in today: nothing recorded
// ---------------------------------------------------------------------------

describe('every model with no data at all', () => {
  const suite = runModelSuite({
    deals: [],
    events: [],
    stageCounts: { Lead: 36_809 },
    asOf: NOW,
  })

  it('refuses rather than reporting zero', () => {
    for (const [name, result] of Object.entries(suite)) {
      // The funnel is the one thing genuinely computable from leads alone.
      if (name === 'funnel') continue
      expect(result.ok, `${name} should refuse`).toBe(false)
    }
  })

  it('names what is missing on every refusal', () => {
    for (const [name, result] of Object.entries(suite)) {
      if (result.ok) continue
      expect(result.insufficient.message, `${name} message`).not.toHaveLength(0)
      expect(result.insufficient.needed.length, `${name} needed`).toBeGreaterThan(0)
    }
  })

  it('reports coverage honestly', () => {
    const c = suiteCoverage(suite)
    expect(c.answerable).toBe(1)
    expect(c.total).toBe(13)
    expect(c.blocked).toHaveLength(12)
  })

  it('still describes the pipeline, and flags it as stalled', () => {
    expect(suite.funnel.ok).toBe(true)
    if (!suite.funnel.ok) return
    expect(suite.funnel.value.totalLeads).toBe(36_809)
    expect(suite.funnel.value.stalled).toBe(true)
  })

  it('refuses a conversion rate rather than reporting 0%', () => {
    // 0/36809 is arithmetically 0% but would read as a measured funnel
    // performance, when nothing has ever been tracked.
    expect(suite.leadToCustomer.ok).toBe(false)
    if (suite.leadToCustomer.ok) return
    expect(suite.leadToCustomer.insufficient.reason).toBe('no_data')
  })
})

// ---------------------------------------------------------------------------
// Refusals that are not simply "no rows"
// ---------------------------------------------------------------------------

describe('refusal cases', () => {
  it('refuses to mix currencies', () => {
    const deals = [
      ...cohortOf(15, '2026-01'),
      deal({ id: 'd_usd', currency: 'USD', lead_id: 'l_usd' }),
    ]
    const r = revenueSnapshot(deals, NOW)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.insufficient.reason).toBe('not_aggregatable')
    expect(r.insufficient.message).toContain('PEN')
    expect(r.insufficient.message).toContain('USD')
  })

  it('refuses contribution LTV without a gross margin rather than assuming one', () => {
    const deals = [...cohortOf(25, '2026-01'), ...cohortOf(25, '2025-06', 3)]
    const r = estimateLtv(deals, { basis: 'contribution' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.insufficient.reason).toBe('missing_input')
    expect(r.insufficient.message).toMatch(/gross margin/i)
  })

  it('rejects an out-of-range gross margin', () => {
    const deals = cohortOf(25, '2026-01')
    for (const grossMargin of [0, -0.5, 1.5, 70]) {
      const r = estimateLtv(deals, { basis: 'contribution', grossMargin })
      expect(r.ok, `margin ${grossMargin}`).toBe(false)
    }
  })

  it('reports progress toward the minimum instead of a bare refusal', () => {
    const r = winRate([deal({ status: 'won' }), deal({ status: 'lost' })])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.insufficient.reason).toBe('below_minimum')
    expect(r.insufficient.have).toBe(2)
    expect(r.insufficient.require).toBe(MINIMUMS.winRate)
  })

  it('refuses MRR when nothing recurs, rather than reporting zero', () => {
    const oneOff = Array.from({ length: 15 }, (_, i) =>
      deal({ id: `d${i}`, mrr_cents: null, billing_period: 'one_time' }),
    )
    const r = revenueSnapshot(oneOff, NOW)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.insufficient.reason).toBe('missing_input')
    // ...but the one-off value IS reportable, and is reported.
    const acv = averageContractValue(oneOff)
    expect(acv.ok).toBe(true)
  })

  it('excludes deals with no acquisition cost rather than counting them as free', () => {
    const deals = [
      ...Array.from({ length: 12 }, (_, i) =>
        deal({ id: `c${i}`, acquisition_cost_cents: 50_000 }),
      ),
      ...Array.from({ length: 8 }, (_, i) => deal({ id: `n${i}` })),
    ]
    const r = estimateCac(deals)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 50,000 exactly — not dragged toward zero by the 8 untracked deals.
    expect(r.value.cacCents).toBe(50_000)
    expect(r.value.sampleSize).toBe(12)
    expect(r.value.excludedForMissingCost).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// Arithmetic, once there is enough data
// ---------------------------------------------------------------------------

describe('revenue', () => {
  it('sums MRR over live customers only', () => {
    const deals = [
      ...cohortOf(10, '2026-01'),
      ...cohortOf(5, '2026-02', 1), // churned one month in — before asOf
    ]
    const r = revenueSnapshot(deals, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.activeCustomers).toBe(10)
    expect(r.value.mrrCents).toBe(200_000)
    expect(r.value.arrCents).toBe(2_400_000)
    expect(r.value.arpaCents).toBe(20_000)
  })

  it('excludes customers who had not yet closed as at the date asked about', () => {
    const r = revenueSnapshot(cohortOf(10, '2026-06'), new Date('2026-03-01T00:00:00Z'))
    // Nobody was live in March; the model says so rather than reporting 0 MRR.
    expect(r.ok).toBe(false)
  })

  it('splits MRR movement by kind', () => {
    const ev = (o: Partial<DealEvent>): DealEvent => ({
      id: `e_${Math.random()}`,
      deal_id: 'd_1',
      event_type: 'won',
      occurred_at: '2026-03-05T00:00:00Z',
      mrr_delta_cents: null,
      amount_cents: null,
      note: null,
      created_at: '2026-03-05T00:00:00Z',
      ...o,
    })
    const r = mrrMovement([
      ev({ event_type: 'won', mrr_delta_cents: 20_000 }),
      ev({ event_type: 'expanded', mrr_delta_cents: 5_000 }),
      ev({ event_type: 'contracted', mrr_delta_cents: -2_000 }),
      ev({ event_type: 'churned', mrr_delta_cents: -20_000 }),
      // A renewal moves no recurring revenue and must not land in net.
      ev({ event_type: 'renewed', mrr_delta_cents: 99_999 }),
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const m = r.value[0]
    expect(m.month).toBe('2026-03')
    expect(m.newCents).toBe(20_000)
    expect(m.expansionCents).toBe(5_000)
    expect(m.contractionCents).toBe(-2_000)
    expect(m.churnedCents).toBe(-20_000)
    expect(m.netCents).toBe(3_000)
  })
})

describe('churn', () => {
  it('computes logo and revenue churn separately', () => {
    const deals = [
      ...cohortOf(20, '2025-01'), // still live
      ...cohortOf(5, '2025-01', 13), // churn in Feb 2026, inside the window
    ]
    const r = churnRates(
      deals,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-12-31T00:00:00Z'),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.startingCustomers).toBe(25)
    expect(r.value.churnedCustomers).toBe(5)
    expect(r.value.logoChurnRate).toBeCloseTo(0.2)
    expect(r.value.grossRevenueChurnRate).toBeCloseTo(0.2)
  })

  it('does not divide by zero when the live base has no recurring revenue', () => {
    const deals = Array.from({ length: 25 }, (_, i) =>
      deal({ id: `d${i}`, mrr_cents: null, contract_start: '2025-01-01' }),
    )
    const r = churnRates(
      deals,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-12-31T00:00:00Z'),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Number.isNaN(r.value.grossRevenueChurnRate)).toBe(false)
    expect(r.value.grossRevenueChurnRate).toBe(0)
  })

  it('reports lifetime as a floor and says why', () => {
    const deals = [...cohortOf(25, '2025-01', 6), ...cohortOf(40, '2026-01')]
    const r = meanLifetimeMonths(deals)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.observedMeanMonths).toBe(6)
    expect(r.value.stillActive).toBe(40)
    expect(r.value.censoringWarning).toMatch(/floor/i)
  })
})

describe('cohorts', () => {
  const deals = [
    ...cohortOf(10, '2026-01'),
    ...cohortOf(10, '2026-02', 2),
    ...cohortOf(10, '2026-03'),
    ...cohortOf(2, '2026-04'), // below the minimum cohort size
  ]

  it('only reports periods that have actually elapsed', () => {
    const r = cohortRetention(deals, new Date('2026-04-15T00:00:00Z'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const jan = r.value.cohorts.find((c) => c.cohort === '2026-01')
    const mar = r.value.cohorts.find((c) => c.cohort === '2026-03')
    // January has had 3 months elapse; March only 1. March must NOT carry
    // zero-filled months 2 and 3 — that is the classic cohort-table lie.
    expect(jan?.periods.at(-1)?.period).toBe(3)
    expect(mar?.periods.at(-1)?.period).toBe(1)
  })

  it('suppresses cohorts too small to mean anything, and says it did', () => {
    const r = cohortRetention(deals, new Date('2026-06-01T00:00:00Z'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.cohorts.map((c) => c.cohort)).not.toContain('2026-04')
    expect(r.value.suppressedCohorts).toEqual([{ cohort: '2026-04', size: 2 }])
  })

  it('tracks retention decay within a cohort', () => {
    const r = cohortRetention(deals, new Date('2026-06-01T00:00:00Z'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const feb = r.value.cohorts.find((c) => c.cohort === '2026-02')
    expect(feb?.periods[0].retentionRate).toBe(1)
    expect(feb?.periods[2].retentionRate).toBe(0)
  })

  it('refuses when too few months exist for a curve to have a shape', () => {
    const r = cohortRetention(cohortOf(10, '2026-01'), NOW)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.insufficient.reason).toBe('insufficient_history')
  })
})

describe('LTV and unit economics', () => {
  const deals = [
    ...cohortOf(25, '2025-01', 10).map((d) => ({ ...d, acquisition_cost_cents: 40_000 })),
    ...cohortOf(25, '2026-01').map((d) => ({ ...d, acquisition_cost_cents: 40_000 })),
  ]

  it('computes revenue LTV as ARPA × observed lifetime', () => {
    const r = estimateLtv(deals)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.basis).toBe('revenue')
    expect(r.value.arpaCents).toBe(20_000)
    expect(r.value.meanLifetimeMonths).toBe(10)
    expect(r.value.valueCents).toBe(200_000)
  })

  it('applies gross margin only on the contribution basis', () => {
    const r = estimateLtv(deals, { basis: 'contribution', grossMargin: 0.6 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.basis).toBe('contribution')
    expect(r.value.grossMargin).toBe(0.6)
    expect(r.value.valueCents).toBe(120_000)
  })

  it('carries the censoring caveat through to LTV', () => {
    const r = estimateLtv(deals)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.censoringWarning).toMatch(/floor/i)
  })

  it('derives ratio and payback', () => {
    const r = unitEconomics(deals)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.ltvCents).toBe(200_000)
    expect(r.value.cacCents).toBe(40_000)
    expect(r.value.ratio).toBeCloseTo(5)
    expect(r.value.paybackMonths).toBeCloseTo(2)
  })

  it('propagates the upstream refusal when CAC is untracked', () => {
    const noCost = deals.map((d) => ({ ...d, acquisition_cost_cents: null }))
    const r = unitEconomics(noCost)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.insufficient.reason).toBe('no_data')
  })
})

describe('funnel', () => {
  it('computes stage conversion from reached counts', () => {
    const r = funnelShape({ Lead: 100, Contacted: 40, Audited: 20, Proposal: 10, Closed: 5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const byStage = Object.fromEntries(r.value.stages.map((s) => [s.stage, s]))
    expect(r.value.totalLeads).toBe(175)
    expect(byStage.Lead.conversionFromPrevious).toBeNull()
    // 75 of 175 got past Lead.
    expect(byStage.Contacted.conversionFromPrevious).toBeCloseTo(75 / 175)
    expect(r.value.stalled).toBe(false)
  })

  it('measures the sales cycle in months', () => {
    const deals = Array.from({ length: 12 }, (_, i) =>
      deal({
        id: `d${i}`,
        opened_at: '2026-01-01T00:00:00Z',
        closed_at: '2026-03-01T00:00:00Z',
      }),
    )
    const r = salesCycle(deals)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.meanMonths).toBe(2)
    expect(r.value.medianMonths).toBe(2)
  })

  it('counts a churned customer as won for win-rate purposes', () => {
    const deals = [
      ...Array.from({ length: 10 }, (_, i) => deal({ id: `w${i}`, status: 'won' })),
      ...Array.from({ length: 5 }, (_, i) =>
        deal({ id: `c${i}`, status: 'churned', churned_at: '2026-06-01T00:00:00Z' }),
      ),
      ...Array.from({ length: 5 }, (_, i) => deal({ id: `l${i}`, status: 'lost' })),
    ]
    const r = winRate(deals)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.wonDeals).toBe(15)
    expect(r.value.rate).toBeCloseTo(0.75)
  })

  it('reports a conversion rate once conversions exist', () => {
    const r = leadToCustomerRate(1_000, cohortOf(10, '2026-01'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.customers).toBe(10)
    expect(r.value.rate).toBeCloseTo(0.01)
  })
})
