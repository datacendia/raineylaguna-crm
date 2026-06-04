import { describe, it, expect } from 'vitest'
import type { Lead } from './types'
import { normalizeEmail, normalizePhone, destinationFor, dedupeByDestination } from './outreach-dedupe'

const NOW = new Date('2026-06-04T12:00:00Z')

const baseLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'lead',
  name: 'Test SMB',
  email: null,
  phone: null,
  source: null,
  district: 'Miraflores',
  niche: 'Beauty & Wellness',
  category: null,
  instagram_active: null,
  instagram_url: null,
  facebook_url: null,
  linkedin_url: null,
  tiktok_url: null,
  google_place_id: null,
  address: null,
  website_url: null,
  website_status: null,
  digital_health_score: null,
  audit_findings: null,
  audited_at: null,
  manual_audit: null,
  manual_audit_score: null,
  manual_audited_at: null,
  evaluation: null,
  strategic_action: null,
  potential: null,
  pipeline_stage: 'Lead',
  notes: null,
  next_action: null,
  snoozed_until: null,
  sereno_customer: false,
  sereno_checked_at: null,
  deleted_at: null,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  ...overrides,
})

describe('normalizeEmail / normalizePhone', () => {
  it('lowercases and trims email', () => {
    expect(normalizeEmail('  Hola@OXXO.PE ')).toBe('hola@oxxo.pe')
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })

  it('reduces phones to digits so formatting differences collapse', () => {
    expect(normalizePhone('+51 1 601 3636')).toBe('5116013636')
    expect(normalizePhone('+51-1-6013636')).toBe('5116013636')
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('destinationFor', () => {
  it('uses the channel-appropriate field, normalised', () => {
    const l = baseLead({
      email: 'A@B.com',
      phone: '+51 999 111 222',
      instagram_url: 'https://instagram.com/x/',
    })
    expect(destinationFor(l, 'Email')).toBe('a@b.com')
    expect(destinationFor(l, 'WhatsApp')).toBe('51999111222')
    expect(destinationFor(l, 'Instagram DM')).toBe('https://instagram.com/x')
    expect(destinationFor(l, 'LinkedIn')).toBeNull()
  })
})

describe('dedupeByDestination', () => {
  it('collapses locations sharing one email to a single message', () => {
    const a = baseLead({ id: 'a', name: 'OXXO Larco', email: 'corp@oxxo.pe' })
    const b = baseLead({ id: 'b', name: 'OXXO La Mar', email: 'CORP@oxxo.pe' })
    const c = baseLead({ id: 'c', name: 'OXXO Pardo', email: ' corp@oxxo.pe ' })
    const { keep, skipped } = dedupeByDestination([a, b, c], 'Email', NOW)
    expect(keep).toHaveLength(1)
    expect(skipped).toHaveLength(2)
  })

  it('matches phones across formatting differences (WhatsApp)', () => {
    const a = baseLead({ id: 'a', phone: '+51 1 601 3636' })
    const b = baseLead({ id: 'b', phone: '+51-1-6013636' })
    const { keep, skipped } = dedupeByDestination([a, b], 'WhatsApp', NOW)
    expect(keep).toHaveLength(1)
    expect(skipped).toHaveLength(1)
  })

  it('keeps every lead when destinations are distinct', () => {
    const a = baseLead({ id: 'a', email: 'a@x.com' })
    const b = baseLead({ id: 'b', email: 'b@x.com' })
    const { keep, skipped } = dedupeByDestination([a, b], 'Email', NOW)
    expect(keep).toHaveLength(2)
    expect(skipped).toHaveLength(0)
  })

  it('never collapses leads that lack a destination for the channel', () => {
    const a = baseLead({ id: 'a', email: null })
    const b = baseLead({ id: 'b', email: null })
    const { keep, skipped } = dedupeByDestination([a, b], 'Email', NOW)
    expect(keep).toHaveLength(2) // two businesses that simply have no email
    expect(skipped).toHaveLength(0)
  })

  it('only collapses on the chosen channel’s destination', () => {
    // Same phone, different emails: an Email batch must NOT collapse them.
    const a = baseLead({ id: 'a', phone: '+51 1 601 3636', email: 'a@x.com' })
    const b = baseLead({ id: 'b', phone: '+51 1 601 3636', email: 'b@x.com' })
    expect(dedupeByDestination([a, b], 'Email', NOW).keep).toHaveLength(2)
    expect(dedupeByDestination([a, b], 'WhatsApp', NOW).keep).toHaveLength(1)
  })

  it('keeps the highest-priority location as the representative', () => {
    // Both share an email; `a` has no website (max website points → higher
    // score), `b` has a modern site. `a` should be the keeper.
    const a = baseLead({ id: 'a', email: 'corp@oxxo.pe', website_url: null, website_status: null, phone: '+51999000111' })
    const b = baseLead({ id: 'b', email: 'corp@oxxo.pe', website_url: 'https://oxxo.pe', website_status: 'modern' })
    const { keep, skipped } = dedupeByDestination([a, b], 'Email', NOW)
    expect(keep).toHaveLength(1)
    expect(keep[0].id).toBe('a')
    expect(skipped[0].id).toBe('b')
  })
})
