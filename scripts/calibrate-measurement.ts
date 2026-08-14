/**
 * Measurement-maturity calibration report ("Sonda").
 *
 * This is the gate. `src/lib/measurement.ts` proposes band cuts at 20/45/70,
 * and those numbers are worth nothing until someone checks that real Lima SMB
 * sites actually land on both sides of them.
 *
 * The failure this exists to prevent is specific and has already happened once:
 * the Opportunity Radar scored virtually every lead 89, the number carried no
 * information, and the report read as generic. A score that does not separate
 * the population is worse than no score, because it looks like knowledge.
 *
 * Read-only. No writes, no PageSpeed, no API keys, safe against production.
 * The only cost is one plain HTML GET per lead.
 *
 * ── Reading the output ────────────────────────────────────────────────────
 * The decile table is the important part. If 80%+ of readable sites fall in
 * one band, the model has failed the gate — retune the weights or the cuts
 * before anything is built on top. Per-signal hit rates tell you WHICH check
 * is dead weight: a signal that fires for ~0% or ~100% of sites adds no
 * discrimination and should be dropped or replaced.
 *
 * `unreadable` is reported separately and never scored. A site that blocks us
 * is not a site without analytics.
 *
 * Usage:
 *   $env:DATABASE_URL='...'; npx tsx scripts/calibrate-measurement.ts --limit 200
 */
import { Pool } from 'pg'
import { config } from 'dotenv'
import {
  detectSignals,
  scoreDetected,
  unknownSignals,
  DIMENSION_KEYS,
  BANDS,
  type FetchFailure,
  type MeasurementSignals,
} from '../src/lib/measurement'

config({ path: '.env.local' })
config()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const arg = (flag: string, dflt: number): number => {
  const i = process.argv.indexOf(flag)
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt
}
const LIMIT = arg('--limit', 200)
const CONCURRENCY = arg('--concurrency', 12)
const TIMEOUT_MS = 12_000
const UA =
  'Mozilla/5.0 (compatible; RaineyLagunaSonda/1.0; +https://raineylaguna.com/servicios/sonda/)'

type Fetched =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: FetchFailure }

/** Classify failures instead of collapsing them all to null (the Radar bug). */
async function fetchClassified(raw: string): Promise<Fetched> {
  const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    })
    if (!res.ok) return { ok: false, reason: 'http-error' }
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html')) return { ok: false, reason: 'not-html' }
    return { ok: true, html: await res.text(), finalUrl: res.url || url }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).toLowerCase()
    const cause = String((e as { cause?: unknown })?.cause ?? '').toLowerCase()
    const all = `${msg} ${cause}`
    if (all.includes('abort') || all.includes('timeout')) return { ok: false, reason: 'timeout' }
    if (all.includes('enotfound') || all.includes('eai_again') || all.includes('dns'))
      return { ok: false, reason: 'dns' }
    if (all.includes('econnrefused') || all.includes('econnreset'))
      return { ok: false, reason: 'refused' }
    if (all.includes('cert') || all.includes('tls') || all.includes('ssl'))
      return { ok: false, reason: 'tls' }
    return { ok: false, reason: 'refused' }
  } finally {
    clearTimeout(t)
  }
}

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

const pct = (n: number, d: number) => (d === 0 ? '  -  ' : `${((n / d) * 100).toFixed(1)}%`.padStart(6))
const bar = (n: number, max: number, w = 34) =>
  '#'.repeat(max === 0 ? 0 : Math.round((n / max) * w))

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL!.includes('localhost') ? undefined : { rejectUnauthorized: false },
  })

  const { rows } = await pool.query<{ id: string; district: string; website_url: string }>(
    `SELECT id, district, website_url
       FROM crm_leads
      WHERE website_url IS NOT NULL
        AND website_url <> ''
        AND website_status = 'Has Website'
      ORDER BY md5(id::text)          -- deterministic pseudo-random sample
      LIMIT $1`,
    [LIMIT],
  )
  await pool.end()

  console.log(`\nSonda calibration — ${rows.length} leads, concurrency ${CONCURRENCY}\n`)
  const started = Date.now()

  let done = 0
  const results = await mapLimit(rows, CONCURRENCY, async (lead) => {
    const f = await fetchClassified(lead.website_url)
    done += 1
    if (done % 25 === 0) process.stdout.write(`  ...${done}/${rows.length}\n`)
    const signals: MeasurementSignals = f.ok
      ? detectSignals(f.html, f.finalUrl)
      : unknownSignals()
    const scored = scoreDetected(signals, f.ok ? null : f.reason)
    return { lead, signals, scored, ok: f.ok, reason: f.ok ? null : f.reason }
  })

  const readable = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)

  console.log(`\nelapsed ${((Date.now() - started) / 1000).toFixed(0)}s`)
  console.log(`readable   ${readable.length}/${results.length}`)
  console.log(`unreadable ${failed.length}  (never scored)`)
  const byReason = new Map<string, number>()
  for (const f of failed) byReason.set(f.reason!, (byReason.get(f.reason!) ?? 0) + 1)
  for (const [k, v] of [...byReason].sort((a, b) => b[1] - a[1]))
    console.log(`   ${k.padEnd(12)} ${v}`)

  if (readable.length === 0) {
    console.log('\nNo readable sites — cannot calibrate.')
    return
  }

  // ── decile histogram ────────────────────────────────────────────────────
  const scores = readable.map((r) => r.scored.score).sort((a, b) => a - b)
  const deciles = new Array(10).fill(0)
  for (const s of scores) deciles[Math.min(9, Math.floor(s / 10))] += 1
  const maxD = Math.max(...deciles)
  console.log('\nSCORE DISTRIBUTION (readable only)')
  deciles.forEach((n, i) => {
    console.log(`  ${String(i * 10).padStart(3)}-${String(i * 10 + 9).padEnd(3)} ${String(n).padStart(4)}  ${bar(n, maxD)}`)
  })
  const q = (p: number) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))]
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length)
  console.log(
    `\n  min ${scores[0]}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  max ${scores[scores.length - 1]}`,
  )
  console.log(`  mean ${mean.toFixed(1)}  sd ${sd.toFixed(1)}`)

  // ── band occupancy ──────────────────────────────────────────────────────
  console.log('\nBAND OCCUPANCY (current cuts)')
  let worst = 0
  for (const b of BANDS) {
    const n = readable.filter((r) => r.scored.band === b.id).length
    worst = Math.max(worst, n / readable.length)
    console.log(`  ${b.label.padEnd(13)} ${String(b.min).padStart(3)}-${String(b.max).padEnd(3)} ${String(n).padStart(4)}  ${pct(n, readable.length)}  ${bar(n, readable.length)}`)
  }

  // ── per-signal hit rate ─────────────────────────────────────────────────
  console.log('\nSIGNAL HIT RATES  (present / checked)   flat rates = dead weight')
  for (const [dim, keys] of Object.entries(DIMENSION_KEYS)) {
    console.log(`  ${dim}`)
    for (const k of keys) {
      const checked = readable.filter((r) => r.signals[k] !== null).length
      const hit = readable.filter((r) => r.signals[k] === true).length
      const flag = checked > 0 && (hit / checked < 0.03 || hit / checked > 0.97) ? '  <-- no discrimination' : ''
      console.log(`    ${k.padEnd(22)} ${pct(hit, checked)}  (n=${checked})${flag}`)
    }
  }

  // ── the verdict ─────────────────────────────────────────────────────────
  console.log('\nGATE')
  const distinct = new Set(scores).size
  if (worst >= 0.8) {
    console.log(`  FAIL — ${(worst * 100).toFixed(0)}% of readable sites sit in a single band.`)
    console.log('  Retune cuts or weights before building the report generator.')
  } else if (sd < 8) {
    console.log(`  FAIL — sd ${sd.toFixed(1)} is too tight; scores cluster.`)
  } else {
    console.log(`  PASS — largest band holds ${(worst * 100).toFixed(0)}%, sd ${sd.toFixed(1)}, ${distinct} distinct scores.`)
    console.log('  Bands discriminate. Safe to build scoring-dependent work on top.')
  }
  console.log()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
