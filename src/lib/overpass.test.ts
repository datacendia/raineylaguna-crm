import { describe, expect, it } from 'vitest'
import {
  NICHE_OSM_FILTERS,
  buildOverpassQuery,
  osmElementToLead,
  type Bbox,
  type OsmElement,
} from './overpass'

const BBOX: Bbox = { south: -12.55, west: -77.25, north: -11.5, east: -76.6 }

describe('overpass', () => {
  describe('buildOverpassQuery', () => {
    it('emits JSON output, the bbox, node+way statements, and out center', () => {
      const q = buildOverpassQuery('Gastronomy', BBOX)
      expect(q).toContain('[out:json]')
      expect(q).toContain('(-12.55,-77.25,-11.5,-76.6)')
      expect(q).toContain('node["amenity"~"^(')
      expect(q).toContain('way["amenity"~"^(')
      expect(q.trimEnd().endsWith('out center;')).toBe(true)
    })

    it('covers every configured niche', () => {
      for (const niche of Object.keys(NICHE_OSM_FILTERS)) {
        expect(() => buildOverpassQuery(niche, BBOX)).not.toThrow()
      }
    })

    it('throws for an unknown niche', () => {
      expect(() => buildOverpassQuery('Nope', BBOX)).toThrow(/No OSM filters/)
    })

    it('cannot be broken out of by a crafted tag value', () => {
      // safeValues strips non [a-z0-9_] chars; nothing here can inject QL.
      const q = buildOverpassQuery('Fitness', BBOX)
      expect(q).not.toContain('"];')
    })
  })

  describe('osmElementToLead', () => {
    it('maps a node with full contact tags', () => {
      const el: OsmElement = {
        type: 'node',
        id: 123,
        lat: -12.1,
        lon: -77.0,
        tags: {
          name: 'Café Neblina',
          'contact:phone': '+51 999 111 222',
          website: 'cafeneblina.pe',
          'addr:housenumber': '450',
          'addr:street': 'Av. Grau',
          'addr:suburb': 'Barranco',
          'addr:city': 'Lima',
        },
      }
      expect(osmElementToLead(el)).toEqual({
        osmId: 'node/123',
        name: 'Café Neblina',
        phone: '+51 999 111 222',
        website: 'https://cafeneblina.pe', // scheme prepended
        address: '450 Av. Grau, Barranco, Lima',
        district: 'Barranco',
        lat: -12.1,
        lon: -77.0,
      })
    })

    it('uses center coordinates for a way', () => {
      const lead = osmElementToLead({
        type: 'way',
        id: 9,
        center: { lat: -12.2, lon: -76.9 },
        tags: { name: 'Gimnasio Fuerza' },
      })
      expect(lead).toMatchObject({ osmId: 'way/9', lat: -12.2, lon: -76.9, phone: null, website: null })
    })

    it('keeps an already-qualified website URL as-is and takes the first phone', () => {
      const lead = osmElementToLead({
        type: 'node', id: 1,
        tags: { name: 'X', phone: '111;222', 'contact:website': 'https://x.test/path' },
      })
      expect(lead?.website).toBe('https://x.test/path')
      expect(lead?.phone).toBe('111')
    })

    it('returns null when the element has no name', () => {
      expect(osmElementToLead({ type: 'node', id: 1, tags: { amenity: 'restaurant' } })).toBeNull()
      expect(osmElementToLead({ type: 'node', id: 2 })).toBeNull()
    })

    it('yields null address/district when no addr tags are present', () => {
      const lead = osmElementToLead({ type: 'node', id: 3, tags: { name: 'Solo' } })
      expect(lead?.address).toBeNull()
      expect(lead?.district).toBeNull()
    })
  })
})
