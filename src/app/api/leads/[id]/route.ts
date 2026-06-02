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
    // Restore a soft-deleted lead.
    if (body.restore === true) {
      const r = await pool.query(
        'UPDATE crm_leads SET deleted_at = NULL WHERE id = $1 RETURNING *',
        [id],
      )
      if (r.rows.length === 0) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      }
      return NextResponse.json(r.rows[0])
    }
    const allowed = ['name', 'email', 'phone', 'website_url', 'instagram_url', 'facebook_url', 'linkedin_url', 'tiktok_url', 'instagram_active', 'website_status', 'pipeline_stage', 'notes', 'evaluation', 'strategic_action', 'next_action', 'snoozed_until']
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // Soft-delete by default (recoverable via PATCH { restore: true });
    // ?hard=true performs an irreversible delete.
    const hard = new URL(request.url).searchParams.get('hard') === 'true'
    if (hard) {
      await pool.query('DELETE FROM crm_leads WHERE id = $1', [id])
    } else {
      await pool.query('UPDATE crm_leads SET deleted_at = NOW() WHERE id = $1', [id])
    }
    return NextResponse.json({ success: true, hard })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
