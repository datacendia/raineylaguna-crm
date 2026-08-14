/**
 * Measurement maturity tests.
 *
 * The invariant worth defending here is the tri-state rule. A site that blocks
 * the crawler must never score the same as a site we read and found empty —
 * collapsing those two is what made the Opportunity Radar useless. Most of
 * these tests exist to keep that distinction alive under future edits.
 */
import { describe, it, expect } from 'vitest'
import {
  detectSignals,
  unknownSignals,
  scoreDetected,
  scoreFull,
  scorePractice,
  contradictions,
  bandFor,
  BANDS,
  DIMENSION_KEYS,
  type MeasurementSignals,
} from './measurement'

const bare = '<html><head></head><body><p>hola</p></body></html>'

const rich = `<html><head>
  <meta name="viewport" content="width=device-width">
  <meta name="google-site-verification" content="abc123">
  <script src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234567"></script>
  <script>gtag('config','G-ABC1234567')</script>
</head><body>
  <form><input type="email"><textarea></textarea></form>
  <script>gtag('event','submit')</script>
  <a href="https://wa.me/51999888777">WhatsApp</a>
  <a href="tel:+51999888777">Llamar</a>
  <a href="https://instagram.com/negocio">IG</a>
  <a href="https://google.com/maps/place/negocio">Mapa</a>
  <a href="/promo?utm_source=instagram&utm_medium=bio">Promo</a>
  <a href="/politica-de-privacidad">Privacidad</a>
  <div id="cookieconsent">Aceptar cookies</div>
</body></html>`

describe('detectSignals', () => {
  it('finds nothing on a bare page, but reports false rather than unknown', () => {
    const s = detectSignals(bare, 'https://x.pe')
    expect(s.analyticsTag).toBe(false)
    expect(s.tagManager).toBe(false)
    expect(s.utmUsage).toBe(false)
    // https is genuinely checkable from the URL alone
    expect(s.https).toBe(true)
  })

  it('finds a full stack on an instrumented page', () => {
    const s = detectSignals(rich, 'https://x.pe')
    expect(s.analyticsTag).toBe(true)
    expect(s.ga4Id).toBe(true)
    expect(s.contactForm).toBe(true)
    expect(s.formTrackable).toBe(true)
    expect(s.whatsappLink).toBe(true)
    expect(s.directContactLink).toBe(true)
    expect(s.utmUsage).toBe(true)
    expect(s.socialLinked).toBe(true)
    expect(s.businessProfileLinked).toBe(true)
    expect(s.searchConsoleMeta).toBe(true)
    expect(s.consentMechanism).toBe(true)
    expect(s.privacyPolicy).toBe(true)
  })

  it('leaves form-trackability unknown when there is no form to judge', () => {
    expect(detectSignals(bare, 'https://x.pe').formTrackable).toBeNull()
  })

  it('leaves duplicate-tag unknown when no tag exists at all', () => {
    expect(detectSignals(bare, 'https://x.pe').singleTagInstance).toBeNull()
  })

  it('flags competing tag ids as a real fault', () => {
    const two = `<script>gtag('config','G-AAAAAAAAAA')</script>
                 <script>gtag('config','G-BBBBBBBBBB')</script>`
    expect(detectSignals(two, 'https://x.pe').singleTagInstance).toBe(false)
    const one = `<script>gtag('config','G-AAAAAAAAAA')</script>`
    expect(detectSignals(one, 'https://x.pe').singleTagInstance).toBe(true)
  })

  it('marks http as insecure', () => {
    expect(detectSignals(bare, 'http://x.pe').https).toBe(false)
  })
})

describe('tri-state scoring — the Opportunity Radar guard', () => {
  it('excludes unknown signals from the denominator instead of scoring them zero', () => {
    const all: MeasurementSignals = detectSignals(rich, 'https://x.pe')
    const full = scoreDetected(all)

    // Same site, but half of dimension 3 was unreadable.
    const partial: MeasurementSignals = { ...all, utmUsage: null, socialLinked: null }
    const partialScore = scoreDetected(partial)

    // Unknowns must not drag the score down — a perfect site stays perfect.
    expect(partialScore.score).toBe(full.score)
    // ...but coverage must fall, so the caller knows less was seen.
    expect(partialScore.coverage).toBeLessThan(full.coverage)
  })

  it('scores an unreadable site as unreadable, not as zero-with-confidence', () => {
    const r = scoreDetected(unknownSignals(), 'timeout')
    expect(r.unreadable).toBe('timeout')
    expect(r.coverage).toBe(0)
  })

  it('distinguishes a read-and-empty site from an unread one', () => {
    const empty = scoreDetected(detectSignals(bare, 'https://x.pe'))
    const unread = scoreDetected(unknownSignals(), 'dns')
    expect(empty.unreadable).toBeNull()
    // 13/15 — formTrackable and singleTagInstance are genuinely unknowable on a
    // page with no form and no tag, so they stay null rather than scoring false.
    expect(empty.coverage).toBeCloseTo(13 / 15, 2)
    expect(unread.unreadable).toBe('dns')
    expect(unread.coverage).toBe(0)
  })

  it('a fully instrumented site scores far above a bare one', () => {
    const hi = scoreDetected(detectSignals(rich, 'https://x.pe')).score
    const lo = scoreDetected(detectSignals(bare, 'https://x.pe')).score
    expect(hi).toBeGreaterThan(lo + 40)
  })
})

describe('bands', () => {
  it('covers 0-100 with no gap and no overlap', () => {
    for (let n = 0; n <= 100; n++) expect(BANDS.filter((b) => n >= b.min && n <= b.max)).toHaveLength(1)
  })
  it('maps boundaries to the expected band', () => {
    expect(bandFor(0)).toBe('ciego')
    expect(bandFor(20)).toBe('ciego')
    expect(bandFor(21)).toBe('instalado')
    expect(bandFor(45)).toBe('instalado')
    expect(bandFor(46)).toBe('midiendo')
    expect(bandFor(70)).toBe('midiendo')
    expect(bandFor(71)).toBe('optimizando')
    expect(bandFor(100)).toBe('optimizando')
  })
})

describe('dimensions', () => {
  it('every declared signal key belongs to exactly one dimension', () => {
    const keys = Object.values(DIMENSION_KEYS).flat()
    expect(new Set(keys).size).toBe(keys.length)
    const declared = Object.keys(unknownSignals())
    expect([...keys].sort()).toEqual([...declared].sort())
  })
})

describe('practice (declared)', () => {
  it('rewards knowing your own numbers', () => {
    const good = scorePractice({
      enquiryVolume: 12,
      checksStats: 'regularly',
      actedOnData: 'yes',
      customerValueSoles: 400,
    })
    expect(good.points).toBe(20)
  })
  it('scores zero when the owner knows none of it', () => {
    const bad = scorePractice({
      enquiryVolume: null,
      checksStats: 'none-exist',
      actedOnData: 'no',
      customerValueSoles: null,
    })
    expect(bad.points).toBe(0)
  })
  it('ignores unanswered questions rather than counting them wrong', () => {
    expect(scorePractice({ checksStats: 'regularly' }).points).toBe(20)
    expect(scorePractice({}).checked).toBe(0)
  })
})

describe('contradictions', () => {
  const blind = detectSignals(bare, 'https://x.pe')

  it('catches "I get enquiries" against a form that records nothing', () => {
    const withForm: MeasurementSignals = { ...blind, contactForm: true, formTrackable: false }
    const c = contradictions(withForm, { contactRoute: 'email' })
    expect(c.map((x) => x.id)).toContain('enquiries_untracked')
  })

  it('catches "I check my stats" against a site with no analytics', () => {
    const c = contradictions(blind, { checksStats: 'regularly' })
    expect(c.map((x) => x.id)).toContain('no_stats_to_check')
  })

  it('catches ad spend on an unmeasured site, and names the amount', () => {
    const c = contradictions(blind, { adSpendSoles: 800 })
    const hit = c.find((x) => x.id === 'spend_unmeasured')
    expect(hit).toBeDefined()
    expect(hit!.es).toContain('800')
    expect(hit!.en).toContain('800')
  })

  it('stays quiet when belief and evidence agree', () => {
    const good = detectSignals(rich, 'https://x.pe')
    expect(contradictions(good, { contactRoute: 'email', checksStats: 'regularly', attributesAds: 'yes' })).toHaveLength(0)
  })

  it('is bilingual for every finding it can produce', () => {
    const withForm: MeasurementSignals = { ...blind, contactForm: true, formTrackable: false }
    const c = contradictions(withForm, {
      contactRoute: 'email',
      checksStats: 'regularly',
      bestChannel: 'instagram',
      attributesAds: 'yes',
      adSpendSoles: 500,
    })
    expect(c.length).toBeGreaterThanOrEqual(4)
    for (const x of c) {
      expect(x.es.length).toBeGreaterThan(20)
      expect(x.en.length).toBeGreaterThan(20)
    }
  })
})

describe('scoreFull', () => {
  it('is no longer provisional and spans all five dimensions', () => {
    const r = scoreFull(detectSignals(rich, 'https://x.pe'), {
      enquiryVolume: 10,
      checksStats: 'regularly',
      actedOnData: 'yes',
      customerValueSoles: 300,
    })
    expect(r.provisional).toBe(false)
    expect(r.dimensions).toHaveLength(5)
    expect(r.score).toBeGreaterThan(80)
  })

  it('drops a well-instrumented site when nobody actually looks at the data', () => {
    const signals = detectSignals(rich, 'https://x.pe')
    const engaged = scoreFull(signals, { checksStats: 'regularly', actedOnData: 'yes' }).score
    const absent = scoreFull(signals, { checksStats: 'no', actedOnData: 'no' }).score
    expect(engaged).toBeGreaterThan(absent)
  })
})
