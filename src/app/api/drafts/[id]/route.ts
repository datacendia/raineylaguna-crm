import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export const runtime = 'nodejs'

/**
 * PATCH /api/drafts/[id]
 *
 * Edit a draft's body or discard it from the queue. Sending is a separate,
 * side-effecting action — see POST /api/drafts/[id]/send.
 *
 * Body: { body?: string; status?: 'pending' | 'discarded' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = (await request.json().catch(() => ({}))) as {
      body?: string
      status?: string
    }
    const fields: string[] = []
    const values: unknown[] = []

    if (typeof body.body === 'string') {
      values.push(body.body)
      fields.push(`body = $${values.length}`)
    }
    if (body.status) {
      // 'sent' is reachable only through the send route, never a bare PATCH.
      if (!['pending', 'discarded'].includes(body.status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      }
      values.push(body.status)
      fields.push(`status = $${values.length}`)
      values.push(body.status === 'discarded' ? new Date().toISOString() : null)
      fields.push(`acted_at = $${values.length}`)
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }
    values.push(id)
    const res = await pool.query(
      `UPDATE crm_outreach_drafts SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    )
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'draft not found' }, { status: 404 })
    }
    return NextResponse.json(res.rows[0])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
