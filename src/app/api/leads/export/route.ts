import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export const runtime = 'nodejs'

/**
 * CSV export of leads. Mirrors the list filters (district / niche / stage,
 * soft-delete) but, being a data dump rather than a triage view, includes
 * snoozed leads by default. Explicit column list keeps JSONB blobs out and
 * pins a stable column order.
 *
 *   GET /api/leads/export?district=&niche=&stage=&include_deleted=&include_snoozed=
 */

const COLUMNS = [
  'id',
  'name',
  'district',
  'niche',
  'category',
  'pipeline_stage',
  'potential',
  'phone',
  'email',
  'website_url',
  'website_status',
  'instagram_url',
  'facebook_url',
  'linkedin_url',
  'tiktok_url',
  'address',
  'digital_health_score',
  'manual_audit_score',
  'sereno_customer',
  'next_action',
  'evaluation',
  'strategic_action',
  'source',
  'snoozed_until',
  'deleted_at',
  'created_at',
  'updated_at',
] as const

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s: string
  if (value instanceof Date) s = value.toISOString()
  else if (typeof value === 'boolean') s = value ? 'true' : 'false'
  else s = String(value)
  // Always quote; escape embedded quotes by doubling.
  return `"${s.replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const district = searchParams.get('district')
    const niche = searchParams.get('niche')
    const stage = searchParams.get('stage')
    const includeDeleted = searchParams.get('include_deleted') === 'true'
    // Exports default to comprehensive: snoozed rows are included unless
    // explicitly excluded with include_snoozed=false.
    const includeSnoozed = searchParams.get('include_snoozed') !== 'false'

    let query = `SELECT ${COLUMNS.join(', ')} FROM crm_leads WHERE 1=1`
    const params: any[] = []

    if (!includeDeleted) query += ' AND deleted_at IS NULL'
    if (district && district !== 'all') {
      query += ` AND district = $${params.length + 1}`
      params.push(district)
    }
    if (niche && niche !== 'all') {
      query += ` AND niche = $${params.length + 1}`
      params.push(niche)
    }
    if (stage && stage !== 'all') {
      query += ` AND pipeline_stage = $${params.length + 1}`
      params.push(stage)
    }
    if (!includeSnoozed) {
      query += ' AND (snoozed_until IS NULL OR snoozed_until <= NOW())'
    }
    query += ' ORDER BY created_at DESC'

    const { rows } = await pool.query(query, params)

    const header = COLUMNS.join(',')
    const body = rows
      .map((row) => COLUMNS.map((c) => csvCell((row as Record<string, unknown>)[c])).join(','))
      .join('\r\n')
    // Prepend a UTF-8 BOM so Excel opens accented Spanish text correctly.
    const csv = '\uFEFF' + header + '\r\n' + body + '\r\n'

    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return NextResponse.json({ error: `Failed to export leads: ${message}` }, { status: 500 })
  }
}
