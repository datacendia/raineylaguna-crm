import { describe, it, expect } from 'vitest'
import {
  detectChains,
  isChainLead,
  isGenericName,
  isKnownGlobalBrand,
  normaliseBrand,
} from './chain-detect'

const lead = (id: string, name: string, district: string, city = 'Lima') => ({
  id,
  name,
  city,
  district,
})

describe('normaliseBrand', () => {
  it('strips branch qualifiers so one brand does not split into many', () => {
    const forms = [
      'Adidas',
      'Adidas - Jockey Plaza',
      'Adidas Store Larcomar',
      'ADIDAS (Mega Plaza)',
      'Adidas Perú S.A.C.',
      'Adidas | San Isidro',
    ]
    const normalised = new Set(forms.map(normaliseBrand))
    expect(normalised).toEqual(new Set(['adidas']))
  })

  it('strips accents', () => {
    expect(normaliseBrand('Farmacia Perú')).toBe(normaliseBrand('Farmacia Peru'))
  })

  it('drops legal forms', () => {
    expect(normaliseBrand('Bodytech S.A.C.')).toBe('bodytech')
    expect(normaliseBrand('Marathon Sports SAC')).toBe('marathon sports')
  })
})

describe('generic names are never grouped', () => {
  it('recognises words too common to be a brand', () => {
    expect(isGenericName('casa')).toBe(true)
    expect(isGenericName('bodega')).toBe(true)
    expect(isGenericName('adidas')).toBe(false)
  })

  it('does not flag 67 unrelated businesses called Casa as a chain', () => {
    // The audit found "Casa" x67. Those are duplicates and common words, not a
    // national chain — demoting them would bury 67 real independents.
    const casas = Array.from({ length: 67 }, (_, i) =>
      lead(`c${i}`, 'Casa', `District ${i % 20}`),
    )
    expect(detectChains(casas)).toHaveLength(0)
  })
})

describe('detectChains', () => {
  it('catches the brands currently topping the independents queue', () => {
    const leads = [
      ...Array.from({ length: 42 }, (_, i) =>
        lead(`a${i}`, `Adidas - Store ${i}`, `District ${i % 12}`),
      ),
      ...Array.from({ length: 26 }, (_, i) =>
        lead(`b${i}`, `Bodytech Sede ${i}`, `District ${i % 9}`),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        lead(`m${i}`, 'Marathon Sports', `District ${i}`),
      ),
    ]
    const brands = detectChains(leads).map((g) => g.brand)
    expect(brands).toContain('adidas')
    expect(brands).toContain('bodytech')
    expect(brands).toContain('marathon sports')
  })

  it('reports the evidence for each call', () => {
    const leads = Array.from({ length: 5 }, (_, i) =>
      lead(`s${i}`, 'Starbucks', `District ${i}`),
    )
    const [group] = detectChains(leads)
    expect(group.brand).toBe('starbucks')
    expect(group.count).toBe(5)
    expect(group.districts).toHaveLength(5)
  })

  it('does NOT flag a repeated name confined to one district', () => {
    // Same name, same place = duplicate rows for one business. That is
    // lead-dedupe's problem; flagging it as a chain would demote a real
    // independent for the crime of having been scraped twice.
    const dupes = Array.from({ length: 8 }, (_, i) =>
      lead(`d${i}`, 'Peluquería Rosa', 'Miraflores'),
    )
    expect(detectChains(dupes)).toHaveLength(0)
  })

  it('counts the same district name in different cities separately', () => {
    const leads = [
      lead('x1', 'Zeta Coffee', 'Centro', 'Lima'),
      lead('x2', 'Zeta Coffee', 'Centro', 'Boston'),
      lead('x3', 'Zeta Coffee', 'Centro', 'Glasgow'),
    ]
    expect(detectChains(leads)).toHaveLength(1)
  })

  it('leaves a genuine two-location independent alone', () => {
    const leads = [
      lead('t1', 'Café Tostado', 'Miraflores'),
      lead('t2', 'Café Tostado', 'Barranco'),
    ]
    expect(detectChains(leads)).toHaveLength(0)
  })
})

describe('known global brands', () => {
  it('catches a single flagship store the threshold would miss', () => {
    expect(isKnownGlobalBrand('Adidas')).toBe(true)
    expect(isKnownGlobalBrand('Home Depot - Surco')).toBe(true)
    expect(isKnownGlobalBrand('Starbucks Coffee')).toBe(true)
  })

  it('does not match an independent whose name merely contains a brand word', () => {
    expect(isKnownGlobalBrand('Nikeisha Beauty Salon')).toBe(false)
    expect(isKnownGlobalBrand('Gapinsa Ingenieros')).toBe(false)
  })

  it('combines both signals', () => {
    const brands = new Set(['bodytech'])
    expect(isChainLead(lead('1', 'Bodytech Sede X', 'Lince'), brands)).toBe(true)
    expect(isChainLead(lead('2', 'Adidas', 'Lince'), new Set())).toBe(true)
    expect(isChainLead(lead('3', 'Peluquería Rosa', 'Lince'), brands)).toBe(false)
  })
})
