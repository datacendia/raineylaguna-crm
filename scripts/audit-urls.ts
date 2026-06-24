/**
 * Ad-hoc Digital Presence Audit for an arbitrary list of URLs — competitor and
 * prospect recon using the SAME engine as the CRM (src/lib/audit.ts → Google
 * PageSpeed Insights + homepage HTML heuristics). No database required.
 *
 * Use it to put real numbers behind a pitch: audit a competitor's own site (or
 * their client sites) next to your build and show the gap.
 *
 * A PageSpeed key lifts the keyless quota (which 429s quickly). The script
 * reuses the CRM's key resolution:
 *   GOOGLE_PAGESPEED_API_KEY, or GOOGLE_PLACES_API_KEY (same Google Cloud key,
 *   if the PageSpeed Insights API is enabled on that project).
 *
 * Usage:
 *   $env:GOOGLE_PAGESPEED_API_KEY='...'
 *   npx tsx scripts/audit-urls.ts https://malabarte.com https://raineylaguna.com
 *   npx tsx scripts/audit-urls.ts --json audit.json https://a.com https://b.com
 *   npx tsx scripts/audit-urls.ts --file urls.txt        # one URL per line
 */
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'fs'
import { auditWebsite } from '../src/lib/audit'

config({ path: '.env.local' })

const API_KEY =
  process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PLACES_API_KEY || undefined

const args = process.argv.slice(2)
const jsonIdx = args.indexOf('--json')
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null
const fileIdx = args.indexOf('--file')
const FILE = fileIdx >= 0 ? args[fileIdx + 1] : null

// URLs = positional args (not flags, not a flag's value) + optional --file lines.
const flagValues = new Set([JSON_OUT, FILE].filter(Boolean) as string[])
let urls = args.filter((a) => !a.startsWith('--') && !flagValues.has(a))
if (FILE) {
  const lines = readFileSync(FILE, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  urls = urls.concat(lines)
}
urls = Array.from(new Set(urls))

if (urls.length === 0) {
  console.error('Usage: tsx scripts/audit-urls.ts [--json out.json] [--file urls.txt] <url> [url...]')
  process.exit(1)
}
if (!API_KEY) {
  console.warn(
    '! No GOOGLE_PAGESPEED_API_KEY / GOOGLE_PLACES_API_KEY set — keyless PageSpeed (low quota, 429s quickly). Performance/SEO/LCP may be blank.\n',
  )
}

type Out = {
  url: string
  health: number
  performance: number | null
  seo: number | null
  accessibility: number | null
  bestPractices: number | null
  lcpSeconds: number | null
  flags: string[]
  summary: string
}

const cell = (v: string | number | null, w: number) => String(v ?? '—').padEnd(w)

async function main() {
  const results: Out[] = []
  // Sequential — PageSpeed is slow (~10-20s/call) and rate-limited; running in
  // parallel just multiplies the 429s.
  for (const url of urls) {
    process.stdout.write(`auditing ${url} … `)
    const f = await auditWebsite({ websiteUrl: url, apiKey: API_KEY })
    const row: Out = {
      url,
      health: f.score,
      performance: f.scores.performance,
      seo: f.scores.seo,
      accessibility: f.scores.accessibility,
      bestPractices: f.scores.bestPractices,
      lcpSeconds: f.metrics.lcpMs != null ? Math.round(f.metrics.lcpMs / 100) / 10 : null,
      flags: f.flags.map((fl) => fl.label),
      summary: f.summary,
    }
    results.push(row)
    console.log(
      `health ${row.health} | perf ${row.performance ?? '—'} | seo ${row.seo ?? '—'} | lcp ${row.lcpSeconds ?? '—'}s`,
    )
  }

  console.log(
    '\n' + cell('URL', 38) + cell('Health', 8) + cell('Perf', 6) + cell('SEO', 5) + cell('A11y', 6) + cell('BP', 5) + 'LCP',
  )
  for (const r of results) {
    console.log(
      cell(r.url.slice(0, 36), 38) +
        cell(r.health, 8) +
        cell(r.performance, 6) +
        cell(r.seo, 5) +
        cell(r.accessibility, 6) +
        cell(r.bestPractices, 5) +
        (r.lcpSeconds != null ? `${r.lcpSeconds}s` : '—'),
    )
  }

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify(results, null, 2))
    console.log(`\nWrote ${results.length} result(s) to ${JSON_OUT}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
