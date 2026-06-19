import { describe, expect, it } from 'vitest'
import {
  LEAD_SOURCE_VALUES,
  leadSourceLabel,
  normalizeSource,
  type LeadSource,
} from './lead-source'

describe('lead-source', () => {
  describe('normalizeSource', () => {
    const cases: Array<[string | null | undefined, LeadSource]> = [
      // public site ingestion paths
      ['audit-tool', 'audit'],
      ['website-audit-tool', 'audit'],
      ['contacto-home', 'contact-form'],
      ['/contacto', 'contact-form'],
      ['contact', 'contact-form'],
      ['whatsapp', 'whatsapp'],
      ['wa', 'whatsapp'],
      ['/proto', 'proto'],
      // CRM-side ingestion
      ['google_places', 'discovery'],
      ['discovery', 'discovery'],
      ['csv-import', 'import'],
      ['referral', 'referral'],
      ['event', 'event'],
      // fallbacks
      ['public-intake', 'other'],
      ['something-unknown', 'other'],
      ['', 'other'],
      [null, 'other'],
      [undefined, 'other'],
      // case / whitespace insensitivity
      ['  Audit-Tool  ', 'audit'],
    ]
    it.each(cases)('maps %j → %s', (input, expected) => {
      expect(normalizeSource(input)).toBe(expected)
    })

    it('only ever returns a canonical value', () => {
      for (const raw of ['x', 'AUDIT', 'whatsapp-cloud', 'random', '']) {
        expect(LEAD_SOURCE_VALUES).toContain(normalizeSource(raw))
      }
    })
  })

  describe('leadSourceLabel', () => {
    it('returns a human label for every canonical value', () => {
      for (const v of LEAD_SOURCE_VALUES) {
        expect(leadSourceLabel(v)).toBeTruthy()
      }
    })
  })
})
