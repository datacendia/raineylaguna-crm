/**
 * POST /api/leads/public
 *
 * Public lead-intake endpoint, called by the marketing site (`raineylaguna-next`)
 * after rate-limiting and bot-trapping at the edge. Authenticated via the
 * shared secret CRM_LEAD_INTAKE_SECRET in the X-Lead-Intake-Secret header.
 *
 * Body (forwarded by `raineylaguna-next/src/app/api/lead/route.ts`):
 *   { name, email, phone, district?, niche?, notes?, source? }
 *
 * Behaviour:
 *   - Validates the shared secret in constant time.
 *   - Requires `name` plus at least one of `email` or `phone`.
 *   - De-duplicates: if an existing lead with the same email or phone exists,
 *     append the new note to its notes column instead of creating a duplicate.
 *   - Inserts (or updates) into crm_leads with pipeline_stage='Lead'.
 *
 * Returns: { ok: true, id, deduped: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import pool from '@/lib/db'

export const runtime = 'nodejs'

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function POST(request: NextRequest) {
  const expected = process.env.CRM_LEAD_INTAKE_SECRET
  const provided = request.headers.get('X-Lead-Intake-Secret')

  if (!expected || expected === 'change_me_to_a_long_random_string') {
    return NextResponse.json(
      { ok: false, error: 'CRM_LEAD_INTAKE_SECRET not configured on server' },
      { status: 500 },
    )
  }
  if (!provided || !constantTimeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const email = body.email ? String(body.email).trim().toLowerCase() : null
  const phone = body.phone ? String(body.phone).replace(/\D/g, '') : null
  const district = body.district ? String(body.district).trim() : 'Otro'
  const niche = body.niche ? String(body.niche).trim() : 'Otro'
  const notes = body.notes ? String(body.notes).trim() : null
  const source = body.source ? String(body.source).trim().slice(0, 100) : 'public-intake'

  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 })
  if (!email && !phone) {
    return NextResponse.json({ ok: false, error: 'email or phone required' }, { status: 400 })
  }

  // De-dupe by email or phone
  const existing = await pool.query(
    `SELECT id, notes FROM crm_leads
     WHERE (email IS NOT NULL AND email = $1)
        OR (phone IS NOT NULL AND phone = $2)
     LIMIT 1`,
    [email, phone],
  )

  if (existing.rowCount && existing.rows[0]) {
    const row = existing.rows[0]
    const merged = [row.notes, notes && `[${new Date().toISOString().slice(0, 10)}] ${notes}`]
      .filter(Boolean)
      .join('\n\n')
    await pool.query(
      `UPDATE crm_leads SET notes = $1, updated_at = NOW() WHERE id = $2`,
      [merged, row.id],
    )
    return NextResponse.json({ ok: true, id: row.id, deduped: true })
  }

  const inserted = await pool.query(
    `INSERT INTO crm_leads (name, email, phone, district, niche, notes, source, pipeline_stage)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Lead')
     RETURNING id`,
    [name, email, phone, district, niche, notes, source],
  )

  return NextResponse.json(
    { ok: true, id: inserted.rows[0].id, deduped: false },
    { status: 201 },
  )
}
