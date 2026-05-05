import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lead_id, channel, notes } = body

    const result = await pool.query(
      `INSERT INTO crm_outreach_events (lead_id, channel, notes, status)
       VALUES ($1, $2, $3, 'Pending')
       RETURNING *`,
      [lead_id, channel, notes]
    )

    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to log outreach' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lead_id = searchParams.get('lead_id')

    let query = 'SELECT * FROM crm_outreach_events'
    const params: any[] = []

    if (lead_id) {
      query += ' WHERE lead_id = $1'
      params.push(lead_id)
    }

    query += ' ORDER BY created_at DESC'

    const result = await pool.query(query, params)
    return NextResponse.json(result.rows)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch outreach events' }, { status: 500 })
  }
}
