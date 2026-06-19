/**
 * POST /api/leads/public
 *
 * Public lead-intake endpoint, called by the marketing site (`raineylaguna-next`)
 * after rate-limiting and bot-trapping at the edge. Authenticated via the
 * shared secret CRM_LEAD_INTAKE_SECRET in the X-Lead-Intake-Secret header.
 *
 * Body (forwarded by `raineylaguna-next/src/app/api/lead/route.ts`):
 *   {
 *     name, email, phone, district?, niche?, notes?, source?,
 *     audit?: {                         // present for audit-tool leads
 *       url?: string,                   // site that was audited
 *       score?: number,                 // 0-100 overall (same scale as digital_health_score)
 *       findings?: { severity, title, detail }[],
 *       runId?: string,                 // persisted audit-run id on the site
 *       reportUrl?: string,             // absolute /auditoria/r/<id> deep-link
 *     }
 *   }
 *
 * Behaviour:
 *   - Validates the shared secret in constant time.
 *   - Requires `name` plus at least one of `email` or `phone`.
 *   - De-duplicates: if an existing lead with the same email or phone exists,
 *     append the new note to its notes column instead of creating a duplicate.
 *   - Inserts (or updates) into crm_leads with pipeline_stage='Lead'.
 *   - Normalises `source` to the canonical lead-source vocabulary (lead-source.ts).
 *   - When `audit` is present, populates website_url / digital_health_score /
 *     audit_findings / audited_at so the prospect's self-audit shows up exactly
 *     like a CRM-run one — without re-auditing. On dedupe it only fills these
 *     when the lead has no prior audit, so a richer CRM-run audit is never
 *     clobbered.
 *
 * Returns: { ok: true, id, deduped: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import pool from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { createDistributedRateLimiter, ipFromHeaders } from '@/lib/rate-limit'
import { normalizeSource } from '@/lib/lead-source'
import type { AuditFindings, AuditFlag, AuditFlagSeverity } from '@/lib/types'

export const runtime = 'nodejs'

/**
 * Per-IP rate limit, defence-in-depth behind the shared secret. The endpoint
 * is normally called server-to-server by the marketing site (one IP, a few
 * leads/day), so a generous cap never bites legitimate traffic but still caps
 * a flood from any single source. Redis-backed across instances when REDIS_URL
 * is set; in-process otherwise.
 */
const intakeLimiter = createDistributedRateLimiter('public-intake', {
  windowMs: 60_000,
  max: 120,
})

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** Raw audit payload as the marketing site forwards it. Loosely typed because
 *  it arrives over the wire; mapIntakeAudit narrows it. */
type IntakeAuditFinding = { severity?: string; title?: string; detail?: string }
type IntakeAudit = {
  url?: string | null
  score?: number | null
  findings?: IntakeAuditFinding[] | null
  runId?: string | null
  reportUrl?: string | null
}

/** The CRM's AuditFindings shape plus provenance + a link back to the exact
 *  report the prospect saw. The extra keys ride along in the jsonb column; the
 *  existing leads/detail renderer reads only the AuditFindings keys. */
type IntakeAuditFindings = AuditFindings & {
  source: 'website-audit-tool'
  runId: string | null
  reportUrl: string | null
}

function toSeverity(s?: string): AuditFlagSeverity {
  return s === 'high' || s === 'medium' || s === 'low' ? s : 'low'
}

/**
 * Map the marketing site's audit payload into the CRM's AuditFindings shape so
 * the leads list + detail page render it with the same component used for a
 * CRM-run audit. Returns null when the payload carries no usable score.
 */
function mapIntakeAudit(
  audit: IntakeAudit | null | undefined,
): { score: number; websiteUrl: string | null; findings: IntakeAuditFindings } | null {
  if (!audit || typeof audit.score !== 'number' || !Number.isFinite(audit.score)) {
    return null
  }
  const score = Math.max(0, Math.min(100, Math.round(audit.score)))
  const flags: AuditFlag[] = Array.isArray(audit.findings)
    ? audit.findings
        .filter((f): f is IntakeAuditFinding => Boolean(f && f.title))
        .map((f, i) => ({
          id: `web_${i}`,
          label: f.detail ? `${f.title} — ${f.detail}` : String(f.title),
          severity: toSeverity(f.severity),
        }))
    : []
  return {
    score,
    websiteUrl: audit.url ? String(audit.url).slice(0, 500) : null,
    findings: {
      score,
      hadSite: true,
      reachable: true,
      scores: { performance: null, seo: null, accessibility: null, bestPractices: null },
      metrics: { lcpMs: null },
      flags,
      summary: 'Auto-auditoría desde raineylaguna.com (sitio del prospecto)',
      source: 'website-audit-tool',
      runId: audit.runId ?? null,
      reportUrl: audit.reportUrl ?? null,
    },
  }
}

export async function POST(request: NextRequest) {
  const rl = await intakeLimiter.check(ipFromHeaders(request.headers))
  if (!rl.ok) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const expected = serverEnv.CRM_LEAD_INTAKE_SECRET
  const provided = request.headers.get('X-Lead-Intake-Secret')

  if (!expected || expected === 'change_me_to_a_long_random_string') {
    return NextResponse.json(
      { ok: false, error: 'CRM_LEAD_INTAKE_SECRET not configured on server' },
      { status: 500 },
    )
  }
  if (!provided || !constantTimeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const email = body.email ? String(body.email).trim().toLowerCase() : null
  const phone = body.phone ? String(body.phone).replace(/\D/g, '') : null
  const district = body.district ? String(body.district).trim() : 'Otro'
  const niche = body.niche ? String(body.niche).trim() : 'Otro'
  const notes = body.notes ? String(body.notes).trim() : null
  const source = normalizeSource(body.source) // canonical channel bucket (ROADMAP #13)
  const audit = mapIntakeAudit(body.audit as IntakeAudit | undefined)

  // Bind values shared by the insert and dedupe paths.
  const websiteUrl = audit?.websiteUrl ?? null
  const auditScore = audit?.score ?? null
  const auditFindingsJson = audit ? JSON.stringify(audit.findings) : null

  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 })
  if (!email && !phone) {
    return NextResponse.json({ ok: false, error: 'email or phone required' }, { status: 400 })
  }

  // De-dupe by email or phone
  const existing = await pool.query(
    `SELECT id, notes FROM crm_leads
     WHERE (email IS NOT NULL AND email = $1)
        OR (phone IS NOT NULL AND phone = $2)
     LIMIT 1`,
    [email, phone],
  )

  if (existing.rowCount && existing.rows[0]) {
    const row = existing.rows[0]
    const merged = [row.notes, notes && `[${new Date().toISOString().slice(0, 10)}] ${notes}`]
      .filter(Boolean)
      .join('\n\n')
    // Keep first-touch source attribution; only fill website_url when missing;
    // only write the audit when the lead has no prior (possibly richer,
    // CRM-run) audit — never clobber one.
    await pool.query(
      `UPDATE crm_leads
          SET notes = $1,
              source = COALESCE(source, $3),
              website_url = COALESCE(website_url, $4),
              digital_health_score =
                CASE WHEN audited_at IS NULL AND $6::jsonb IS NOT NULL
                     THEN $5 ELSE digital_health_score END,
              audit_findings =
                CASE WHEN audited_at IS NULL AND $6::jsonb IS NOT NULL
                     THEN $6::jsonb ELSE audit_findings END,
              audited_at =
                CASE WHEN audited_at IS NULL AND $6::jsonb IS NOT NULL
                     THEN NOW() ELSE audited_at END,
              updated_at = NOW()
        WHERE id = $2`,
      [merged, row.id, source, websiteUrl, auditScore, auditFindingsJson],
    )
    return NextResponse.json({ ok: true, id: row.id, deduped: true })
  }

  const inserted = await pool.query(
    `INSERT INTO crm_leads
       (name, email, phone, district, niche, notes, source, pipeline_stage,
        website_url, digital_health_score, audit_findings, audited_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Lead',
             $8, $9, $10::jsonb,
             CASE WHEN $10::jsonb IS NOT NULL THEN NOW() ELSE NULL END)
     RETURNING id`,
    [name, email, phone, district, niche, notes, source, websiteUrl, auditScore, auditFindingsJson],
  )

  return NextResponse.json(
    { ok: true, id: inserted.rows[0].id, deduped: false },
    { status: 201 },
  )
}
