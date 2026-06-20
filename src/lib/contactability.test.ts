import { describe, it, expect } from 'vitest'
import {
  emailDomain,
  isBusinessEmail,
  emailRequiresBusinessDomain,
  emailAllowedForLead,
} from './contactability'

describe('emailDomain', () => {
  it('extracts and lower-cases the domain', () => {
    expect(emailDomain('Owner@Shop.PE')).toBe('shop.pe')
  })
  it('returns null for missing / malformed', () => {
    expect(emailDomain('no-at')).toBeNull()
    expect(emailDomain(null)).toBeNull()
  })
})

describe('isBusinessEmail', () => {
  it('treats company domains as business', () => {
    expect(isBusinessEmail('hola@cafeneblina.pe')).toBe(true)
    expect(isBusinessEmail('info@clinic.co.uk')).toBe(true)
  })
  it('treats free providers as non-business (indistinguishable from individuals)', () => {
    expect(isBusinessEmail('owner@gmail.com')).toBe(false)
    expect(isBusinessEmail('person@hotmail.com')).toBe(false)
    expect(isBusinessEmail('x@outlook.com')).toBe(false)
  })
  it('rejects missing / malformed', () => {
    expect(isBusinessEmail(null)).toBe(false)
    expect(isBusinessEmail('garbage')).toBe(false)
  })
})

describe('emailRequiresBusinessDomain (per market)', () => {
  it('does not restrict permissive markets (Peru, US)', () => {
    expect(emailRequiresBusinessDomain('Lima')).toBe(false)
    expect(emailRequiresBusinessDomain('Boston')).toBe(false) // USA / CAN-SPAM
    expect(emailRequiresBusinessDomain('Los Angeles')).toBe(false)
  })
  it('restricts consent-first markets (UK) and unknown (fail-safe)', () => {
    expect(emailRequiresBusinessDomain('Glasgow')).toBe(true)
    expect(emailRequiresBusinessDomain(undefined)).toBe(true)
    expect(emailRequiresBusinessDomain('Atlantis')).toBe(true)
  })
})

describe('emailAllowedForLead', () => {
  it('allows any address (with opt-out) in permissive markets', () => {
    expect(emailAllowedForLead('owner@gmail.com', 'Lima')).toBe(true)
    expect(emailAllowedForLead('owner@gmail.com', 'Boston')).toBe(true)
  })
  it('requires a business domain in consent-first markets', () => {
    expect(emailAllowedForLead('owner@gmail.com', 'Glasgow')).toBe(false)
    expect(emailAllowedForLead('info@bakery.co.uk', 'Glasgow')).toBe(true)
  })
  it('fails closed on unknown market', () => {
    expect(emailAllowedForLead('owner@gmail.com', undefined)).toBe(false)
    expect(emailAllowedForLead('info@firm.com', undefined)).toBe(true)
  })
})
