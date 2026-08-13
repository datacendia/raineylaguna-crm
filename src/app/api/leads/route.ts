import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * Pagination.
 *
 * This route accepted `?limit` and ignored it, returning all 36,809 rows as a
 * ~38MB JSON payload on every call. Four dashboard pages fetch it: Pipeline
 * then renders 36,809 kanban cards, and Outreach and Video Audits each render
 * a <select> with 36,809 <option>s. Priority scoring runs client-side over the
 * whole thing afterwards.
 *
 * The default is a page, not everything. Callers that genuinely need more ask
 * for it explicitly and get it in bounded chunks.
 *
 * The response stays a bare ARRAY — every existing consumer does
 * `Array.isArray(d) ? d : []`, and changing the envelope would break all of
 * them at once. Page metadata rides in headers instead, so a client can tell
 * it is looking at a slice rather than the base. Silently showing 500 of
 * 36,809 with no indication would just replace one wrong number with another.
 */
const DEFAULT_LIMIT = 500
const MAX_LIMIT = 2000

function readPaging(searchParams: URLSearchParams): { limit: number; offset: number } {
  const rawLimit = Number(searchParams.get('limit'))
  const rawOffset = Number(searchParams.get('offset'))
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
  return { limit, offset }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city')
    const district = searchParams.get('district')
    const niche = searchParams.get('niche')
    const stage = searchParams.get('stage')
    // include_snoozed=true → return everything; default hides leads whose
    // snoozed_until is still in the future so the daily-triage list stays small.
    const includeSnoozed = searchParams.get('include_snoozed') === 'true'
    // include_deleted=true → include soft-deleted leads (trash view); default off.
    const includeDeleted = searchParams.get('include_deleted') === 'true'

    let query = 'SELECT * FROM crm_leads WHERE 1=1'
    const params: any[] = []

    if (!includeDeleted) {
      query += ' AND deleted_at IS NULL'
    }

    if (city && city !== 'all') {
      query += ` AND city = $${params.length + 1}`
      params.push(city)
    }

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

    // Total for THESE filters, taken before paging is applied — otherwise the
    // client cannot tell whether it is seeing everything.
    const countResult = await pool.query(
      query.replace('SELECT * FROM crm_leads', 'SELECT COUNT(*)::int AS total FROM crm_leads'),
      params,
    )
    const total: number = countResult.rows[0]?.total ?? 0

    // Surface leads needing attention first: snooze just expired (highest
    // urgency), then by created_at for stable ordering.
    query += ` ORDER BY
      CASE WHEN snoozed_until IS NOT NULL AND snoozed_until <= NOW() THEN 0 ELSE 1 END,
      created_at DESC`

    // `id` is appended to the sort so the ordering is total. Without it, rows
    // sharing a created_at can be returned in a different order per query, and
    // a row can appear on two pages or on none — the classic paging bug where
    // the operator never sees a particular lead.
    query += `, id`

    const { limit, offset } = readPaging(searchParams)
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const result = await pool.query(query, params)
    return NextResponse.json(result.rows, {
      headers: {
        'X-Total-Count': String(total),
        'X-Limit': String(limit),
        'X-Offset': String(offset),
        'X-Has-More': String(offset + result.rows.length < total),
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      city,
      district,
      niche,
      instagram_active,
      website_url,
      website_status,
      evaluation,
      strategic_action,
    } = body

    const result = await pool.query(
      `INSERT INTO crm_leads
       (name, city, district, niche, instagram_active, website_url, website_status, evaluation, strategic_action)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [name, city ?? 'Lima', district, niche, instagram_active, website_url, website_status, evaluation, strategic_action]
    )

    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
