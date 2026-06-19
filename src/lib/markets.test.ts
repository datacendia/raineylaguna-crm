import { describe, it, expect } from 'vitest'
import {
  MARKETS,
  MARKET_NAMES,
  DEFAULT_CITY,
  getMarket,
  districtsForCity,
  tierForDistrict,
  districtFromAddress,
} from './markets'

describe('markets', () => {
  it('registers Lima + the three new cities', () => {
    expect(MARKET_NAMES).toEqual(
      expect.arrayContaining(['Lima', 'Boston', 'Glasgow', 'Los Angeles']),
    )
    expect(DEFAULT_CITY).toBe('Lima')
  })

  it('every market is internally consistent (tiers reference real districts; bbox sane)', () => {
    for (const name of MARKET_NAMES) {
      const m = MARKETS[name]
      expect(m.name).toBe(name)
      expect(m.districts.length).toBeGreaterThan(0)
      for (const d of Object.keys(m.tiers)) expect(m.districts).toContain(d)
      expect(m.bbox.south).toBeLessThan(m.bbox.north)
      expect(m.bbox.west).toBeLessThan(m.bbox.east)
    }
  })

  describe('tierForDistrict', () => {
    it('reads per-city tiers', () => {
      expect(tierForDistrict('Lima', 'San Isidro')).toBe('A')
      expect(tierForDistrict('Boston', 'Back Bay')).toBe('A')
      expect(tierForDistrict('Glasgow', 'West End')).toBe('A')
      expect(tierForDistrict('Los Angeles', 'Beverly Hills')).toBe('A')
    })
    it('defaults unknown city/district to C', () => {
      expect(tierForDistrict('Boston', 'Dorchester')).toBe('C')
      expect(tierForDistrict('Nowhere', 'X')).toBe('C')
      expect(tierForDistrict('Lima', null)).toBe('C')
      expect(tierForDistrict(null, 'San Isidro')).toBe('C')
    })
  })

  describe('districtFromAddress', () => {
    it('resolves a district from a free-text address', () => {
      expect(districtFromAddress('Lima', 'Av. Larco 123, Miraflores, Lima')).toBe('Miraflores')
      expect(districtFromAddress('Boston', '450 Boylston St, Back Bay, Boston, MA')).toBe('Back Bay')
      expect(districtFromAddress('Glasgow', 'Argyle St, Finnieston, Glasgow')).toBe('Finnieston')
    })
    it('prefers the longest matching name', () => {
      expect(districtFromAddress('Lima', 'Jr. X, San Juan de Lurigancho, Lima')).toBe(
        'San Juan de Lurigancho',
      )
    })
    it('returns null for no match / unknown city / no address', () => {
      expect(districtFromAddress('Lima', 'Nowhere at all')).toBeNull()
      expect(districtFromAddress('Atlantis', 'anywhere')).toBeNull()
      expect(districtFromAddress('Lima', null)).toBeNull()
    })
  })

  it('districtsForCity returns the market list, or empty for unknown', () => {
    expect(districtsForCity('Boston')).toContain('Seaport')
    expect(districtsForCity('Nope')).toEqual([])
  })

  it('getMarket carries locale facts for Phase-2 localization', () => {
    expect(getMarket('Glasgow')?.currency).toBe('GBP')
    expect(getMarket('Boston')?.phoneCode).toBe('1')
    expect(getMarket('Lima')?.timezone).toBe('America/Lima')
    expect(getMarket('Los Angeles')?.country).toBe('USA')
  })
})
