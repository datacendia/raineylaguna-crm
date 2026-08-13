import { describe, it, expect } from 'vitest'
import { intakeFlagId } from '@/app/api/leads/public/route'

/**
 * Flag ids from the public audit tool used to be the finding's array index —
 * `web_${i}`. Two consequences, both live in production data:
 *
 *   1. The same finding got a different id depending on what else was in the
 *      payload, so nothing about intake audits was ever countable.
 *   2. web_0..web_13 leaked into audit_findings as though they were flag
 *      types, and the analytics "Top opportunity signals" panel — which groups
 *      by flag id — has been reporting a signal named "web_0", i.e. an array
 *      subscript presented to the operator as a business insight.
 *
 * Ids are now derived from the finding itself and mapped onto the same
 * vocabulary computeHealth emits, so CRM-run and site-run audits aggregate
 * together.
 */
describe('intakeFlagId', () => {
  it('is stable regardless of position in the payload', () => {
    expect(intakeFlagId('No HTTPS')).toBe(intakeFlagId('No HTTPS'))
  })

  it('maps known findings onto the CRM flag vocabulary', () => {
    expect(intakeFlagId('No HTTPS / not secure')).toBe('no_https')
    expect(intakeFlagId('Sitio no seguro')).toBe('no_https')
    expect(intakeFlagId('Not mobile-friendly')).toBe('not_mobile')
    expect(intakeFlagId('No es móvil')).toBe('not_mobile')
    expect(intakeFlagId('Weak SEO')).toBe('weak_seo')
    expect(intakeFlagId('Sin analítica')).toBe('no_analytics')
    expect(intakeFlagId('Accesibilidad deficiente')).toBe('weak_accessibility')
    expect(intakeFlagId('Stale copyright year')).toBe('stale')
  })

  it('slugs unknown findings under a visible prefix, never a bare index', () => {
    const id = intakeFlagId('Something Nobody Mapped Yet')
    expect(id).toBe('intake_something_nobody_mapped_yet')
    expect(id).not.toMatch(/^web_\d+$/)
  })

  it('strips accents so the same finding does not fork into two ids', () => {
    expect(intakeFlagId('Título raro')).toBe(intakeFlagId('Titulo raro'))
  })

  it('never emits an empty or index-shaped id', () => {
    for (const title of ['', '   ', '!!!', '0', '1']) {
      const id = intakeFlagId(title)
      expect(id.length).toBeGreaterThan(0)
      expect(id).not.toMatch(/^web_\d+$/)
    }
  })
})
