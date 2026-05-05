import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lead_id, loom_url } = body

    const result = await pool.query(
      `INSERT INTO crm_video_audits (lead_id, loom_url, conversion_status)
       VALUES ($1, $2, 'Pending')
       RETURNING *`,
      [lead_id, loom_url]
    )

    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add video audit' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lead_id = searchParams.get('lead_id')

    let query = 'SELECT * FROM crm_video_audits'
    const params: any[] = []

    if (lead_id) {
      query += ' WHERE lead_id = $1'
      params.push(lead_id)
    }

    query += ' ORDER BY created_at DESC'

    const result = await pool.query(query, params)
    return NextResponse.json(result.rows)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch video audits' }, { status: 500 })
  }
}
