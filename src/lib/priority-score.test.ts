import { describe, it, expect } from 'vitest'
import type { Lead } from './types'
import { computePriorityScore, bandColor } from './priority-score'

/**
 * Tests for the Smart Prioritization Score.
 *
 * The function is a pure deterministic mapping from `Lead` row + `now`
 * timestamp → 0-100 score. Each test pins a specific case from the score
 * design doc so future tweaks to weights are caught explicitly.
 */

const NOW = new Date('2026-05-08T12:00:00Z')

const baseLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'l_test',
  name: 'Test SMB',
  email: null,
  phone: null,
  source: null,
  district: 'Miraflores',
  niche: 'Professional Services',
  category: null,
  instagram_active: null,
  website_url: null,
  website_status: null,
  evaluation: null,
  strategic_action: null,
  potential: null,
  pipeline_stage: 'Lead',
  notes: null,
  next_action: null,
  snoozed_until: null,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  ...overrides,
})

describe('computePriorityScore', () => {
  it('returns a score in [0, 100] for a default Lead', () => {
    const ps = computePriorityScore(baseLead(), NOW)
    expect(ps.score).toBeGreaterThanOrEqual(0)
    expect(ps.score).toBeLessThanOrEqual(100)
  })

  it('breakdown components sum to total score', () => {
    const ps = computePriorityScore(baseLead(), NOW)
    const sum =
      ps.breakdown.recency +
      ps.breakdown.website +
      ps.breakdown.niche +
      ps.breakdown.workability
    expect(sum).toBe(ps.score)
  })

  it('lead with no website earns the maximum website-gap points', () => {
    const ps = computePriorityScore(
      baseLead({ website_url: null, website_status: null }),
      NOW,
    )
    expect(ps.breakdown.website).toBeGreaterThanOrEqual(28)
  })

  it('lead with a modern website earns near-zero website-gap points', () => {
    const ps = computePriorityScore(
      baseLead({ website_url: 'https://example.com', website_status: 'modern' }),
      NOW,
    )
    expect(ps.breakdown.website).toBeLessThanOrEqual(5)
  })

  it('Beauty & Wellness scores higher than Automotive on niche dimension', () => {
    const beauty = computePriorityScore(
      baseLead({ niche: 'Beauty & Wellness' }),
      NOW,
    )
    const auto = computePriorityScore(baseLead({ niche: 'Automotive' }), NOW)
    expect(beauty.breakdown.niche).toBeGreaterThan(auto.breakdown.niche)
  })

  it('a fresh lead, no website, in a hot niche lands in Crítico', () => {
    const ps = computePriorityScore(
      baseLead({
        niche: 'Beauty & Wellness',
        website_url: null,
        website_status: null,
        phone: '+51999111222',
        created_at: NOW.toISOString(),
      }),
      NOW,
    )
    expect(ps.band).toBe('Crítico')
    expect(ps.score).toBeGreaterThanOrEqual(75)
  })

  it('a snoozed lead has zero workability', () => {
    const future = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000)
    const ps = computePriorityScore(
      baseLead({ snoozed_until: future.toISOString() }),
      NOW,
    )
    expect(ps.breakdown.workability).toBe(0)
  })

  it('recently expired snooze adds workability points', () => {
    const recentlyExpired = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
    const ps = computePriorityScore(
      baseLead({
        snoozed_until: recentlyExpired.toISOString(),
        phone: '+51999000111',
      }),
      NOW,
    )
    expect(ps.breakdown.workability).toBeGreaterThan(0)
  })

  it('recency decays linearly between day 7 and day 60', () => {
    const day0 = computePriorityScore(baseLead({ created_at: NOW.toISOString() }), NOW)
    const day30 = computePriorityScore(
      baseLead({ created_at: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() }),
      NOW,
    )
    const day90 = computePriorityScore(
      baseLead({ created_at: new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString() }),
      NOW,
    )
    expect(day0.breakdown.recency).toBeGreaterThan(day30.breakdown.recency)
    expect(day30.breakdown.recency).toBeGreaterThan(day90.breakdown.recency)
    expect(day90.breakdown.recency).toBe(0)
  })

  it('produces a non-empty `why` string', () => {
    const ps = computePriorityScore(baseLead(), NOW)
    expect(typeof ps.why).toBe('string')
    expect(ps.why.length).toBeGreaterThan(0)
  })

  it('band boundaries: 75/55/35/0', () => {
    // We can't directly assert internal `bandFor` thresholds without exposing
    // them, but we can probe the boundary by constructing leads that should
    // straddle each band.
    const critico = computePriorityScore(
      baseLead({
        niche: 'Beauty & Wellness',
        website_url: null,
        website_status: null,
        phone: '+51999000111',
        email: 'a@b.com',
      }),
      NOW,
    )
    expect(['Crítico', 'Alto']).toContain(critico.band)

    const bajo = computePriorityScore(
      baseLead({
        niche: 'Automotive',
        website_url: 'https://x.com',
        website_status: 'modern',
        created_at: new Date(NOW.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      NOW,
    )
    expect(['Bajo', 'Medio']).toContain(bajo.band)
  })
})

describe('bandColor', () => {
  it('returns a valid Tailwind class pair for each band', () => {
    for (const band of ['Crítico', 'Alto', 'Medio', 'Bajo'] as const) {
      const c = bandColor(band)
      expect(c.bg).toMatch(/^bg-/)
      expect(c.text).toMatch(/^text-/)
    }
  })
})
