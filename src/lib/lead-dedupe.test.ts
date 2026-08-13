import { describe, it, expect } from 'vitest'
import {
  dedupeReport,
  findContactCollisions,
  findIdentityDuplicates,
  identityKey,
  normalisePhone,
  pickSurvivor,
  richness,
  type DedupeCandidate,
} from './lead-dedupe'

const lead = (o: Partial<DedupeCandidate> & { id: string }): DedupeCandidate => ({
  name: 'Peluquería Rosa',
  city: 'Lima',
  district: 'Miraflores',
  phone: null,
  email: null,
  website_url: null,
  digital_health_score: null,
  audited_at: null,
  pipeline_stage: 'Lead',
  created_at: '2026-06-01T00:00:00Z',
  ...o,
})

describe('identity duplicates', () => {
  it('groups the same business scraped twice in one district', () => {
    const groups = findIdentityDuplicates([
      lead({ id: 'a' }),
      lead({ id: 'b' }),
      lead({ id: 'c' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].size).toBe(3)
    expect(groups[0].duplicateIds).toHaveLength(2)
  })

  it('does NOT merge a chain spread across districts', () => {
    // The inverse error of chain detection, and the more expensive one:
    // merging 42 Adidas branches into a single lead would destroy 41 rows.
    const adidas = Array.from({ length: 42 }, (_, i) =>
      lead({ id: `a${i}`, name: 'Adidas', district: `District ${i % 12}` }),
    )
    const groups = findIdentityDuplicates(adidas)
    // Some same-district collisions are expected, but never one big group.
    expect(Math.max(...groups.map((g) => g.size))).toBeLessThan(10)
  })

  it('normalises brand and location into the key', () => {
    expect(identityKey(lead({ id: '1', name: 'Adidas - Jockey Plaza' }))).toBe(
      identityKey(lead({ id: '2', name: 'ADIDAS S.A.C.' })),
    )
  })

  it('ignores rows with an unusable name', () => {
    expect(findIdentityDuplicates([lead({ id: 'a', name: '' }), lead({ id: 'b', name: '' })]))
      .toHaveLength(0)
  })
})

describe('survivor selection', () => {
  it('keeps the row carrying the most data', () => {
    const sparse = lead({ id: 'sparse' })
    const rich = lead({ id: 'rich', email: 'a@b.com', phone: '999', website_url: 'x' })
    expect(pickSurvivor([sparse, rich]).id).toBe('rich')
  })

  it('keeps a worked lead over a richer untouched one', () => {
    // Pipeline history is the one thing a merge can never reconstruct.
    const worked = lead({ id: 'worked', pipeline_stage: 'Proposal' })
    const rich = lead({
      id: 'rich',
      email: 'a@b.com',
      phone: '999',
      website_url: 'x',
      digital_health_score: 40,
      audited_at: '2026-06-01T00:00:00Z',
    })
    expect(pickSurvivor([worked, rich]).id).toBe('worked')
    expect(richness(worked)).toBeGreaterThan(richness(rich))
  })

  it('breaks ties on age, then deterministically on id', () => {
    const older = lead({ id: 'z', created_at: '2026-01-01T00:00:00Z' })
    const newer = lead({ id: 'a', created_at: '2026-07-01T00:00:00Z' })
    expect(pickSurvivor([newer, older]).id).toBe('z')

    const same1 = lead({ id: 'b' })
    const same2 = lead({ id: 'a' })
    // Order of input must not change the answer — a dry run has to nominate
    // the same survivor the live run will.
    expect(pickSurvivor([same1, same2]).id).toBe(pickSurvivor([same2, same1]).id)
  })

  it('never lists the survivor among the duplicates', () => {
    const [group] = findIdentityDuplicates([lead({ id: 'a' }), lead({ id: 'b' })])
    expect(group.duplicateIds).not.toContain(group.survivorId)
  })
})

describe('contact collisions', () => {
  it('matches phones regardless of formatting', () => {
    expect(normalisePhone('+51 999 111 222')).toBe(normalisePhone('51999111222'))
    const groups = findContactCollisions([
      lead({ id: 'a', name: 'One', phone: '+51 999 111 222' }),
      lead({ id: 'b', name: 'Two', phone: '51999111222' }),
    ])
    expect(groups.some((g) => g.reason === 'phone' && g.size === 2)).toBe(true)
  })

  it('is reported separately from identity, since a shared line may be a chain', () => {
    const leads = [
      lead({ id: 'a', name: 'Branch One', district: 'Lince', phone: '999' }),
      lead({ id: 'b', name: 'Branch Two', district: 'Surco', phone: '999' }),
    ]
    expect(findIdentityDuplicates(leads)).toHaveLength(0)
    expect(findContactCollisions(leads)).toHaveLength(1)
  })

  it('ignores blank contact points', () => {
    expect(
      findContactCollisions([lead({ id: 'a' }), lead({ id: 'b' })]),
    ).toHaveLength(0)
  })
})

describe('dedupeReport', () => {
  it('counts what a merge would actually remove', () => {
    const r = dedupeReport([
      lead({ id: 'a' }),
      lead({ id: 'b' }),
      lead({ id: 'c' }),
      lead({ id: 'd', name: 'Distinct Cafe' }),
    ])
    expect(r.totalLeads).toBe(4)
    expect(r.mergeableRows).toBe(2)
    expect(r.distinctAfterMerge).toBe(2)
  })
})
