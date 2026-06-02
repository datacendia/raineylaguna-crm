import { describe, it, expect } from 'vitest'
import {
  PROFILES,
  bandFor,
  applicable,
  dimScore,
  computeOverall,
  defaultWeights,
  type ItemRecord,
  type WorkbenchItem,
} from './audit-workbench'

const item = (over: Partial<WorkbenchItem> = {}): WorkbenchItem => ({
  id: 'x',
  title: 't',
  desc: 'd',
  tool: 'm',
  verify: 'v',
  level: 'core',
  ...over,
})

describe('bandFor', () => {
  it('maps scores to bands', () => {
    expect(bandFor(null).key).toBe('na')
    expect(bandFor(90).key).toBe('excellent')
    expect(bandFor(70).key).toBe('solid')
    expect(bandFor(55).key).toBe('needs')
    expect(bandFor(40).key).toBe('weak')
    expect(bandFor(10).key).toBe('critical')
  })
})

describe('applicable', () => {
  it('hides tagged items when the profile is not relevant', () => {
    const local = item({ tags: ['local'] })
    expect(applicable(local, 'local', false, false)).toBe(true)
    expect(applicable(local, 'ecom', false, false)).toBe(false)
  })
  it('untagged items always apply', () => {
    expect(applicable(item(), 'brand', false, false)).toBe(true)
  })
  it('presence-only hides live-site checks; essentials hides advanced', () => {
    expect(applicable(item({ web: false }), 'universal', true, false)).toBe(true)
    expect(applicable(item(), 'universal', true, false)).toBe(false)
    expect(applicable(item({ level: 'advanced' }), 'universal', false, true)).toBe(false)
  })
})

describe('dimScore', () => {
  it('averages scored lines rescaled to 100, ignoring na/unscored', () => {
    const dim = { id: 'find' as const, name: 'F', items: [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })] }
    const items: Record<string, ItemRecord> = {
      a: { state: 4, note: '' },
      b: { state: 2, note: '' },
      c: { state: 'na', note: '' },
    }
    // mean(4,2) = 3 -> 3/4*100 = 75
    expect(dimScore(dim, items)).toBe(75)
  })
  it('returns null when nothing is scored', () => {
    const dim = { id: 'ux' as const, name: 'U', items: [item({ id: 'a' })] }
    expect(dimScore(dim, { a: { state: null, note: '' } })).toBeNull()
  })
})

describe('computeOverall', () => {
  it('weights dimension scores and counts scored lines', () => {
    const items: Record<string, ItemRecord> = {
      'find-index': { state: 4, note: '' }, // find -> 100
      'mob-render': { state: 0, note: '' }, // mobile -> 0
    }
    const weights = defaultWeights('universal')
    const { overall, scored } = computeOverall(items, weights)
    const w = PROFILES.universal.weights
    const expected = Math.round((100 * w.find + 0 * w.mobile) / (w.find + w.mobile))
    expect(overall).toBe(expected)
    expect(scored).toBe(2)
  })
  it('is null with no scores', () => {
    expect(computeOverall({}, defaultWeights('universal')).overall).toBeNull()
  })
})
