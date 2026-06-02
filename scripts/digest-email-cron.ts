/**
 * Monday 9am digest auto-email. ROADMAP item: digest auto-email cron.
 *
 * Renders the same weekly numbers as /dashboard/digest (shared src/lib/digest.ts)
 * and emails them via Resend to every address in DIGEST_EMAIL_TO.
 *
 * Operator setup:
 *   Railway cron:  npm run digest-email
 *   Schedule:      0 14 * * 1   (09:00 America/Lima == 14:00 UTC, Mondays)
 *   Env required:  DATABASE_URL, RESEND_API_KEY, RESEND_FROM, DIGEST_EMAIL_TO
 *   Env optional:  CRM_PUBLIC_BASE_URL (makes lead names clickable in the email)
 *                  DIGEST_DRY_RUN=true (render + print, do not send)
 *
 * Degraded mode: if Resend or DIGEST_EMAIL_TO is unset, the script logs a
 * warning and exits 0 (a missing optional channel is not a cron failure).
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { loadDigest, renderDigestHtml } from '../src/lib/digest'
import { getResendConfig, sendEmail, isEmail } from '../src/lib/resend'

config({ path: '.env.local' })

const DRY_RUN = process.env.DIGEST_DRY_RUN === 'true'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

  const recipients = (process.env.DIGEST_EMAIL_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => isEmail(s))

  if (recipients.length === 0) {
    console.warn('[digest-email] DIGEST_EMAIL_TO is empty or invalid — nothing to send. Exiting.')
    return
  }

  const cfg = getResendConfig()
  if (!cfg && !DRY_RUN) {
    console.warn('[digest-email] Resend not configured (RESEND_API_KEY / RESEND_FROM) — exiting.')
    return
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const data = await loadDigest(pool)
    const baseUrl = process.env.CRM_PUBLIC_BASE_URL?.replace(/\/+$/, '')
    const html = renderDigestHtml(data, baseUrl)
    const subject = `Monday digest · ${new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })} — Rainey Laguna`

    console.log(
      `[digest-email] counts: added=${data.counts.added} outreach=${data.counts.outreach} ` +
        `proposals=${data.counts.proposals_out} wins=${data.counts.wins} ` +
        `cold=${data.cold.length} top=${data.topPotential.length}`,
    )

    if (DRY_RUN || !cfg) {
      console.log(`[digest-email] DRY_RUN — would email ${recipients.length} recipient(s); html ${html.length} bytes`)
      return
    }

    let ok = 0
    let failed = 0
    for (const to of recipients) {
      const res = await sendEmail(cfg, to, subject, { html })
      if (res.ok) {
        ok++
        console.log(`  ✓ sent to ${to} (${res.id ?? 'no-id'})`)
      } else {
        failed++
        console.error(`  ✗ failed ${to}: ${res.error}`)
      }
    }
    console.log(`[digest-email] done: ${ok} sent, ${failed} failed`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[digest-email] fatal:', err)
  process.exit(1)
})
