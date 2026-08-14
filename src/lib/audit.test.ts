import { describe, it, expect } from 'vitest'
import type { AuditScores } from './types'
import {
  computeHealth,
  analyzeHtml,
  healthColor,
  severityColor,
  type AuditSignals,
} from './audit'

const noScores = (): AuditScores => ({
  performance: null,
  seo: null,
  accessibility: null,
  bestPractices: null,
})

const baseSignals = (overrides: Partial<AuditSignals> = {}): AuditSignals => ({
  hasSite: true,
  socialOnly: false,
  reachable: true,
  https: true,
  mobileViewport: true,
  structuredData: true,
  analytics: true,
  staleCopyright: false,
  lighthouse: { performance: 95, seo: 95, accessibility: 95, bestPractices: 95 },
  lcpMs: 1800,
  ...overrides,
})

describe('computeHealth', () => {
  it('no website → score 0 and a high-severity no_website flag', () => {
    const r = computeHealth(baseSignals({ hasSite: false, reachable: false }))
    expect(r.score).toBe(0)
    expect(r.hadSite).toBe(false)
    expect(r.flags.some((f) => f.id === 'no_website' && f.severity === 'high')).toBe(true)
  })

  it('social-only "website" → low score and social_only flag', () => {
    const r = computeHealth(baseSignals({ socialOnly: true, reachable: false }))
    expect(r.score).toBeLessThanOrEqual(20)
    expect(r.flags.some((f) => f.id === 'social_only')).toBe(true)
  })

  it('unreachable site → low score and site_unreachable flag', () => {
    const r = computeHealth(baseSignals({ reachable: false }))
    expect(r.score).toBeLessThanOrEqual(15)
    expect(r.flags.some((f) => f.id === 'site_unreachable')).toBe(true)
  })

  it('a healthy modern site scores high with no high-severity flags', () => {
    const r = computeHealth(baseSignals())
    expect(r.score).toBeGreaterThanOrEqual(85)
    expect(r.flags.some((f) => f.severity === 'high')).toBe(false)
  })

  it('a bad site scores low and flags the concrete problems', () => {
    const r = computeHealth(
      baseSignals({
        https: false,
        mobileViewport: false,
        structuredData: false,
        analytics: false,
        lighthouse: { performance: 22, seo: 55, accessibility: 60, bestPractices: 40 },
        lcpMs: 7800,
      }),
    )
    expect(r.score).toBeLessThan(45)
    const ids = r.flags.map((f) => f.id)
    expect(ids).toContain('no_https')
    expect(ids).toContain('not_mobile')
    expect(ids).toContain('slow_lcp')
    expect(ids).toContain('poor_performance')
  })

  it('score is always clamped to [0, 100]', () => {
    const worst = computeHealth(
      baseSignals({
        https: false,
        mobileViewport: false,
        structuredData: false,
        analytics: false,
        staleCopyright: true,
        lighthouse: noScores(),
      }),
    )
    expect(worst.score).toBeGreaterThanOrEqual(0)
    expect(worst.score).toBeLessThanOrEqual(100)
  })

  it('summary mentions the health number', () => {
    const r = computeHealth(baseSignals())
    expect(r.summary).toMatch(/Health \d+\/100/)
  })

  it('labels the result heuristics-only when PageSpeed data is absent', () => {
    const r = computeHealth(baseSignals({ lighthouse: noScores() }))
    expect(r.summary).toMatch(/heuristics only/i)
  })

  it('keeps "solid web presence" only when Lighthouse data is present', () => {
    const r = computeHealth(baseSignals())
    expect(r.summary).toMatch(/solid web presence/i)
  })
})

describe('analyzeHtml', () => {
  it('detects HTTPS from the final URL', () => {
    expect(analyzeHtml('<html></html>', 'https://x.com').https).toBe(true)
    expect(analyzeHtml('<html></html>', 'http://x.com').https).toBe(false)
  })

  it('detects a mobile viewport meta tag', () => {
    const html = '<head><meta name="viewport" content="width=device-width"></head>'
    expect(analyzeHtml(html, 'https://x.com').mobileViewport).toBe(true)
    expect(analyzeHtml('<head></head>', 'https://x.com').mobileViewport).toBe(false)
  })

  it('detects structured data / og tags and analytics', () => {
    const html =
      '<script type="application/ld+json">{}</script><script>gtag("config")</script>'
    const s = analyzeHtml(html, 'https://x.com')
    expect(s.structuredData).toBe(true)
    expect(s.analytics).toBe(true)
  })

  it('flags a stale copyright year', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(analyzeHtml('<footer>© 2019 Acme</footer>', 'https://x.com', now).staleCopyright).toBe(true)
    expect(analyzeHtml('<footer>© 2026 Acme</footer>', 'https://x.com', now).staleCopyright).toBe(false)
  })
})

describe('healthColor / severityColor', () => {
  it('returns Tailwind class pairs across the range', () => {
    for (const s of [10, 55, 90]) {
      const c = healthColor(s)
      expect(c.bg).toMatch(/^bg-/)
      expect(c.text).toMatch(/^text-/)
    }
    for (const sev of ['high', 'medium', 'low'] as const) {
      const c = severityColor(sev)
      expect(c.bg).toMatch(/^bg-/)
      expect(c.text).toMatch(/^text-/)
    }
  })
})

/**
 * Status and confidence travel with the score.
 *
 * Half of all audited rows carry a score that measured nothing: 15 for
 * social-only, 10 for unreachable, 50 as the "no PageSpeed" placeholder. Those
 * three constants were indistinguishable from observations, and the priority
 * model consumed them as such. These tests pin the distinction.
 */
describe('audit status and confidence', () => {
  it('marks an unreachable site as an absent measurement, not a bad one', () => {
    const f = computeHealth(baseSignals({ reachable: false }))
    expect(f.status).toBe('unreachable')
    expect(f.confidence).toBe('none')
    // The 10 is retained for backwards compatibility with existing readers,
    // but the status is what callers must branch on.
    expect(f.score).toBe(10)
  })

  it('does not claim an unreachable site is down', () => {
    // A bot block, a rate limit and a dead host are indistinguishable from the
    // crawler's position, and asserting an outage in outreach against a live
    // site is a credibility problem at first contact.
    const f = computeHealth(baseSignals({ reachable: false }))
    expect(f.summary).not.toMatch(/did not respond/i)
    expect(f.summary).toMatch(/could not be reached/i)
  })

  it('treats no-website and social-only as genuine findings', () => {
    expect(computeHealth(baseSignals({ hasSite: false })).status).toBe('no_website')
    expect(computeHealth(baseSignals({ socialOnly: true })).status).toBe('social_only')
  })

  it('distinguishes a PageSpeed-backed score from a heuristics-only one', () => {
    // No Lighthouse categories at all — the 1,772 rows whose 50 is a
    // placeholder rather than a measurement.
    const heuristic = computeHealth(baseSignals({ lighthouse: noScores() }))
    expect(heuristic.status).toBe('measured')
    expect(heuristic.confidence).toBe('heuristics')

    const measured = computeHealth(
      baseSignals({
        lighthouse: { performance: 40, seo: 60, accessibility: 70, bestPractices: 80 },
      }),
    )
    expect(measured.status).toBe('measured')
    expect(measured.confidence).toBe('pagespeed')
  })
})
