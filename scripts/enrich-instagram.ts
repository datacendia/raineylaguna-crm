/**
 * Instagram enrichment for crm_leads — genuine, no fabrication.
 *
 * Two passes:
 *   1) BACKFILL: leads whose website_url is already an instagram.com link
 *      → parse the handle directly (no network).
 *   2) SCRAPE: leads with a real (non-IG) website → fetch the homepage and
 *      extract the first real instagram.com/<handle> link found in the HTML.
 *
 * Writes:
 *   - instagram_url   (https://instagram.com/<handle>)   [new column]
 *   - instagram_active = true when a handle is found
 *
 * Leads with NO website are left untouched — there is no reliable automated
 * way to find their Instagram without per-business web search, and inventing
 * one would be fabrication. Those are reported as "no-site (skipped)".
 *
 * Idempotent: only processes leads where instagram_url IS NULL unless --force.
 *
 * Usage:
 *   $env:DATABASE_URL='...'
 *   npx tsx scripts/enrich-instagram.ts --dry-run --limit 20
 *   npx tsx scripts/enrich-instagram.ts            # full run
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

// Instagram paths that are NOT user handles.
const RESERVED = new Set([
  'p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'about',
  'developer', 'legal', 'directory', 'sharer', 'web', 'invites', 'help',
])

type Lead = { id: string; name: string; website_url: string | null }

/** Extract a clean instagram handle from any string containing an IG url. */
function extractHandle(text: string): string | null {
  const re = /instagram\.com\/(?:#!\/)?@?([A-Za-z0-9_.]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const handle = m[1].replace(/\.+$/, '')
    if (!handle || RESERVED.has(handle.toLowerCase())) continue
    if (handle.length < 2 || handle.length > 30) continue
    return handle.toLowerCase()
  }
  return null
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

async function setHandle(id: string, handle: string) {
  if (DRY_RUN) return
  await pool.query(
    `UPDATE crm_leads SET instagram_url = $2, instagram_active = true, updated_at = now() WHERE id = $1`,
    [id, `https://instagram.com/${handle}`],
  )
}

async function ensureSchema() {
  await pool.query('ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS instagram_url text')
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

  const cond = FORCE ? '' : 'AND instagram_url IS NULL'
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : ''
  const { rows } = await pool.query<Lead>(
    `SELECT id, name, website_url FROM crm_leads WHERE website_url IS NOT NULL ${cond} ORDER BY created_at ${limitSql}`,
  )

  // Split: already-IG links (backfill) vs real sites (scrape).
  const backfill = rows.filter((r) => /instagram\.com/i.test(r.website_url ?? ''))
  const scrape = rows.filter((r) => !/instagram\.com/i.test(r.website_url ?? ''))

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}IG enrichment: ${backfill.length} backfill (already IG link), ${scrape.length} to scrape.\n`,
  )

  let found = 0
  let none = 0

  // Pass 1 — backfill from existing IG urls.
  for (const lead of backfill) {
    const handle = extractHandle(lead.website_url as string)
    if (handle) {
      found++
      await setHandle(lead.id, handle)
      if (DRY_RUN) console.log(`  [backfill] ${lead.name} -> @${handle}`)
    } else {
      none++
    }
  }

  // Pass 2 — scrape real websites.
  let done = 0
  await runPool(scrape, async (lead) => {
    const html = await fetchHtml(lead.website_url as string)
    done++
    if (done % 200 === 0) console.log(`  …scraped ${done}/${scrape.length} (found ${found})`)
    if (!html) {
      none++
      return
    }
    const handle = extractHandle(html)
    if (handle) {
      found++
      await setHandle(lead.id, handle)
      if (DRY_RUN) console.log(`  [scrape] ${lead.name} -> @${handle}`)
    } else {
      none++
    }
  })

  console.log(`\nDone. instagram_found=${found}, none=${none} (of ${rows.length} with a website).`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
