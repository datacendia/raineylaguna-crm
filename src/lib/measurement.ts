/**
 * Measurement maturity detection ("Sonda").
 *
 * Scores how well a business can see its own funnel, from signals visible in
 * the HTML its site already serves. No account access, no second crawl — the
 * caller passes HTML that `src/lib/audit.ts` has already fetched.
 *
 * THE RULE THAT MATTERS: every signal is tri-state.
 *
 *   true  — checked, present
 *   false — checked, absent
 *   null  — could not check
 *
 * `audit.ts#fetchHtml` returns null for a timeout, a 403 and a healthy site
 * with no analytics alike. Scoring those the same way is exactly how the
 * Opportunity Radar failed: a blocked site looked identical to a broken one,
 * everything scored the same, and the number carried no information. Here,
 * unknown signals are excluded from both numerator and denominator, so a site
 * we could only half-read yields a score over what we actually saw, plus a
 * `coverage` figure telling you how much that was.
 */

export type Tri = boolean | null

export type MeasurementSignals = {
  // Dimension 1 — tracking foundation
  analyticsTag: Tri
  tagManager: Tri
  ga4Id: Tri
  singleTagInstance: Tri
  // Dimension 2 — conversion visibility
  contactForm: Tri
  formTrackable: Tri
  whatsappLink: Tri
  directContactLink: Tri
  // Dimension 3 — channel attribution
  utmUsage: Tri
  socialLinked: Tri
  businessProfileLinked: Tri
  searchConsoleMeta: Tri
  // Dimension 4 — data quality & compliance
  consentMechanism: Tri
  privacyPolicy: Tri
  https: Tri
}

export type FetchFailure =
  | 'dns'
  | 'refused'
  | 'timeout'
  | 'tls'
  | 'http-error'
  | 'not-html'
  | 'no-url'

export type DimensionId = 'foundation' | 'conversion' | 'attribution' | 'quality' | 'practice'

export const DIMENSION_KEYS: Record<Exclude<DimensionId, 'practice'>, (keyof MeasurementSignals)[]> = {
  foundation: ['analyticsTag', 'tagManager', 'ga4Id', 'singleTagInstance'],
  conversion: ['contactForm', 'formTrackable', 'whatsappLink', 'directContactLink'],
  attribution: ['utmUsage', 'socialLinked', 'businessProfileLinked', 'searchConsoleMeta'],
  quality: ['consentMechanism', 'privacyPolicy', 'https'],
}

/** Points per dimension. Five dimensions, 20 each. */
export const DIMENSION_POINTS = 20
/** Detection covers four of the five; "practice" is declared-only. */
export const DETECTED_MAX = DIMENSION_POINTS * 4

export type BandId = 'ciego' | 'instalado' | 'midiendo' | 'optimizando'

/**
 * Band thresholds over the 0-100 provisional score.
 *
 * CALIBRATED 2026-08-13 — `npx tsx scripts/calibrate-measurement.ts --limit 200`
 * against live leads. Result: 164/200 readable, min 0 / median 38 / max 73,
 * sd 19.0, 33 distinct scores. Occupancy ciego 18.3% · instalado 43.3% ·
 * midiendo 32.9% · optimizando 5.5%. Largest band 43%, so the cuts separate
 * the population rather than collapsing it — the gate the Opportunity Radar
 * failed.
 *
 * Two things the run settled, worth keeping in view:
 *   - Nothing scored above 73. `optimizando` is close to empty in this market,
 *     which matches the spec's warning that Tier 4 is mostly theoretical here.
 *   - Only 41.5% of readable sites run any analytics and 15.2% have GA4, so
 *     most of the population sits low by fact, not by harsh weighting.
 *
 * Do not hand-tune these without re-running the script. The point is that the
 * cuts fall where the population actually separates, not where they look tidy.
 */
export const BANDS: { id: BandId; min: number; max: number; label: string }[] = [
  { id: 'ciego', min: 0, max: 20, label: 'Ciego' },
  { id: 'instalado', min: 21, max: 45, label: 'Instalado' },
  { id: 'midiendo', min: 46, max: 70, label: 'Midiendo' },
  { id: 'optimizando', min: 71, max: 100, label: 'Optimizando' },
]

export function bandFor(score: number): BandId {
  for (const b of BANDS) if (score >= b.min && score <= b.max) return b.id
  return score < 0 ? 'ciego' : 'optimizando'
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const rx = {
  gtm: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i,
  gtagLoader: /googletagmanager\.com\/gtag\/js|gtag\s*\(/i,
  ga4Id: /\bG-[A-Z0-9]{6,}\b/,
  uaId: /\bUA-\d{4,}-\d+\b/,
  legacyGa: /google-analytics\.com|analytics\.js/i,
  otherAnalytics: /fbq\s*\(|mixpanel|hotjar|clarity\.ms|plausible|umami|matomo|piwik/i,
  form: /<form[\s>]/i,
  formish: /type=["']email["']|type=["']tel["']|<textarea[\s>]/i,
  formTracked: /data-(gtm|ga|event|analytics)|onsubmit=|gtag\s*\(\s*['"]event|dataLayer\.push|fbq\s*\(\s*['"]track/i,
  thanks: /href=["'][^"']*(gracias|thank-you|thankyou|thanks)[^"']*["']/i,
  whatsapp: /wa\.me\/|api\.whatsapp\.com|web\.whatsapp\.com/i,
  tel: /href=["']tel:/i,
  mailto: /href=["']mailto:/i,
  utm: /[?&]utm_(source|medium|campaign)=/i,
  social: /instagram\.com\/|facebook\.com\/|tiktok\.com\/|linkedin\.com\//i,
  gbp: /google\.com\/maps|maps\.app\.goo\.gl|g\.page\/|goo\.gl\/maps/i,
  gsc: /name=["']google-site-verification["']/i,
  consent: /cookieconsent|cookie-consent|cookiebot|onetrust|osano|termly|iubenda|klaro|tarteaucitron|gdpr|aceptar\s+cookies|accept\s+cookies|pol[ií]tica\s+de\s+cookies/i,
  privacy: /href=["'][^"']*(privacidad|privacy|proteccion-de-datos|data-protection)[^"']*["']/i,
}

/** Count distinct GA property ids present. >1 means duplicate/competing tags. */
function distinctTagIds(html: string): number {
  const ids = new Set<string>()
  for (const m of html.matchAll(/\bG-[A-Z0-9]{6,}\b/g)) ids.add(m[0])
  for (const m of html.matchAll(/\bUA-\d{4,}-\d+\b/g)) ids.add(m[0])
  for (const m of html.matchAll(/\bGTM-[A-Z0-9]{4,}\b/g)) ids.add(m[0])
  return ids.size
}

/**
 * Detect measurement signals from already-fetched homepage HTML.
 *
 * Everything here is decidable from one page, so it costs nothing beyond the
 * fetch the audit already performs. Signals that genuinely cannot be settled
 * from the homepage alone stay `null` rather than guessing `false`.
 */
export function detectSignals(html: string, finalUrl: string): MeasurementSignals {
  const anyGa = rx.gtagLoader.test(html) || rx.legacyGa.test(html) || rx.ga4Id.test(html)
  const analyticsTag = anyGa || rx.gtm.test(html) || rx.otherAnalytics.test(html)
  const tagManager = rx.gtm.test(html)
  const ga4Id = rx.ga4Id.test(html)

  // Only meaningful when at least one tag exists; otherwise "duplicates" is
  // not a question we can answer, so leave it unknown rather than free points.
  const ids = distinctTagIds(html)
  const singleTagInstance: Tri = analyticsTag ? ids <= 1 : null

  const contactForm = rx.form.test(html) || rx.formish.test(html)
  // A form we cannot see cannot be judged trackable.
  const formTrackable: Tri = contactForm
    ? rx.formTracked.test(html) || rx.thanks.test(html)
    : null

  return {
    analyticsTag,
    tagManager,
    ga4Id,
    singleTagInstance,
    contactForm,
    formTrackable,
    whatsappLink: rx.whatsapp.test(html),
    directContactLink: rx.tel.test(html) || rx.mailto.test(html),
    utmUsage: rx.utm.test(html),
    socialLinked: rx.social.test(html),
    businessProfileLinked: rx.gbp.test(html),
    searchConsoleMeta: rx.gsc.test(html),
    consentMechanism: rx.consent.test(html),
    privacyPolicy: rx.privacy.test(html),
    https: finalUrl.startsWith('https://'),
  }
}

/** Every signal unknown — used when the site could not be read at all. */
export function unknownSignals(): MeasurementSignals {
  const keys = Object.values(DIMENSION_KEYS).flat()
  const out = {} as MeasurementSignals
  for (const k of keys) out[k] = null
  return out
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type DimensionScore = {
  id: DimensionId
  /** 0-20, scaled over the signals we could actually check. */
  points: number
  checked: number
  checkable: number
}

export type MeasurementResult = {
  /** 0-100. Provisional when no declared answers are supplied. */
  score: number
  band: BandId
  dimensions: DimensionScore[]
  /** Share of detected signals we could actually evaluate, 0-1. */
  coverage: number
  /** True when the score comes from detection alone (no questionnaire yet). */
  provisional: boolean
  /** Set when the site could not be read; score is meaningless, band is null. */
  unreadable: FetchFailure | null
}

function scoreDimension(id: Exclude<DimensionId, 'practice'>, s: MeasurementSignals): DimensionScore {
  const keys = DIMENSION_KEYS[id]
  let checked = 0
  let earned = 0
  for (const k of keys) {
    const v = s[k]
    if (v === null) continue // could not check - excluded from both sides
    checked += 1
    if (v) earned += 1
  }
  // No signal readable in this dimension => 0 points but 0 checkable, so the
  // caller can tell "scored zero" from "learned nothing".
  const points = checked === 0 ? 0 : (earned / checked) * DIMENSION_POINTS
  return { id, points, checked, checkable: keys.length }
}

/**
 * Score detection only (product Tier 0 — the free hook).
 *
 * The four detected dimensions are worth 80 of 100; the fifth ("decision
 * practice") needs the questionnaire. Rather than report out of 80 and look
 * artificially harsh, the provisional score is scaled to 100 and flagged.
 */
export function scoreDetected(
  signals: MeasurementSignals,
  unreadable: FetchFailure | null = null,
): MeasurementResult {
  const dims = (Object.keys(DIMENSION_KEYS) as Exclude<DimensionId, 'practice'>[]).map((id) =>
    scoreDimension(id, signals),
  )
  const raw = dims.reduce((a, d) => a + d.points, 0) // 0..80
  const totalChecked = dims.reduce((a, d) => a + d.checked, 0)
  const totalCheckable = dims.reduce((a, d) => a + d.checkable, 0)
  const score = Math.round((raw / DETECTED_MAX) * 100)
  return {
    score: unreadable ? 0 : score,
    band: bandFor(unreadable ? 0 : score),
    dimensions: dims,
    coverage: totalCheckable === 0 ? 0 : totalChecked / totalCheckable,
    provisional: true,
    unreadable,
  }
}

// ---------------------------------------------------------------------------
// Declared answers (Tier 1 — the questionnaire)
// ---------------------------------------------------------------------------

/**
 * Eight questions, no more. Every extra question costs completion rate.
 *
 * Four of them (enquiryVolume, checksStats, actedOnData, knowsCustomerValue)
 * score dimension 5, "decision practice" — the one no crawler can see and the
 * one that usually scores worst. adSpend and knowsCustomerValue also supply the
 * economics that let the report quantify the gap in soles instead of percentages.
 */
export type DeclaredAnswers = {
  /** Q1 How do you find out someone contacted you? */
  contactRoute?: 'email' | 'whatsapp' | 'phone' | 'unsure'
  /** Q2 Roughly how many website enquiries last month? (null = doesn't know) */
  enquiryVolume?: number | null
  /** Q3 Which channel brings the most customers? */
  bestChannel?: 'google' | 'instagram' | 'referral' | 'walkin' | 'unknown'
  /** Q4 Has anyone looked at the site statistics in the last 3 months? */
  checksStats?: 'regularly' | 'once-or-twice' | 'no' | 'none-exist'
  /** Q5 Ever changed something because of what the data showed? */
  actedOnData?: 'yes' | 'no' | 'na'
  /** Q6 Do you know what one new customer is worth? (null = doesn't know) */
  customerValueSoles?: number | null
  /** Q7 Monthly ad spend in soles (0 = none, null = doesn't know) */
  adSpendSoles?: number | null
  /** Q8 Can you tell which ads produced customers? */
  attributesAds?: 'yes' | 'no' | 'na'
}

/** Dimension 5 out of 20, from the four questions that measure practice. */
export function scorePractice(d: DeclaredAnswers): DimensionScore {
  const marks: boolean[] = []
  if (d.enquiryVolume !== undefined) marks.push(d.enquiryVolume !== null)
  if (d.checksStats !== undefined) marks.push(d.checksStats === 'regularly')
  if (d.actedOnData !== undefined) marks.push(d.actedOnData === 'yes')
  if (d.customerValueSoles !== undefined) marks.push(d.customerValueSoles !== null)
  const checked = marks.length
  const earned = marks.filter(Boolean).length
  return {
    id: 'practice',
    points: checked === 0 ? 0 : (earned / checked) * DIMENSION_POINTS,
    checked,
    checkable: 4,
  }
}

/**
 * A gap between what the owner believes and what the site does.
 *
 * This is the product. "You believe you're tracking enquiries; the site isn't
 * recording them" sells the engagement on its own, because the owner has just
 * discovered the gap themselves rather than being told they have a problem.
 *
 * Detection always wins over the declared answer — never the other way round.
 */
export type Contradiction = { id: string; es: string; en: string }

export function contradictions(
  s: MeasurementSignals,
  d: DeclaredAnswers,
): Contradiction[] {
  const out: Contradiction[] = []

  if ((d.contactRoute === 'email' || d.contactRoute === 'whatsapp') && s.formTrackable === false) {
    out.push({
      id: 'enquiries_untracked',
      es: 'Crees que las consultas quedan registradas; el formulario del sitio no está guardando ninguna.',
      en: "You believe enquiries are being recorded; the site's form isn't saving any of them.",
    })
  }
  if (d.checksStats === 'regularly' && s.analyticsTag === false) {
    out.push({
      id: 'no_stats_to_check',
      es: 'Dices que revisas las estadísticas cada mes, pero el sitio no tiene ninguna herramienta de analítica instalada.',
      en: "You say you check the statistics monthly, but the site has no analytics tool installed at all.",
    })
  }
  if (d.bestChannel && d.bestChannel !== 'unknown' && s.analyticsTag === false && s.utmUsage === false) {
    out.push({
      id: 'channel_unverifiable',
      es: 'Tienes una idea de qué canal trae más clientes, pero nada en el sitio puede confirmarla ni desmentirla.',
      en: 'You have a view on which channel brings most customers, but nothing on the site can confirm or disprove it.',
    })
  }
  if (d.attributesAds === 'yes' && (s.utmUsage === false || s.analyticsTag === false)) {
    out.push({
      id: 'ads_unattributable',
      es: 'Crees poder atribuir la publicidad, pero los enlaces no llevan marcas de campaña, así que las visitas pagadas llegan sin nombre.',
      en: 'You believe you can attribute your advertising, but the links carry no campaign tags, so paid visits arrive anonymous.',
    })
  }
  if ((d.adSpendSoles ?? 0) > 0 && s.analyticsTag === false) {
    out.push({
      id: 'spend_unmeasured',
      es: `Gastas S/ ${d.adSpendSoles} al mes en atraer gente a un sitio que no mide si llegan.`,
      en: `You spend S/ ${d.adSpendSoles} a month bringing people to a site that doesn't measure whether they arrive.`,
    })
  }
  return out
}

/** Full 0-100 score: four detected dimensions plus declared practice. */
export function scoreFull(
  signals: MeasurementSignals,
  declared: DeclaredAnswers,
  unreadable: FetchFailure | null = null,
): MeasurementResult & { contradictions: Contradiction[] } {
  const base = scoreDetected(signals, unreadable)
  const practice = scorePractice(declared)
  const dims = [...base.dimensions, practice]
  const raw = dims.reduce((a, d) => a + d.points, 0) // 0..100
  const score = unreadable ? 0 : Math.round(raw)
  return {
    ...base,
    score,
    band: bandFor(score),
    dimensions: dims,
    provisional: false,
    contradictions: contradictions(signals, declared),
  }
}
