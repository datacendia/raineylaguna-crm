import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { complete } from '@/lib/anthropic'

export const runtime = 'nodejs'

const PROMPT_VERSION = 'v1-2026-05-06'

const SYSTEM_PROMPT = `You are a senior B2B copywriter for Rainey Laguna, a boutique web-development studio in Lima, Peru. You write the first WhatsApp message a sales rep sends to a Peruvian small-business owner who has never heard of us.

Constraints:
- Spanish (Peruvian register, neutral). Voseo NEVER. Use tú.
- 2 short paragraphs, max 90 words total.
- One concrete observation about THEIR business (district, niche, website status, evaluation, or strategic action — whichever is most specific). NEVER invent facts not present in the brief.
- One specific, low-friction next step (e.g., "te mando un Loom de 90 segundos con dos cambios concretos").
- No emojis. No exclamation marks beyond the greeting. No "espero que te encuentres bien".
- Sign off as "— Equipo Rainey Laguna" on its own line.
- Output ONLY the message body. No preface, no headers, no quotes.`

function buildUserPrompt(lead: Record<string, unknown>): string {
  const lines: string[] = []
  const push = (label: string, val: unknown) => {
    if (val === null || val === undefined || val === '') return
    lines.push(`- ${label}: ${String(val)}`)
  }
  push('Nombre del contacto', lead.name)
  push('Distrito', lead.district)
  push('Nicho', lead.niche)
  push('Categoría', lead.category)
  push('Website', lead.website_url)
  push('Estado del website', lead.website_status)
  push('Evaluación', lead.evaluation)
  push('Acción estratégica sugerida', lead.strategic_action)
  push('Potencial', lead.potential)
  push('Instagram activo', lead.instagram_active)
  push('Notas internas', lead.notes)
  return `Datos del prospecto:\n${lines.join('\n')}\n\nEscribe el primer mensaje de WhatsApp.`
}

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
    const lead = leadRes.rows[0]

    const { text, model } = await complete({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(lead),
    })

    const insert = await pool.query(
      `INSERT INTO crm_outreach_drafts
         (lead_id, channel, body, model, prompt_version, status)
       VALUES ($1, 'WhatsApp', $2, $3, $4, 'pending')
       RETURNING *`,
      [id, text, model, PROMPT_VERSION]
    )
    return NextResponse.json(insert.rows[0], { status: 201 })
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
