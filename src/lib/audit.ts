import type {
  AuditFindings,
  AuditFlag,
  AuditScores,
} from './types'

/**
 * Digital Presence Audit engine.
 *
 * Given a lead's website, produces a 0-100 Digital Health Score (higher =
 * healthier site, lower = bigger sales opportunity) plus concrete findings
 * that feed the leads list, the detail page, and the AI outreach drafter.
 *
 * Two free signal sources, no fabrication:
 *   1. Google PageSpeed Insights (Lighthouse-as-a-service) — performance, SEO,
 *      accessibility, best-practices scores + LCP. Free; an API key raises the
 *      quota but is optional.
 *   2. Homepage HTML heuristics — HTTPS, mobile viewport, structured data,
 *      analytics, stale copyright year.
 *
 * The scoring (`computeHealth`) and HTML parsing (`analyzeHtml`) are pure and
 * unit-tested; the network calls are isolated in `fetchPageSpeed` /
 * `fetchHtml` and orchestrated by `auditWebsite`.
 */

const SOCIAL_HOST_RE =
  /(?:facebook\.com|instagram\.com|linktr\.ee|linktree|tiktok\.com|linkedin\.com|wa\.me|whatsapp\.com|business\.site)/i

const PAGESPEED_ENDPOINT =
  'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

const PAGESPEED_TIMEOUT_MS = 30000
const HTML_TIMEOUT_MS = 8000

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** The structured signals that drive the score. Pure input to computeHealth. */
export type AuditSignals = {
  hasSite: boolean
  socialOnly: boolean
  reachable: boolean
  https: boolean
  mobileViewport: boolean
  structuredData: boolean
  analytics: boolean
  staleCopyright: boolean
  lighthouse: AuditScores
  lcpMs: number | null
}

const emptyScores = (): AuditScores => ({
  performance: null,
  seo: null,
  accessibility: null,
  bestPractices: null,
})

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n))

const hasLighthouse = (s: AuditScores): boolean =>
  s.performance !== null ||
  s.seo !== null ||
  s.accessibility !== null ||
  s.bestPractices !== null

/** Weighted average over the Lighthouse categories that are present (0-100). */
function lighthouseBase(s: AuditScores): number {
  const parts: Array<[number | null, number]> = [
    [s.performance, 0.4],
    [s.seo, 0.25],
    [s.bestPractices, 0.2],
    [s.accessibility, 0.15],
  ]
  let sum = 0
  let weight = 0
  for (const [val, w] of parts) {
    if (val !== null) {
      sum += val * w
      weight += w
    }
  }
  return weight === 0 ? 50 : sum / weight
}

/**
 * Pure: turn a set of signals into a Digital Health Score + flags + summary.
 * Deterministic — no I/O — so it can be unit-tested exhaustively.
 */
export function computeHealth(signals: AuditSignals): AuditFindings {
  const {
    hasSite,
    socialOnly,
    reachable,
    https,
    mobileViewport,
    structuredData,
    analytics,
    staleCopyright,
    lighthouse,
    lcpMs,
  } = signals

  const flags: AuditFlag[] = []
  const findings = (score: number, summary: string): AuditFindings => ({
    score: clamp(Math.round(score), 0, 100),
    hadSite: hasSite,
    reachable,
    scores: lighthouse,
    metrics: { lcpMs },
    flags,
    summary,
  })

  if (!hasSite) {
    flags.push({
      id: 'no_website',
      label: 'No website at all',
      severity: 'high',
    })
    return findings(0, 'No website — maximum opportunity')
  }

  if (socialOnly) {
    flags.push({
      id: 'social_only',
      label: 'Only a social page, no real website',
      severity: 'high',
    })
    return findings(15, 'No real website — only a social profile')
  }

  if (!reachable) {
    flags.push({
      id: 'site_unreachable',
      label: 'Website did not respond when audited',
      severity: 'high',
    })
    return findings(10, 'Website did not respond when audited')
  }

  const lh = hasLighthouse(lighthouse)
  const base = lh ? lighthouseBase(lighthouse) : 50

  // Heuristic penalties. When Lighthouse data is present we halve them to
  // avoid double-counting (Lighthouse already scores HTTPS/perf), but still
  // let the heuristics nudge the result.
  let penalty = 0
  if (!https) penalty += 12
  if (!mobileViewport) penalty += 12
  if (staleCopyright) penalty += 5
  if (!structuredData) penalty += 4
  if (!analytics) penalty += 2
  if (lh) penalty = Math.round(penalty / 2)

  const score = clamp(base - penalty, 0, 100)

  // Build flags (shown even when the site is healthy, so reps see what to pitch).
  if (!https)
    flags.push({ id: 'no_https', label: 'No HTTPS / not secure', severity: 'high' })
  if (!mobileViewport)
    flags.push({ id: 'not_mobile', label: 'Not mobile-friendly', severity: 'high' })
  if (lcpMs !== null && lcpMs > 4000)
    flags.push({
      id: 'slow_lcp',
      label: `Slow load (LCP ${(lcpMs / 1000).toFixed(1)}s)`,
      severity: lcpMs > 6000 ? 'high' : 'medium',
    })
  if (lighthouse.performance !== null && lighthouse.performance < 50)
    flags.push({
      id: 'poor_performance',
      label: `Poor performance (${lighthouse.performance}/100)`,
      severity: 'high',
    })
  if (lighthouse.seo !== null && lighthouse.seo < 70)
    flags.push({
      id: 'weak_seo',
      label: `Weak SEO (${lighthouse.seo}/100)`,
      severity: 'medium',
    })
  if (staleCopyright)
    flags.push({
      id: 'stale',
      label: 'Outdated (stale copyright year)',
      severity: 'medium',
    })
  if (lighthouse.accessibility !== null && lighthouse.accessibility < 70)
    flags.push({
      id: 'weak_accessibility',
      label: `Accessibility issues (${lighthouse.accessibility}/100)`,
      severity: 'low',
    })
  if (!structuredData)
    flags.push({
      id: 'no_structured_data',
      label: 'No structured data / social preview tags',
      severity: 'low',
    })
  if (!analytics)
    flags.push({ id: 'no_analytics', label: 'No analytics installed', severity: 'low' })

  const top = flags
    .filter((f) => f.severity !== 'low')
    .slice(0, 3)
    .map((f) => f.label)
  const summary = `Health ${clamp(Math.round(score), 0, 100)}/100${
    top.length ? ` — ${top.join(', ')}` : ' — solid web presence'
  }`

  return findings(score, summary)
}

/** Pure: derive heuristic signals from homepage HTML + the final (post-redirect) URL. */
export function analyzeHtml(
  html: string,
  finalUrl: string,
  now: Date = new Date(),
): Pick<
  AuditSignals,
  'https' | 'mobileViewport' | 'structuredData' | 'analytics' | 'staleCopyright'
> {
  const https = finalUrl.startsWith('https://')
  const mobileViewport = /<meta[^>]+name=["']viewport["']/i.test(html)
  const structuredData =
    /application\/ld\+json/i.test(html) || /property=["']og:/i.test(html)
  const analytics =
    /gtag\(|googletagmanager\.com|google-analytics\.com|analytics\.js|fbq\(|mixpanel|hotjar/i.test(
      html,
    )

  // Stale copyright: find a year near ©/copyright; stale if older than last year.
  let staleCopyright = false
  const copyRe = /(?:©|&copy;|copyright)[^0-9]{0,12}(\d{4})(?:\s*[-–]\s*(\d{4}))?/gi
  let m: RegExpExecArray | null
  let latest = 0
  while ((m = copyRe.exec(html)) !== null) {
    const year = parseInt(m[2] ?? m[1], 10)
    if (year >= 1990 && year <= now.getFullYear() + 1) latest = Math.max(latest, year)
  }
  if (latest && latest < now.getFullYear() - 1) staleCopyright = true

  return { https, mobileViewport, structuredData, analytics, staleCopyright }
}

type PageSpeedResult = { scores: AuditScores; lcpMs: number | null }

/** Call PageSpeed Insights for one URL. Returns null if the call fails. */
export async function fetchPageSpeed(
  url: string,
  apiKey?: string,
): Promise<PageSpeedResult | null> {
  const params = new URLSearchParams({ url, strategy: 'mobile' })
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices'])
    params.append('category', c)
  if (apiKey) params.set('key', apiKey)

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), PAGESPEED_TIMEOUT_MS)
  try {
    const res = await fetch(`${PAGESPEED_ENDPOINT}?${params}`, {
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      lighthouseResult?: {
        categories?: Record<string, { score?: number | null } | undefined>
        audits?: Record<string, { numericValue?: number } | undefined>
      }
    }
    const cats = data.lighthouseResult?.categories
    if (!cats) return null
    const pct = (c?: { score?: number | null }): number | null =>
      c && typeof c.score === 'number' ? Math.round(c.score * 100) : null
    const lcpRaw =
      data.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue
    return {
      scores: {
        performance: pct(cats.performance),
        seo: pct(cats.seo),
        accessibility: pct(cats.accessibility),
        bestPractices: pct(cats['best-practices']),
      },
      lcpMs: typeof lcpRaw === 'number' ? Math.round(lcpRaw) : null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

type HtmlResult = { html: string; finalUrl: string }

/** Fetch homepage HTML, following redirects. Returns null on any failure. */
export async function fetchHtml(url: string): Promise<HtmlResult | null> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), HTML_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html')) return null
    return { html: await res.text(), finalUrl: res.url || url }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function normalizeUrl(raw: string): string {
  const u = raw.trim()
  if (/^https?:\/\//i.test(u)) return u
  return `https://${u}`
}

/**
 * Audit a single lead's website end-to-end. Runs PageSpeed + HTML fetch in
 * parallel, then scores. Never throws — failures degrade to a low/unreachable
 * result so a batch run can continue.
 */
export async function auditWebsite(input: {
  websiteUrl: string | null
  apiKey?: string
}): Promise<AuditFindings> {
  const raw = input.websiteUrl?.trim() ?? ''
  if (!raw) {
    return computeHealth({
      hasSite: false,
      socialOnly: false,
      reachable: false,
      https: false,
      mobileViewport: false,
      structuredData: false,
      analytics: false,
      staleCopyright: false,
      lighthouse: emptyScores(),
      lcpMs: null,
    })
  }

  if (SOCIAL_HOST_RE.test(raw)) {
    return computeHealth({
      hasSite: true,
      socialOnly: true,
      reachable: false,
      https: raw.startsWith('https://'),
      mobileViewport: false,
      structuredData: false,
      analytics: false,
      staleCopyright: false,
      lighthouse: emptyScores(),
      lcpMs: null,
    })
  }

  const url = normalizeUrl(raw)
  const [ps, page] = await Promise.all([
    fetchPageSpeed(url, input.apiKey),
    fetchHtml(url),
  ])

  const reachable = ps !== null || page !== null
  const html = page
    ? analyzeHtml(page.html, page.finalUrl)
    : {
        https: url.startsWith('https://'),
        mobileViewport: false,
        structuredData: false,
        analytics: false,
        staleCopyright: false,
      }

  return computeHealth({
    hasSite: true,
    socialOnly: false,
    reachable,
    ...html,
    lighthouse: ps?.scores ?? emptyScores(),
    lcpMs: ps?.lcpMs ?? null,
  })
}

/** Tailwind tokens for a health badge — green healthy, red = opportunity. */
export function healthColor(score: number): { bg: string; text: string } {
  if (score >= 70) return { bg: 'bg-green-100', text: 'text-green-800' }
  if (score >= 40) return { bg: 'bg-amber-100', text: 'text-amber-900' }
  return { bg: 'bg-red-100', text: 'text-red-800' }
}

/** Tailwind tokens for a finding's severity chip. */
export function severityColor(severity: AuditFlag['severity']): {
  bg: string
  text: string
} {
  switch (severity) {
    case 'high':
      return { bg: 'bg-red-100', text: 'text-red-800' }
    case 'medium':
      return { bg: 'bg-amber-100', text: 'text-amber-900' }
    case 'low':
      return { bg: 'bg-gray-100', text: 'text-gray-600' }
  }
}
