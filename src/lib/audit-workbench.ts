/**
 * Website Audit Workbench — static framework + pure scoring helpers.
 *
 * A deep, human-driven manual audit that complements the automated
 * digital_health_score (src/lib/audit.ts). 8 dimensions / ~70 checks scored
 * 0-4 with evidence notes, weighted by business model, rolled up to a 0-100
 * overall with bands. This module is framework-agnostic (no React / no DOM)
 * so the same maths runs in the client component AND server-side on save.
 */

export type ItemLevel = 'core' | 'advanced'
export type ProfileId = 'universal' | 'local' | 'ecom' | 'leadgen' | 'content' | 'brand'
export type RegionId = 'global' | 'eu_uk' | 'us' | 'canada' | 'anz' | 'latam' | 'other'
export type DimensionId = 'find' | 'mobile' | 'tech' | 'conv' | 'trust' | 'ux' | 'content' | 'access'

export type WorkbenchItem = {
  id: string
  title: string
  desc: string
  tool: string
  toolUrl?: string
  verify: string
  level: ItemLevel
  /** Business-model tags; an item shows only if its tag is relevant to the profile. */
  tags?: string[]
  /** false = cannot be verified by reading the live site (listing, reviews, SERP…). Defaults true. */
  web?: boolean
}

export type WorkbenchDimension = { id: DimensionId; name: string; items: WorkbenchItem[] }

/** 0-4 score, 'na' (not applicable) or null (unscored). */
export type ItemState = number | 'na' | null
export type ItemRecord = {
  state: ItemState
  note: string
  /**
   * UI provenance, persisted so the distinction between an auto-applied N/A
   * (out-of-scope for the chosen business model) and a value the auditor set
   * by hand survives reloads. Optional for backward-compat with snapshots
   * saved before these flags existed.
   */
  touched?: boolean
  auto?: boolean
}
export type Weights = Record<DimensionId, number>

export type ManualAuditEngagement = { client: string; url: string; auditor: string; date: string }

/** Full persisted workbench snapshot — stored as crm_leads.manual_audit (jsonb). */
export type ManualAudit = {
  version: 1
  profile: ProfileId
  region: RegionId
  presenceOnly: boolean
  essentialsOnly: boolean
  weights: Weights
  engagement: ManualAuditEngagement
  items: Record<string, ItemRecord>
  overall: number | null
  scored: number
  scope: number
}

export const DIMENSIONS: WorkbenchDimension[] = [
  { id: 'find', name: 'Findability & SEO', items: [
    { id: 'find-index', title: 'Indexed in search engines', desc: 'Pages actually appear in the index; nothing important accidentally de-indexed.', tool: 'site: search + Search Console (Coverage)', toolUrl: 'https://search.google.com/search-console', verify: 'Screenshot of site:domain count + Coverage report', level: 'core' },
    { id: 'find-robots', title: 'Indexability config is sane', desc: 'robots.txt isn’t blocking key paths; no stray noindex meta tag or X-Robots-Tag header.', tool: '/robots.txt + curl -I (X-Robots-Tag) + URL Inspection', verify: 'Pasted response header + robots.txt contents', level: 'core' },
    { id: 'find-titles', title: 'Unique, descriptive title tags', desc: 'Every page has a distinct, intent-matching <title>.', tool: 'Screaming Frog / "SEO META in 1 Click" / View Source', toolUrl: 'https://www.screamingfrog.co.uk/seo-spider/', verify: 'Exported list of page titles', level: 'core' },
    { id: 'find-meta', title: 'Meta descriptions present & compelling', desc: 'Each page has a written description that earns the click.', tool: 'Screaming Frog / SEO META in 1 Click', verify: 'Exported descriptions', level: 'core' },
    { id: 'find-h1', title: 'One clear H1 + logical heading order', desc: 'Single H1 per page, no skipped heading levels.', tool: 'HeadingsMap / SEO META in 1 Click', verify: 'Heading outline screenshot', level: 'core' },
    { id: 'find-brand', title: 'Ranks for own brand + core service terms', desc: 'Shows up for its own name and the obvious "service + place/category" queries.', tool: 'Incognito search + Search Console (Queries)', verify: 'SERP screenshots', level: 'core', web: false },
    { id: 'find-listing', title: 'Map / business listing claimed & complete', desc: 'Profile claimed, accurate, categorised, with photos and reviews.', tool: 'Google Business Profile / Apple Business Connect / Bing Places / regional (Yandex, Naver)', toolUrl: 'https://business.google.com/', verify: 'Listing screenshot', level: 'core', tags: ['local'], web: false },
    { id: 'find-sitemap', title: 'XML sitemap exists & submitted', desc: 'Valid sitemap reflecting live URLs, submitted to Search Console.', tool: '/sitemap.xml + Search Console', verify: 'Pasted sitemap head + submission status', level: 'core' },
    { id: 'find-schema', title: 'Structured data valid', desc: 'Appropriate schema (Organization / LocalBusiness / Product / Article / FAQ) validates without errors.', tool: 'Google Rich Results Test + Schema.org validator', toolUrl: 'https://search.google.com/test/rich-results', verify: 'Validation result screenshot', level: 'core' },
    { id: 'find-canonical', title: 'Canonical & duplicate-URL handling', desc: 'Canonicals correct; www/non-www, http/https, and params resolve cleanly.', tool: 'curl -I / Screaming Frog', verify: 'Canonical header + redirect chain', level: 'advanced' },
    { id: 'find-intlinks', title: 'Internal linking & crawl depth', desc: 'Important pages aren’t buried; links are descriptive.', tool: 'Screaming Frog (crawl depth report)', verify: 'Crawl-depth export', level: 'advanced' },
    { id: 'find-hreflang', title: 'Multi-language / multi-region targeting', desc: 'hreflang correct for each market; no conflicting signals.', tool: 'Screaming Frog / hreflang tester', verify: 'hreflang report', level: 'advanced' },
  ] },
  { id: 'mobile', name: 'Mobile experience', items: [
    { id: 'mob-render', title: 'Renders correctly on a real device', desc: 'No layout breakage, cut-off content, or unreadable sections on a phone.', tool: 'Actual phone + Chrome DevTools device mode', verify: 'Mobile screenshot(s)', level: 'core' },
    { id: 'mob-responsive', title: 'Responsive & readable without zoom', desc: 'No horizontal scroll; content reflows; no pinch-to-read.', tool: 'DevTools responsive mode + Lighthouse (Mobile)', toolUrl: 'https://pagespeed.web.dev/', verify: 'Responsive screenshots', level: 'core' },
    { id: 'mob-tap', title: 'Tap targets sized & spaced', desc: 'Buttons/links are big enough and not crammed together.', tool: 'Lighthouse (Tap targets audit)', verify: 'Lighthouse audit note', level: 'core' },
    { id: 'mob-actions', title: 'Mobile actions work', desc: 'Tap-to-call, map/directions, booking, and add-to-cart all function on touch.', tool: 'Manual test on device', verify: 'Screenshot of each action firing', level: 'core' },
    { id: 'mob-perf', title: 'Mobile performance', desc: 'LCP, CLS and INP are acceptable on a mid-tier phone / throttled network.', tool: 'PageSpeed Insights (Mobile, field data)', toolUrl: 'https://pagespeed.web.dev/', verify: 'PSI mobile score screenshot', level: 'core' },
    { id: 'mob-legible', title: 'Legible & one-hand usable', desc: 'Body text ≥ ~16px; primary controls reachable with a thumb.', tool: 'Manual on device', verify: 'Note + screenshot', level: 'core' },
    { id: 'mob-interstitial', title: 'No intrusive mobile interstitials', desc: 'No full-screen pop-ups blocking content on entry.', tool: 'Manual', verify: 'Note', level: 'advanced' },
  ] },
  { id: 'tech', name: 'Technical & performance', items: [
    { id: 'tech-https', title: 'HTTPS valid + forced', desc: 'Valid certificate and a clean http→https redirect.', tool: 'Browser padlock + curl -I + SSL Labs', toolUrl: 'https://www.ssllabs.com/ssltest/', verify: 'Redirect chain + cert grade', level: 'core' },
    { id: 'tech-cwv', title: 'Core Web Vitals', desc: 'LCP, CLS and INP pass on real-user (field) data where available.', tool: 'PageSpeed Insights (CrUX) + Search Console (Core Web Vitals)', toolUrl: 'https://pagespeed.web.dev/', verify: 'PSI field-data screenshot', level: 'core' },
    { id: 'tech-speed', title: 'Page weight & load time', desc: 'Total bytes and time-to-interactive are reasonable for the audience.', tool: 'PageSpeed Insights / WebPageTest / DevTools Network', toolUrl: 'https://www.webpagetest.org/', verify: 'Waterfall + total bytes', level: 'core' },
    { id: 'tech-img', title: 'Images optimised', desc: 'Correctly sized, compressed, lazy-loaded, modern formats (WebP/AVIF) where sensible.', tool: 'Lighthouse image audits + DevTools', verify: 'Lighthouse "Opportunities" list', level: 'core' },
    { id: 'tech-broken', title: 'No broken links / 404s / images', desc: 'No dead internal links, missing images, or broken redirects.', tool: 'Screaming Frog / online Broken Link Checker', toolUrl: 'https://www.screamingfrog.co.uk/seo-spider/', verify: 'Crawl export of 4xx/5xx', level: 'core' },
    { id: 'tech-analytics', title: 'Analytics installed & firing', desc: 'GA4 (or equivalent) present and recording real traffic.', tool: 'Tag Assistant / GA4 Realtime / View Source', verify: 'Realtime / tag-fire screenshot', level: 'core' },
    { id: 'tech-secheaders', title: 'Security headers present', desc: 'HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy.', tool: 'securityheaders.com + curl -I', toolUrl: 'https://securityheaders.com/', verify: 'Header report / dump', level: 'advanced' },
    { id: 'tech-hostcdn', title: 'Hosting / CDN & caching', desc: 'Served via a CDN with sensible cache headers; no obvious bottleneck.', tool: 'curl -I (server, cache-control, cf-*) / WebPageTest', verify: 'Response headers', level: 'advanced' },
    { id: 'tech-console', title: 'No mixed content / console errors', desc: 'Clean console; no insecure assets on HTTPS pages.', tool: 'DevTools Console + Security tab', verify: 'Console screenshot', level: 'advanced' },
    { id: 'tech-uptime', title: 'Uptime & monitoring', desc: 'Monitoring in place (for sites you’ll manage); recent uptime acceptable.', tool: 'UptimeRobot / host status', toolUrl: 'https://uptimerobot.com/', verify: 'Monitor screenshot / note', level: 'advanced' },
    { id: 'tech-maint', title: 'Backups & platform updates current', desc: 'CMS/plugins/themes patched; backups exist (where you manage it).', tool: 'Host / CMS admin panel', verify: 'Version + backup note', level: 'advanced' },
  ] },
  { id: 'conv', name: 'Conversion & contact', items: [
    { id: 'conv-primary', title: 'Primary action obvious above the fold', desc: 'A first-time visitor instantly sees the main thing to do (call / buy / book / quote).', tool: '5-second test / manual review', verify: 'Above-the-fold screenshot', level: 'core' },
    { id: 'conv-nap', title: 'Contact details present, correct & consistent', desc: 'Phone, email, address, hours are easy to find and match listings/directories (NAP consistency).', tool: 'Manual + directory/listing cross-check', verify: 'Screenshot + NAP comparison', level: 'core', web: false },
    { id: 'conv-channels', title: 'Contact channels work', desc: 'Click-to-call, WhatsApp/messaging, and booking links all function.', tool: 'Manual test', verify: 'Screenshot of each working', level: 'core', tags: ['local', 'leadgen'] },
    { id: 'conv-form', title: 'Forms work and submissions arrive', desc: 'Forms are short, validate well, and a test submission actually lands in the inbox/CRM.', tool: 'Submit a real test + check inbox/CRM', verify: 'Received-message screenshot', level: 'core' },
    { id: 'conv-map', title: 'Map / directions present', desc: 'Embedded map or directions link for physical locations.', tool: 'Manual', verify: 'Screenshot', level: 'core', tags: ['local'] },
    { id: 'conv-value', title: 'Clear value proposition', desc: 'It’s obvious what they offer and why choose them over alternatives.', tool: 'Manual review', verify: 'Note', level: 'core' },
    { id: 'conv-lead', title: 'Lead capture / offer where relevant', desc: 'A reason and a way to capture interest (quote, demo, newsletter, gated asset).', tool: 'Manual', verify: 'Note', level: 'advanced', tags: ['leadgen', 'content'] },
    { id: 'conv-tracking', title: 'Conversion tracking configured', desc: 'Form submits, calls and/or purchases recorded as events/goals.', tool: 'GA4 events / call tracking', verify: 'Event-firing screenshot', level: 'advanced' },
    { id: 'conv-ecom', title: 'Checkout funnel friction', desc: 'Product → cart → checkout is smooth; guest checkout and payment options present.', tool: 'Manual test purchase', verify: 'Funnel notes / screenshots', level: 'advanced', tags: ['ecom'] },
    { id: 'conv-cartrust', title: 'Checkout trust signals', desc: 'Payment security, shipping/returns clarity, and reassurance at the point of sale.', tool: 'Manual review', verify: 'Note', level: 'advanced', tags: ['ecom'] },
  ] },
  { id: 'trust', name: 'Trust & credibility', items: [
    { id: 'trust-reviews', title: 'Third-party reviews are visible & strong', desc: 'Healthy rating and volume on the platforms that matter for the sector.', tool: 'Google / Facebook / industry review sites', verify: 'Reviews screenshot', level: 'core', web: false },
    { id: 'trust-testimonials', title: 'Testimonials are specific & attributed', desc: 'Real names/photos/companies, concrete outcomes — not anonymous fluff.', tool: 'Manual review', verify: 'Note', level: 'core' },
    { id: 'trust-realbiz', title: 'Real, verifiable business identity', desc: 'Registration number (ABN/EIN/VAT/company no.), real address, real named team.', tool: 'Manual + public business registry', verify: 'Note', level: 'core' },
    { id: 'trust-fresh', title: 'Current & maintained', desc: 'No stale copyright year, dead promos, or obviously abandoned content.', tool: 'Manual / footer + recent activity', verify: 'Note', level: 'core' },
    { id: 'trust-design', title: 'Professional, consistent design', desc: 'Coherent branding; no placeholder/Lorem text or broken layouts.', tool: 'Manual review', verify: 'Screenshot', level: 'core' },
    { id: 'trust-privacy', title: 'Privacy policy / terms (+ consent)', desc: 'Required policies present; cookie/consent handled where the jurisdiction needs it.', tool: 'Manual review', verify: 'Note (see market reminder)', level: 'advanced' },
    { id: 'trust-social', title: 'Social profiles linked & active', desc: 'Linked, on-brand, and actually maintained.', tool: 'Manual review', verify: 'Note', level: 'advanced', web: false },
    { id: 'trust-creds', title: 'Certifications / awards / press', desc: 'Relevant credentials, association logos, or media mentions shown credibly.', tool: 'Manual review', verify: 'Note', level: 'advanced' },
  ] },
  { id: 'ux', name: 'UX & navigation', items: [
    { id: 'ux-nav', title: 'Clear navigation', desc: 'Key pages reachable in 1–2 clicks; menu is understandable.', tool: 'Manual / quick tree test', verify: 'Note', level: 'core' },
    { id: 'ux-ia', title: 'Logical information architecture', desc: 'Sensible structure; no orphaned or confusingly duplicated pages.', tool: 'Manual / sitemap review', verify: 'Note', level: 'core' },
    { id: 'ux-home', title: 'Consistent shell & wayfinding', desc: 'Logo links home; header/footer consistent; utility (search/contact) visible.', tool: 'Manual review', verify: 'Note', level: 'core' },
    { id: 'ux-scent', title: 'Strong information scent', desc: 'Labels match destinations; the user always knows where they are.', tool: 'Manual review', verify: 'Note', level: 'advanced' },
    { id: 'ux-search', title: 'On-site search works', desc: 'For larger sites/stores: search returns relevant results.', tool: 'Manual test', verify: 'Note', level: 'advanced', tags: ['ecom', 'content'] },
    { id: 'ux-404', title: 'Helpful errors & 404', desc: 'A useful 404 with a route back; graceful error states.', tool: 'Visit a bad URL', verify: 'Screenshot', level: 'advanced' },
    { id: 'ux-formux', title: 'Form & interaction UX', desc: 'Clear labels, inline validation, and understandable error messages.', tool: 'Manual review', verify: 'Note', level: 'advanced' },
  ] },
  { id: 'content', name: 'Content quality', items: [
    { id: 'cont-clarity', title: 'Clear, human, benefit-led copy', desc: 'Written for the customer — not scraped spec sheets or placeholder text.', tool: 'Manual review', verify: 'Note', level: 'core' },
    { id: 'cont-depth', title: 'Every product/service has a real page', desc: 'Each offering has its own indexable page with genuine depth.', tool: 'Manual review', verify: 'Note', level: 'core' },
    { id: 'cont-proof', title: 'Free of typos & errors', desc: 'No spelling/grammar mistakes; consistent terminology and tone.', tool: 'Manual / proofing tool', verify: 'Note', level: 'core' },
    { id: 'cont-cta', title: 'CTAs are specific', desc: 'Action-oriented calls to action, not vague "learn more" everywhere.', tool: 'Manual review', verify: 'Note', level: 'core' },
    { id: 'cont-editorial', title: 'Editorial content captures demand', desc: 'Blog/guides/resources answering informational queries in the niche.', tool: 'Manual review', verify: 'Note', level: 'advanced', tags: ['content', 'leadgen'] },
    { id: 'cont-media', title: 'Media quality & licensing', desc: 'Original or well-chosen imagery/video; properly licensed, not random stock.', tool: 'Manual review', verify: 'Note', level: 'advanced' },
    { id: 'cont-l10n', title: 'Localization is correct', desc: 'Translated/localised content reads natively for each target market.', tool: 'Manual / native review', verify: 'Note', level: 'advanced' },
  ] },
  { id: 'access', name: 'Accessibility', items: [
    { id: 'acc-alt', title: 'Meaningful alt text on images', desc: 'Informative images have alt text; decorative ones are empty — checked in the rendered DOM, not raw HTML.', tool: 'axe DevTools / WAVE', toolUrl: 'https://wave.webaim.org/', verify: 'Tool report', level: 'core' },
    { id: 'acc-contrast', title: 'Colour contrast meets WCAG AA', desc: 'Text/background contrast passes AA at the relevant sizes.', tool: 'axe / WAVE / contrast checker', toolUrl: 'https://webaim.org/resources/contrastchecker/', verify: 'Contrast report', level: 'core' },
    { id: 'acc-keyboard', title: 'Keyboard-navigable with visible focus', desc: 'Everything operable by keyboard; focus is always visible.', tool: 'Manual tab-through', verify: 'Note', level: 'core' },
    { id: 'acc-labels', title: 'Form fields are labelled', desc: 'Inputs have programmatic labels and are announced correctly.', tool: 'axe / screen reader', verify: 'Tool report', level: 'core' },
    { id: 'acc-semantics', title: 'Semantic structure & landmarks', desc: 'Proper headings, lists, and landmark regions for navigation.', tool: 'axe / HeadingsMap', verify: 'Report', level: 'advanced' },
    { id: 'acc-zoom', title: 'Usable at 200% zoom', desc: 'No content or function lost when zoomed to 200%.', tool: 'Manual browser zoom', verify: 'Note', level: 'advanced' },
    { id: 'acc-media', title: 'Captions / transcripts & reduced motion', desc: 'Media has captions/transcripts; respects prefers-reduced-motion.', tool: 'Manual review', verify: 'Note', level: 'advanced', tags: ['content'] },
    { id: 'acc-aria', title: 'Screen-reader pass on key flows', desc: 'ARIA used correctly; primary journeys work with NVDA/VoiceOver.', tool: 'NVDA / VoiceOver', verify: 'Note', level: 'advanced' },
  ] },
]

export const PROFILES: Record<ProfileId, { relevant: string[]; weights: Weights }> = {
  universal: { relevant: ['local', 'ecom', 'leadgen', 'content'], weights: { find: 14, mobile: 13, tech: 14, conv: 14, trust: 12, ux: 11, content: 10, access: 12 } },
  local: { relevant: ['local'], weights: { find: 16, mobile: 15, tech: 13, conv: 16, trust: 14, ux: 10, content: 6, access: 10 } },
  ecom: { relevant: ['ecom'], weights: { find: 12, mobile: 14, tech: 18, conv: 18, trust: 14, ux: 10, content: 6, access: 8 } },
  leadgen: { relevant: ['leadgen'], weights: { find: 14, mobile: 8, tech: 12, conv: 18, trust: 14, ux: 10, content: 16, access: 8 } },
  content: { relevant: ['content'], weights: { find: 18, mobile: 12, tech: 14, conv: 8, trust: 8, ux: 12, content: 20, access: 8 } },
  brand: { relevant: [], weights: { find: 14, mobile: 12, tech: 12, conv: 6, trust: 18, ux: 14, content: 16, access: 8 } },
}

export const PROFILE_OPTIONS: { value: ProfileId; label: string }[] = [
  { value: 'universal', label: 'Universal / mixed (show everything)' },
  { value: 'local', label: 'Local / service-area business (storefront, clinic, trades)' },
  { value: 'ecom', label: 'E-commerce / online store' },
  { value: 'leadgen', label: 'B2B / lead generation (SaaS, agency, manufacturer)' },
  { value: 'content', label: 'Content / media / publisher' },
  { value: 'brand', label: 'Brand / informational (corporate, no direct conversion)' },
]

export const REGION_OPTIONS: { value: RegionId; label: string }[] = [
  { value: 'global', label: 'Global / multiple markets' },
  { value: 'eu_uk', label: 'European Union / United Kingdom' },
  { value: 'us', label: 'United States' },
  { value: 'canada', label: 'Canada' },
  { value: 'anz', label: 'Australia / New Zealand' },
  { value: 'latam', label: 'Latin America' },
  { value: 'other', label: 'Other / not sure' },
]

export const REGION_HINTS: Record<RegionId, { title: string; body: string }> = {
  global: { title: 'Global / multiple markets:', body: 'map every legal item to each market you operate in. Confirm privacy policy, cookie/consent handling, marketing-consent rules, and accessibility expectations per jurisdiction.' },
  eu_uk: { title: 'EU / UK:', body: 'check GDPR compliance, a valid cookie-consent banner (ePrivacy/PECR), and a clear privacy policy. Accessibility expectations track WCAG via EN 301 549 / the European Accessibility Act.' },
  us: { title: 'United States:', body: 'check CCPA/CPRA (California) and any sector rules; accessibility commonly assessed against WCAG for ADA exposure. Confirm privacy policy and any opt-out / "Do Not Sell" requirements.' },
  canada: { title: 'Canada:', body: 'check PIPEDA (privacy) and CASL (email/marketing consent + unsubscribe). Confirm privacy policy and consent capture.' },
  anz: { title: 'Australia / New Zealand:', body: 'check the Privacy Act and the Spam Act (consent + functional unsubscribe). Confirm privacy policy and marketing-consent handling.' },
  latam: { title: 'Latin America:', body: 'check the applicable data-protection law (e.g. LGPD in Brazil, Ley 29733 in Peru, similar regimes elsewhere) plus consent for marketing.' },
  other: { title: 'Other / not sure:', body: 'identify the data-protection, cookie/consent, marketing, and accessibility rules for the client’s country and sector before finalising the legal items.' },
}

export type BandKey = 'na' | 'critical' | 'weak' | 'needs' | 'solid' | 'excellent'

export const SCALE: { n: number; t: string; d: string }[] = [
  { n: 0, t: 'Fail / absent', d: 'Missing, broken, or actively harmful.' },
  { n: 1, t: 'Poor', d: 'Present but seriously deficient.' },
  { n: 2, t: 'Adequate', d: 'Works, but clearly improvable.' },
  { n: 3, t: 'Good', d: 'Solid, minor refinements only.' },
  { n: 4, t: 'Excellent', d: 'Best-practice; nothing to fix.' },
]

export const BANDS: { key: BandKey; label: string }[] = [
  { key: 'excellent', label: '85–100 Excellent' },
  { key: 'solid', label: '70–84 Solid' },
  { key: 'needs', label: '55–69 Needs work' },
  { key: 'weak', label: '40–54 Weak' },
  { key: 'critical', label: '0–39 Critical' },
]

export const DIMENSION_IDS = DIMENSIONS.map((d) => d.id)

export function profileRelevant(item: WorkbenchItem, profile: ProfileId): boolean {
  const p = PROFILES[profile]
  if (!item.tags || item.tags.length === 0) return true
  return item.tags.some((t) => p.relevant.includes(t))
}

/** Is this check in scope for the current profile / depth / presence mode? */
export function applicable(item: WorkbenchItem, profile: ProfileId, presenceOnly: boolean, essentialsOnly: boolean): boolean {
  if (!profileRelevant(item, profile)) return false
  if (presenceOnly && item.web !== false) return false
  if (essentialsOnly && item.level === 'advanced') return false
  return true
}

export function bandFor(v: number | null): { key: BandKey; label: string } {
  if (v == null) return { key: 'na', label: 'Awaiting scores' }
  if (v >= 85) return { key: 'excellent', label: 'Excellent' }
  if (v >= 70) return { key: 'solid', label: 'Solid' }
  if (v >= 55) return { key: 'needs', label: 'Needs work' }
  if (v >= 40) return { key: 'weak', label: 'Weak' }
  return { key: 'critical', label: 'Critical' }
}

/** A dimension's score = mean of its scored (0-4) lines, rescaled to 100. */
export function dimScore(dim: WorkbenchDimension, items: Record<string, ItemRecord>): number | null {
  const nums = dim.items
    .map((it) => items[it.id]?.state)
    .filter((s): s is number => typeof s === 'number')
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) / 4 * 100)
}

/** Weighted overall (0-100) plus scored/scope counts. Mirrors the workbench. */
export function computeOverall(
  items: Record<string, ItemRecord>,
  weights: Weights,
  dimensions: WorkbenchDimension[] = DIMENSIONS,
): { overall: number | null; scored: number; scope: number } {
  let num = 0
  let wsum = 0
  let scored = 0
  let scope = 0
  for (const d of dimensions) {
    const sc = dimScore(d, items)
    if (sc != null) {
      num += sc * (weights[d.id] || 0)
      wsum += weights[d.id] || 0
    }
    for (const it of d.items) {
      const st = items[it.id]?.state
      if (st !== 'na') {
        scope++
        if (typeof st === 'number') scored++
      }
    }
  }
  return { overall: wsum > 0 ? Math.round(num / wsum) : null, scored, scope }
}

export function defaultWeights(profile: ProfileId): Weights {
  return { ...PROFILES[profile].weights }
}
