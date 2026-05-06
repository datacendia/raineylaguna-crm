import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateDraftForLead } from '@/lib/draft-outreach'

export const runtime = 'nodejs'

/** POST → generate a fresh draft. Returns the new draft row. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const leadRes = await pool.query('SELECT * FROM crm_leads WHERE id = $1', [id])
    if (leadRes.rows.length === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    const draft = await generateDraftForLead(pool, leadRes.rows[0])
    return NextResponse.json(draft, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[draft-outreach] generate failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** GET → latest draft (any status) for this lead, or null. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await pool.query(
      `SELECT * FROM crm_outreach_drafts
       WHERE lead_id = $1
       ORDER BY generated_at DESC
       LIMIT 1`,
      [id]
    )
    return NextResponse.json(res.rows[0] ?? null)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch draft' }, { status: 500 })
  }
}

/** PATCH → mark draft as sent/discarded, optionally update body. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = (await request.json()) as { draft_id: string; status?: string; body?: string }
    if (!body.draft_id) {
      return NextResponse.json({ error: 'draft_id required' }, { status: 400 })
    }
    const allowedStatus = new Set(['pending', 'sent', 'discarded'])
    const fields: string[] = []
    const values: unknown[] = []
    if (body.status) {
      if (!allowedStatus.has(body.status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      }
      values.push(body.status)
      fields.push(`status = $${values.length}`)
      if (body.status !== 'pending') {
        fields.push(`acted_at = NOW()`)
      }
    }
    if (typeof body.body === 'string') {
      values.push(body.body)
      fields.push(`body = $${values.length}`)
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }
    values.push(body.draft_id, id)
    const res = await pool.query(
      `UPDATE crm_outreach_drafts
       SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND lead_id = $${values.length}
       RETURNING *`,
      values
    )
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'draft not found' }, { status: 404 })
    }
    return NextResponse.json(res.rows[0])
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 })
  }
}
