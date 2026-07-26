/**
 * Priority-score calibration report.
 *
 * `src/lib/priority-score.ts` says of its own weights: "chosen by gut + Q1
 * outreach data; tune later". This script is the "later" — it answers the only
 * question worth asking before anyone tries to fit a model:
 *
 *     Does a higher priority score actually predict a better outcome?
 *
 * It is deliberately a REPORT, not a fitter. Read-only, no writes, safe to run
 * against production.
 *
 * ── Why this label ────────────────────────────────────────────────────────
 * The obvious label — `crm_leads.pipeline_stage` — is the wrong one. Lead →
 * Contacted → Audited → Proposal are mostly records of what the OPERATOR did,
 * not what the prospect did, so scoring against them mostly measures which
 * leads got worked, not which leads were good. That is label leakage.
 *
 * We use a prospect action instead: an outreach event reaching status
 * 'Replied' or 'Interested'. The denominator is leads actually contacted
 * (`sent_at IS NOT NULL`), so we measure "given I reached out, did they bite?"
 * rather than "did I get round to them?".
 *
 * ── Censoring ─────────────────────────────────────────────────────────────
 * A lead contacted yesterday has not failed to reply; it has not had time.
 * Anything contacted inside MATURATION_DAYS is excluded, otherwise recent
 * leads are systematically mislabelled as negatives.
 *
 * ── Reading the output ────────────────────────────────────────────────────
 * Wilson 90% intervals are shown because at these sample sizes the point
 * estimate is nearly meaningless on its own. If the intervals for every band
 * overlap each other, the score is not yet distinguishable from noise — that
 * is a real, useful, honest answer, not a failure of the report.
 *
 * Usage: npm run calibrate
 */
import { Pool } from 'pg'
import { config } from 'dotenv'
import { computePriorityScore } from '../src/lib/priority-score'
import type { Lead } from '../src/lib/types'

config({ path: '.env.local' })

/** Days a contacted lead must age before a non-reply counts as a real negative. */
const MATURATION_DAYS = 14
/** Minimum matured, contacted leads before any table is worth printing. */
const MIN_N = 30
/** Minimum positive outcomes before band comparisons mean anything. */
const MIN_POSITIVES = 5
/** Empirical-Bayes prior strength for per-niche shrinkage (pseudo-observations). */
const KAPPA = 30

type Row = Lead & { replied: boolean }

/**
 * Wilson score interval — closed form, and unlike the normal approximation it
 * stays inside [0,1] and behaves sensibly at k=0 or k=n, which is exactly the
 * regime this data lives in.
 */
function wilson(k: number, n: number, z = 1.645): [number, number] {
  if (n === 0) return [0, 0]
  const den = n + z * z
  const centre = (k + (z * z) / 2) / den
  const half = (z / den) * Math.sqrt((k * (n - k)) / n + (z * z) / 4)
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + '%'

function bar(rate: number, max: number, width = 24) {
  if (max <= 0) return ''
  return '█'.repeat(Math.round((rate / max) * width))
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  // One row per contacted, matured lead, with a boolean prospect-response label.
  const { rows } = await pool.query<Row>(
    `
    SELECT l.*,
           BOOL_OR(e.status IN ('Replied', 'Interested')) AS replied
      FROM crm_leads l
      JOIN crm_outreach_events e ON e.lead_id = l.id
     WHERE l.deleted_at IS NULL
       AND COALESCE(l.is_chain, false) = false
       AND e.sent_at IS NOT NULL
       AND e.sent_at < now() - ($1 || ' days')::interval
     GROUP BY l.id
    `,
    [String(MATURATION_DAYS)],
  )

  const n = rows.length
  const positives = rows.filter((r) => r.replied).length

  console.log(`\nPriority-score calibration`)
  console.log(`  label:      outreach status reached 'Replied' or 'Interested'`)
  console.log(`  population: contacted, non-chain, not deleted, aged ≥ ${MATURATION_DAYS}d`)
  console.log(`  n = ${n}, positives = ${positives}\n`)

  if (n < MIN_N || positives < MIN_POSITIVES) {
    console.log(`  ⚠ Not enough matured data to calibrate.`)
    console.log(`    Need ≥ ${MIN_N} contacted leads and ≥ ${MIN_POSITIVES} positive responses;`)
    console.log(`    have ${n} and ${positives}.`)
    console.log(`\n    This is the honest answer, not a bug. Until outreach has run at`)
    console.log(`    volume and matured, the weights in priority-score.ts cannot be`)
    console.log(`    validated against anything — keep them as-is rather than tuning`)
    console.log(`    against noise.\n`)
    await pool.end()
    return
  }

  const now = new Date()
  const scored = rows.map((r) => ({ ...r, ...computePriorityScore(r, now) }))

  // ── Band table: the buckets the operator actually acts on ────────────────
  const BANDS = ['Crítico', 'Alto', 'Medio', 'Bajo'] as const
  console.log(`  Response rate by score band`)
  console.log(`  ${'band'.padEnd(9)} ${'n'.padStart(5)} ${'resp'.padStart(5)}  ${'rate'.padStart(6)}  90% interval`)

  const byBand = BANDS.map((b) => {
    const g = scored.filter((s) => s.band === b)
    const k = g.filter((s) => s.replied).length
    return { band: b, n: g.length, k, rate: g.length ? k / g.length : 0 }
  })
  const maxRate = Math.max(...byBand.map((b) => b.rate), 0.0001)

  for (const b of byBand) {
    const [lo, hi] = wilson(b.k, b.n)
    const iv = b.n ? `[${pct(lo)}, ${pct(hi)}]` : '—'
    console.log(
      `  ${b.band.padEnd(9)} ${String(b.n).padStart(5)} ${String(b.k).padStart(5)}  ${pct(b.rate)}  ${iv}  ${bar(b.rate, maxRate)}`,
    )
  }

  // ── Monotonicity verdict ─────────────────────────────────────────────────
  const present = byBand.filter((b) => b.n > 0)
  const monotone = present.every((b, i) => i === 0 || present[i - 1].rate >= b.rate)
  const spread = present.length
    ? Math.max(...present.map((b) => b.rate)) - Math.min(...present.map((b) => b.rate))
    : 0
  const top = present[0]
  const bottom = present[present.length - 1]
  const overlap =
    top && bottom && present.length > 1
      ? wilson(top.k, top.n)[0] <= wilson(bottom.k, bottom.n)[1]
      : true

  console.log(`\n  Verdict`)
  if (!monotone) {
    console.log(`  ✗ NOT monotone — a higher band does not mean a better response rate.`)
    console.log(`    At least one component is mis-signed. Do not tune; investigate.`)
  } else if (overlap) {
    console.log(`  ~ Directionally monotone, but the top and bottom band intervals overlap.`)
    console.log(`    Spread is ${(spread * 100).toFixed(1)}pp. The ordering is not yet`)
    console.log(`    distinguishable from noise — keep collecting before re-weighting.`)
  } else {
    console.log(`  ✓ Monotone and separated — the score carries real signal.`)
    console.log(`    Tuning the weights is now justified.`)
  }

  // ── Per-niche rates with empirical-Bayes shrinkage ───────────────────────
  // Raw per-niche rates on a handful of leads are mostly noise. Shrink each
  // toward the global rate: p̂ = (k + κp̄) / (n + κ). The gap between raw and
  // shrunk is the honest measure of how little a small niche actually tells you.
  const global = positives / n
  const niches = [...new Set(scored.map((s) => s.niche).filter(Boolean))]
  if (niches.length) {
    console.log(`\n  Response rate by niche (global rate ${pct(global)}, κ=${KAPPA})`)
    console.log(`  ${'niche'.padEnd(26)} ${'n'.padStart(4)} ${'resp'.padStart(5)}  ${'raw'.padStart(6)}  ${'shrunk'.padStart(6)}`)
    const stats = niches
      .map((nm) => {
        const g = scored.filter((s) => s.niche === nm)
        const k = g.filter((s) => s.replied).length
        return {
          nm: nm as string,
          n: g.length,
          k,
          raw: g.length ? k / g.length : 0,
          shrunk: (k + KAPPA * global) / (g.length + KAPPA),
        }
      })
      .sort((a, b) => b.shrunk - a.shrunk)
    for (const s of stats) {
      console.log(
        `  ${s.nm.padEnd(26)} ${String(s.n).padStart(4)} ${String(s.k).padStart(5)}  ${pct(s.raw)}  ${pct(s.shrunk)}`,
      )
    }
    console.log(
      `\n  The shrunk column is the one to trust. Where raw and shrunk diverge`,
    )
    console.log(`  sharply, that niche has too few observations to justify its weight`)
    console.log(`  in DEFAULT_WEIGHTS.niche.weights.`)
  }

  console.log()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
