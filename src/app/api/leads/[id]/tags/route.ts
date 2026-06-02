import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export const runtime = 'nodejs'

/** GET → string[] of tag names for the lead, alphabetical. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const res = await pool.query<{ tag_name: string }>(
      'SELECT tag_name FROM crm_tags WHERE lead_id = $1 ORDER BY tag_name',
      [id],
    )
    return NextResponse.json(res.rows.map((r) => r.tag_name))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** POST { tag } → add a tag (idempotent via the unique index). Returns the full list. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const { tag } = (await req.json().catch(() => ({}))) as { tag?: string }
    const name = (tag ?? '').trim()
    if (!name) return NextResponse.json({ error: 'tag required' }, { status: 400 })
    if (name.length > 100) return NextResponse.json({ error: 'tag too long' }, { status: 400 })

    const lead = await pool.query('SELECT 1 FROM crm_leads WHERE id = $1 AND deleted_at IS NULL', [id])
    if (lead.rows.length === 0) {
      return NextResponse.json({ error: 'lead not found' }, { status: 404 })
    }
    await pool.query(
      `INSERT INTO crm_tags (lead_id, tag_name) VALUES ($1, $2)
       ON CONFLICT (lead_id, tag_name) DO NOTHING`,
      [id, name],
    )
    const res = await pool.query<{ tag_name: string }>(
      'SELECT tag_name FROM crm_tags WHERE lead_id = $1 ORDER BY tag_name',
      [id],
    )
    return NextResponse.json(res.rows.map((r) => r.tag_name), { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** DELETE ?tag=name → remove a tag. Returns the remaining list. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const name = (new URL(req.url).searchParams.get('tag') ?? '').trim()
    if (!name) return NextResponse.json({ error: 'tag required' }, { status: 400 })
    await pool.query('DELETE FROM crm_tags WHERE lead_id = $1 AND tag_name = $2', [id, name])
    const res = await pool.query<{ tag_name: string }>(
      'SELECT tag_name FROM crm_tags WHERE lead_id = $1 ORDER BY tag_name',
      [id],
    )
    return NextResponse.json(res.rows.map((r) => r.tag_name))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
