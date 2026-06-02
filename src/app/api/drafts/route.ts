import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/drafts?status=pending|sent|discarded|all
 *
 * Global AI-draft review queue (ROADMAP #1). Returns drafts across all leads
 * joined with the minimal lead context the queue UI needs to triage + send.
 * Soft-deleted leads are excluded.
 */
export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get('status') ?? 'pending'
  try {
    const res = await pool.query(
      `SELECT d.id, d.lead_id, d.channel, d.body, d.model, d.prompt_version,
              d.status, d.generated_at, d.acted_at, d.acted_by, d.sent_event_id,
              l.name AS lead_name, l.district, l.niche, l.phone, l.email,
              l.digital_health_score
         FROM crm_outreach_drafts d
         JOIN crm_leads l ON l.id = d.lead_id
        WHERE ($1 = 'all' OR d.status = $1)
          AND l.deleted_at IS NULL
        ORDER BY d.generated_at DESC
        LIMIT 200`,
      [status],
    )
    return NextResponse.json(res.rows)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
