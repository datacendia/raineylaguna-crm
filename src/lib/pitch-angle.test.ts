import { describe, it, expect } from 'vitest'
import { buildPitchAngle, type PitchAngleInput } from './pitch-angle'
import type { AuditFlag } from './types'

const flag = (id: string, severity: AuditFlag['severity'] = 'high'): AuditFlag => ({
  id,
  label: id,
  severity,
})

function lead(over: Partial<PitchAngleInput> = {}): PitchAngleInput {
  return {
    name: 'Café Luna',
    city: 'Lima',
    niche: 'Gastronomy',
    audit_findings: { flags: [flag('no_https')] },
    ...over,
  }
}

describe('buildPitchAngle', () => {
  it('grounds the opening in the strongest flag and never invents facts', () => {
    const a = buildPitchAngle(lead({ audit_findings: { flags: [flag('no_https')] } }))
    expect(a.locale).toBe('es')
    expect(a.flags).toEqual(['no_https'])
    expect(a.opening).toContain('Café Luna')
    expect(a.opening.toLowerCase()).toContain('https')
    expect(a.talkingPoints.length).toBe(1)
  })

  it('orders by severity first, then by opportunity weight', () => {
    const a = buildPitchAngle(
      lead({
        audit_findings: {
          flags: [flag('no_analytics', 'low'), flag('not_mobile', 'high'), flag('no_https', 'high')],
        },
      }),
    )
    // Two high-severity flags: no_https (weight 80) outranks not_mobile (75);
    // the low-severity analytics flag comes last.
    expect(a.flags).toEqual(['no_https', 'not_mobile', 'no_analytics'])
    expect(a.talkingPoints.length).toBe(3)
  })

  it('caps talking points at the top 3 flags', () => {
    const a = buildPitchAngle(
      lead({
        audit_findings: {
          flags: [
            flag('no_https'),
            flag('not_mobile'),
            flag('slow_lcp'),
            flag('weak_seo', 'medium'),
            flag('no_analytics', 'low'),
          ],
        },
      }),
    )
    expect(a.flags.length).toBe(3)
    expect(a.talkingPoints.length).toBe(3)
  })

  it('uses a dedicated hook for the no-website case', () => {
    const a = buildPitchAngle(lead({ audit_findings: { flags: [flag('no_website')] } }))
    expect(a.opening.toLowerCase()).toContain('google')
    expect(a.headline).toContain('Café Luna')
  })

  it('switches to English for an English-locale market', () => {
    const a = buildPitchAngle(
      lead({ name: 'Luna Coffee', city: 'Boston', audit_findings: { flags: [flag('no_https')] } }),
    )
    expect(a.locale).toBe('en')
    expect(a.opening).toContain('Luna Coffee')
    expect(a.opening.toLowerCase()).toContain('https')
  })

  it('tells the operator to audit when there are no findings at all', () => {
    const a = buildPitchAngle(lead({ audit_findings: null }))
    expect(a.flags).toEqual([])
    expect(a.talkingPoints).toEqual([])
    expect(a.headline.toLowerCase()).toContain('auditor')
  })

  it('pivots to an upsell angle when the site is already healthy', () => {
    const a = buildPitchAngle(lead({ audit_findings: { flags: [] } }))
    expect(a.flags).toEqual([])
    expect(a.talkingPoints.length).toBeGreaterThan(0)
    expect(a.headline.toLowerCase()).toContain('base')
  })

  it('ignores unknown flag ids rather than emitting blank copy', () => {
    const a = buildPitchAngle(
      lead({ audit_findings: { flags: [flag('totally_unknown'), flag('no_https')] } }),
    )
    expect(a.flags).toEqual(['no_https'])
    expect(a.talkingPoints.every((p) => p.length > 0)).toBe(true)
  })
})

/**
 * An unreachable site is an absent measurement, not a finding.
 *
 * 1,498 leads carry site_unreachable, and every one produced an opener
 * asserting the prospect's website was down. Bodytech's row points at
 * bodytechperu.com — a live estate for a major gym chain that almost certainly
 * rate-limited or bot-blocked the crawler. Telling that prospect their site is
 * broken is a credibility problem in the first sentence.
 */
describe('unreachable sites never assert an outage', () => {
  const unreachable = lead({
    name: 'Bodytech',
    audit_findings: { flags: [flag('site_unreachable')] },
  })

  it('asks rather than asserts, in both locales', () => {
    const es = buildPitchAngle({ ...unreachable, city: 'Lima' })
    const en = buildPitchAngle({ ...unreachable, city: 'Boston' })
    // No claim of downtime anywhere in the copy that reaches a prospect.
    expect(es.opening).not.toMatch(/no cargó|está caído|no responde/i)
    expect(en.opening).not.toMatch(/is down|wouldn't load|won't load/i)
    // Phrased from our side, and asking.
    expect(es.opening).toMatch(/desde aquí|\?/)
    expect(en.opening).toMatch(/from my end|\?/)
  })

  it('flags the angle for human verification and says why', () => {
    const a = buildPitchAngle(unreachable)
    expect(a.requiresVerification).toBe(true)
    expect(a.verificationNote).toMatch(/bloqueo de bots|bot block/i)
  })

  it('does not flag angles built on real findings', () => {
    const a = buildPitchAngle(lead({ audit_findings: { flags: [flag('no_https')] } }))
    expect(a.requiresVerification).toBe(false)
    expect(a.verificationNote).toBeUndefined()
  })

  it('ranks any measured signal above an unreachable one', () => {
    // Both 'high' severity, so this is decided by weight: the absent
    // observation must never lead when something was actually seen.
    const a = buildPitchAngle(
      lead({ audit_findings: { flags: [flag('site_unreachable'), flag('no_https')] } }),
    )
    expect(a.flags[0]).toBe('no_https')
    expect(a.requiresVerification).toBe(false)
  })
})
