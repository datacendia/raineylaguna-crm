import { describe, it, expect } from 'vitest'
import { mapPotentialToService, describePotential, SERVICES } from './services-map'

describe('mapPotentialToService', () => {
  it('maps web-build style potentials to Websites', () => {
    const webby = [
      'Full Web Build',
      'Service Portal',
      'Industrial UX Build',
      'Technical Portfolio',
      'Full Digital ID',
      'Lead Gen Site',
      'Local Service Web',
    ]
    for (const p of webby) {
      expect(mapPotentialToService(p)?.key).toBe('websites')
    }
  })

  it('maps brand potentials to Marca', () => {
    expect(mapPotentialToService('Professional Brand Build')?.key).toBe('marca')
  })

  it('routes modernization by whether the lead has a site', () => {
    // Unknown / no site → fresh Websites build (nothing to rewrite).
    expect(mapPotentialToService('Catalog Modernization')?.key).toBe('websites')
    expect(mapPotentialToService('Catalog Modernization', { hasSite: false })?.key).toBe('websites')
    // Confirmed existing site → Demolición (rewrite/relaunch).
    expect(mapPotentialToService('Catalog Modernization', { hasSite: true })?.key).toBe('demolicion')
  })

  it('returns null for level-words and empty values (render as plain text)', () => {
    for (const p of ['High', 'Medium', 'Low', 'Alta', 'Media', '', '  ', null, undefined]) {
      expect(mapPotentialToService(p as string | null | undefined)).toBeNull()
    }
  })

  it('falls back to Websites for unrecognised text', () => {
    expect(mapPotentialToService('Something Totally New')?.key).toBe('websites')
  })

  it('every service points at an absolute raineylaguna.com URL', () => {
    for (const s of Object.values(SERVICES)) {
      expect(s.url).toMatch(/^https:\/\/raineylaguna\.com/)
    }
  })
})

describe('describePotential', () => {
  it('returns a fuller, label-appropriate description', () => {
    expect(describePotential('Full Web Build')).toMatch(/website/i)
    expect(describePotential('Catalog Modernization')).toMatch(/catalog/i)
    expect(describePotential('Professional Brand Build')).toMatch(/identity|logo/i)
    expect(describePotential('Industrial UX Build')).toMatch(/UX/i)
  })

  it('is empty for level-words and blanks', () => {
    for (const p of ['High', 'Medium', '', null, undefined]) {
      expect(describePotential(p as string | null | undefined)).toBe('')
    }
  })

  it('falls back to a generic line for unknown text', () => {
    expect(describePotential('Something Totally New')).toMatch(/tailored/i)
  })
})
