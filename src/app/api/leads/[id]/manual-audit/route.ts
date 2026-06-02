import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { computeOverall, type ManualAudit } from '@/lib/audit-workbench'

export const runtime = 'nodejs'

/** GET → the saved manual-audit snapshot (if any) for this lead. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const res = await pool.query(
      'SELECT manual_audit, manual_audit_score, manual_audited_at FROM crm_leads WHERE id = $1',
      [id],
    )
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    return NextResponse.json(res.rows[0])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PUT → persist the workbench snapshot. The overall score (and scored/scope
 * counts) are recomputed server-side from the submitted scores + weights, so
 * the denormalised `manual_audit_score` column can never drift from the
 * stored detail and the client can't spoof it.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = (await req.json().catch(() => ({}))) as { audit?: ManualAudit }
    const audit = body.audit
    if (!audit || typeof audit !== 'object' || !audit.items || !audit.weights) {
      return NextResponse.json({ error: 'Invalid audit payload' }, { status: 400 })
    }
    const { overall, scored, scope } = computeOverall(audit.items, audit.weights)
    const snapshot: ManualAudit = { ...audit, version: 1, overall, scored, scope }
    const updated = await pool.query(
      `UPDATE crm_leads
          SET manual_audit = $2, manual_audit_score = $3, manual_audited_at = now()
        WHERE id = $1
      RETURNING manual_audit, manual_audit_score, manual_audited_at`,
      [id, JSON.stringify(snapshot), overall],
    )
    if (updated.rows.length === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    return NextResponse.json(updated.rows[0])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[manual-audit] save failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
