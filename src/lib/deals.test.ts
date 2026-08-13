import { describe, it, expect } from 'vitest'
import { eventForTransition, mrrDeltaFor, validateDeal } from './deals'

/**
 * The write path exists to make the value models answerable, so the rules
 * under test are the ones the models depend on: a dated outcome for every
 * closed deal, and a lifecycle event for every state change.
 */

describe('validateDeal', () => {
  it('requires a close date on a won or lost deal', () => {
    for (const status of ['won', 'lost']) {
      const errors = validateDeal({ status })
      expect(errors.map((e) => e.field)).toContain('closed_at')
    }
  })

  it('requires a churn date on a churned deal', () => {
    const errors = validateDeal({ status: 'churned' })
    expect(errors.map((e) => e.field)).toContain('churned_at')
  })

  it('accepts a properly dated outcome', () => {
    expect(
      validateDeal({ status: 'won', closed_at: '2026-01-15T00:00:00Z' }),
    ).toHaveLength(0)
  })

  it('rejects negative and fractional money', () => {
    expect(validateDeal({ amount_cents: -1 }).map((e) => e.field)).toContain('amount_cents')
    expect(validateDeal({ mrr_cents: 12.5 }).map((e) => e.field)).toContain('mrr_cents')
  })

  it('rejects an inverted contract term', () => {
    const errors = validateDeal({
      contract_start: '2026-06-01',
      contract_end: '2026-01-01',
    })
    expect(errors.map((e) => e.field)).toContain('contract_end')
  })

  it('rejects an unknown status, billing period or currency', () => {
    expect(validateDeal({ status: 'maybe' }).map((e) => e.field)).toContain('status')
    expect(validateDeal({ billing_period: 'weekly' }).map((e) => e.field)).toContain(
      'billing_period',
    )
    expect(validateDeal({ currency: 'soles' }).map((e) => e.field)).toContain('currency')
  })

  it('only requires a lead on create', () => {
    expect(validateDeal({}, { requireLead: true }).map((e) => e.field)).toContain('lead_id')
    expect(validateDeal({}).map((e) => e.field)).not.toContain('lead_id')
  })
})

describe('eventForTransition', () => {
  it('derives the event from the transition', () => {
    expect(eventForTransition(null, 'open')).toBe('opened')
    expect(eventForTransition('open', 'won')).toBe('won')
    expect(eventForTransition('open', 'lost')).toBe('lost')
    expect(eventForTransition('won', 'churned')).toBe('churned')
  })

  it('treats a returning customer as a reactivation, not a new win', () => {
    // Counting this as 'won' would inflate new business and hide the fact that
    // the same customer churned first.
    expect(eventForTransition('churned', 'won')).toBe('reactivated')
    expect(eventForTransition('lost', 'open')).toBe('reactivated')
  })

  it('emits nothing when the status did not change', () => {
    // Correcting a typo must not manufacture a lifecycle event.
    expect(eventForTransition('won', 'won')).toBeNull()
  })
})

describe('mrrDeltaFor', () => {
  it('books the full recurring value on a win', () => {
    expect(mrrDeltaFor('won', null, 20_000)).toBe(20_000)
  })

  it('removes the whole recurring value on churn', () => {
    expect(mrrDeltaFor('churned', 20_000, 0)).toBe(-20_000)
  })

  it('books only the difference on expansion and contraction', () => {
    expect(mrrDeltaFor('expanded', 20_000, 25_000)).toBe(5_000)
    expect(mrrDeltaFor('contracted', 20_000, 15_000)).toBe(-5_000)
  })

  it('returns null, not zero, where no recurring revenue moves', () => {
    // A phantom zero would plot as a real data point on a movement chart.
    expect(mrrDeltaFor('lost', null, null)).toBeNull()
    expect(mrrDeltaFor('opened', null, 20_000)).toBeNull()
    expect(mrrDeltaFor('renewed', 20_000, 20_000)).toBeNull()
  })

  it('does not book a churn for a deal that never had recurring revenue', () => {
    expect(mrrDeltaFor('churned', null, null)).toBeNull()
  })
})
