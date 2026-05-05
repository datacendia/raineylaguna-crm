import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const lead = await pool.query('SELECT * FROM crm_leads WHERE id = $1', [id])
    if (lead.rows.length === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    const outreach = await pool.query(
      'SELECT * FROM crm_outreach_events WHERE lead_id = $1 ORDER BY created_at DESC',
      [id]
    )
    const audits = await pool.query(
      'SELECT * FROM crm_video_audits WHERE lead_id = $1 ORDER BY created_at DESC',
      [id]
    )
    return NextResponse.json({
      lead: lead.rows[0],
      outreach: outreach.rows,
      audits: audits.rows,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const allowed = ['name', 'website_url', 'pipeline_stage', 'notes', 'evaluation', 'strategic_action']
    const fields: string[] = []
    const values: any[] = []
    let idx = 1
    for (const key of allowed) {
      if (key in body) {
        fields.push(`${key} = $${idx++}`)
        values.push(body[key])
      }
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    values.push(id)
    const result = await pool.query(
      `UPDATE crm_leads SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )
    return NextResponse.json(result.rows[0])
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await pool.query('DELETE FROM crm_leads WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
