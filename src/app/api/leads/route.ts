import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

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

    // Surface leads needing attention first: snooze just expired (highest
    // urgency), then by created_at for stable ordering.
    query += ` ORDER BY
      CASE WHEN snoozed_until IS NOT NULL AND snoozed_until <= NOW() THEN 0 ELSE 1 END,
      created_at DESC`

    const result = await pool.query(query, params)
    return NextResponse.json(result.rows)
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
