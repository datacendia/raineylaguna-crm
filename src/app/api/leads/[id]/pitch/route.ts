import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generatePitchForLead } from '@/lib/generate-pitch'

export const runtime = 'nodejs'
/** HTML generation can take a while; allow more than the default. */
export const maxDuration = 120

/** POST → generate a fresh pitch demo for this lead. Returns the new row. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const leadRes = await pool.query('SELECT * FROM crm_leads WHERE id = $1 AND deleted_at IS NULL', [id])
    if (leadRes.rows.length === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    const pitch = await generatePitchForLead(pool, leadRes.rows[0])
    return NextResponse.json(pitch, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[pitch] generate failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** GET → latest pitch for this lead, or null. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const res = await pool.query(
      `SELECT * FROM crm_lead_pitches
       WHERE lead_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id],
    )
    return NextResponse.json(res.rows[0] ?? null)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch pitch' }, { status: 500 })
  }
}
