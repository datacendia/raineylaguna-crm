/**
 * Contact + social enrichment for crm_leads — genuine, no fabrication.
 *
 * For every lead that has a website_url, this:
 *   1) BACKFILL (no network): if website_url is itself a facebook/linkedin/
 *      tiktok link, parse it straight into the matching column.
 *   2) SCRAPE: for real websites, fetch the homepage HTML and extract the
 *      first plausible:
 *        - email        (mailto: links first, then page text)
 *        - facebook_url  (facebook.com/<page>)
 *        - linkedin_url  (linkedin.com/company|in/<slug>)
 *        - tiktok_url    (tiktok.com/@<handle>)
 *
 * It writes ONLY what it finds and never overwrites an existing value
 * (COALESCE). Junk emails (asset files, tracking, placeholders, common
 * library/CDN addresses) are filtered out. Leads with no website are left
 * untouched — finding their contacts would require per-business search.
 *
 * Idempotent: by default only processes leads where email IS NULL AND
 * facebook_url IS NULL AND linkedin_url IS NULL AND tiktok_url IS NULL.
 * Use --force to re-scan everything with a website.
 *
 * Usage:
 *   $env:DATABASE_URL='...'; $env:NODE_TLS_REJECT_UNAUTHORIZED='0'
 *   npx tsx scripts/enrich-contact.ts --dry-run --limit 20
 *   npx tsx scripts/enrich-contact.ts            # full run
 */
import { Pool } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set.')
  process.exit(1)
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null
const CONCURRENCY = 12
const FETCH_TIMEOUT_MS = 8000

const pool = new Pool({ connectionString: DATABASE_URL })

type Lead = { id: string; name: string; website_url: string | null }
type Found = { email?: string; facebook?: string; linkedin?: string; tiktok?: string }

// Facebook paths that are not pages.
const FB_RESERVED = new Set([
  'sharer', 'sharer.php', 'share', 'plugins', 'tr', 'dialog', 'login', 'help',
  'policies', 'policy.php', 'profile.php', 'people', 'pages', 'groups',
  'events', 'watch', 'marketplace', 'gaming', 'business', 'permalink.php',
  'home.php', 'hashtag', 'photo', 'photo.php', 'story.php',
])
const LI_SLUGS = new Set(['company', 'in', 'school', 'showcase'])

// Substrings that disqualify an email (assets, tracking, libraries, placeholders).
const EMAIL_BLOCKLIST = [
  'sentry', 'wixpress', 'example.', 'example@', 'your-email', 'youremail',
  'email@', 'name@', 'user@', 'domain.com', 'godaddy', 'cloudflare',
  'jquery', 'bootstrap', 'fontawesome', 'gstatic', 'googleapis', 'schema.org',
  'w3.org', 'sentry.io', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.css', '.js', '@2x', '@3x', 'core-js', 'react', 'polyfill',
]

function cleanEmail(raw: string): string | null {
  let e = raw.trim().replace(/^mailto:/i, '').split('?')[0].toLowerCase()
  // Strip leading JSON/unicode escape artifacts that get glued onto the local
  // part when HTML embeds escaped JSON, e.g. \u003e">", \u002f"/", \u0026"&".
  e = e.replace(/^(?:u00(?:3e|3c|2f|26|22|27|20|3d|7c|0a|09)|u200b)+/gi, '')
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null
  if (EMAIL_BLOCKLIST.some((b) => e.includes(b))) return null
  // Reject emails whose local part looks like a hashed asset (long hex).
  const local = e.split('@')[0]
  if (/^[0-9a-f]{16,}$/.test(local)) return null
  if (e.length > 100) return null
  return e
}

function extract(html: string): Found {
  const out: Found = {}

  // Email — prefer mailto: links, then fall back to page text.
  const mailto = /mailto:([^"'>\s?]+)/gi
  let m: RegExpExecArray | null
  while ((m = mailto.exec(html)) !== null) {
    const e = cleanEmail(m[1])
    if (e) { out.email = e; break }
  }
  if (!out.email) {
    const textEmail = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
    while ((m = textEmail.exec(html)) !== null) {
      const e = cleanEmail(m[0])
      if (e) { out.email = e; break }
    }
  }

  // Facebook
  const fb = /(?:https?:)?\/\/(?:www\.|m\.|web\.)?facebook\.com\/([A-Za-z0-9_.\-]+)/gi
  while ((m = fb.exec(html)) !== null) {
    const slug = m[1].replace(/\.+$/, '')
    if (!slug || FB_RESERVED.has(slug.toLowerCase())) continue
    if (slug.length < 2 || slug.length > 60) continue
    if (/^\d+$/.test(slug)) continue // bare numeric ids are noise, not pages
    out.facebook = `https://facebook.com/${slug}`
    break
  }

  // LinkedIn (company / in / school)
  const li = /(?:https?:)?\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(company|in|school|showcase)\/([A-Za-z0-9_%.\-]+)/gi
  while ((m = li.exec(html)) !== null) {
    const kind = m[1].toLowerCase()
    const slug = m[2].replace(/\.+$/, '')
    if (!LI_SLUGS.has(kind) || !slug || slug.length < 2 || slug.length > 80) continue
    out.linkedin = `https://linkedin.com/${kind}/${slug}`
    break
  }

  // TikTok
  const tt = /(?:https?:)?\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]+)/gi
  while ((m = tt.exec(html)) !== null) {
    const handle = m[1].replace(/\.+$/, '')
    if (!handle || handle.length < 2 || handle.length > 30) continue
    out.tiktok = `https://tiktok.com/@${handle}`
    break
  }

  return out
}

/** Pull a social link straight out of a website_url that IS that social link. */
function backfillFromUrl(url: string): Found {
  return extract(`"${url}"`)
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html')) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function ensureSchema() {
  await pool.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS facebook_url text')
  await pool.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS linkedin_url text')
  await pool.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS tiktok_url text')
}

async function persist(id: string, f: Found) {
  if (DRY_RUN) return
  if (!f.email && !f.facebook && !f.linkedin && !f.tiktok) return
  await pool.query(
    `UPDATE crm_leads
        SET email        = COALESCE(email, $2),
            facebook_url = COALESCE(facebook_url, $3),
            linkedin_url = COALESCE(linkedin_url, $4),
            tiktok_url   = COALESCE(tiktok_url, $5),
            updated_at   = now()
      WHERE id = $1`,
    [id, f.email ?? null, f.facebook ?? null, f.linkedin ?? null, f.tiktok ?? null],
  )
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>) {
  let i = 0
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx])
    }
  })
  await Promise.all(runners)
}

async function main() {
  await ensureSchema()

  const cond = FORCE
    ? ''
    : 'AND email IS NULL AND facebook_url IS NULL AND linkedin_url IS NULL AND tiktok_url IS NULL'
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : ''
  const { rows } = await pool.query<Lead>(
    `SELECT id, name, website_url FROM crm_leads
      WHERE website_url IS NOT NULL ${cond} ORDER BY created_at ${limitSql}`,
  )

  const isSocial = (u: string) => /facebook\.com|linkedin\.com|tiktok\.com/i.test(u)
  const backfill = rows.filter((r) => isSocial(r.website_url as string))
  const scrape = rows.filter((r) => !isSocial(r.website_url as string))

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Contact enrichment: ${backfill.length} social-url backfill, ${scrape.length} sites to scrape.\n`,
  )

  const tally = { email: 0, facebook: 0, linkedin: 0, tiktok: 0 }
  const bump = (f: Found) => {
    if (f.email) tally.email++
    if (f.facebook) tally.facebook++
    if (f.linkedin) tally.linkedin++
    if (f.tiktok) tally.tiktok++
  }

  // Pass 1 — backfill from social website_urls (no network).
  for (const lead of backfill) {
    const f = backfillFromUrl(lead.website_url as string)
    bump(f)
    await persist(lead.id, f)
    if (DRY_RUN && (f.facebook || f.linkedin || f.tiktok)) {
      console.log(`  [backfill] ${lead.name} -> ${JSON.stringify(f)}`)
    }
  }

  // Pass 2 — scrape real websites.
  let done = 0
  await runPool(scrape, async (lead) => {
    const html = await fetchHtml(lead.website_url as string)
    done++
    if (done % 200 === 0) {
      console.log(`  …scraped ${done}/${scrape.length} (email ${tally.email}, fb ${tally.facebook}, li ${tally.linkedin}, tt ${tally.tiktok})`)
    }
    if (!html) return
    const f = extract(html)
    bump(f)
    await persist(lead.id, f)
    if (DRY_RUN && (f.email || f.facebook || f.linkedin || f.tiktok)) {
      console.log(`  [scrape] ${lead.name} -> ${JSON.stringify(f)}`)
    }
  })

  console.log(
    `\nDone. email=${tally.email}, facebook=${tally.facebook}, linkedin=${tally.linkedin}, tiktok=${tally.tiktok} (of ${rows.length} leads with a website).`,
  )
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
