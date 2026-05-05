import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

const ALLOWED = ['pipeline_stage'] as const

export async function PATCH(request: NextRequest) {
  try {
    const { ids, updates } = (await request.json()) as { ids: string[]; updates: Record<string, any> }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No ids' }, { status: 400 })
    }
    const fields: string[] = []
    const values: any[] = []
    let idx = 1
    for (const k of ALLOWED) {
      if (k in updates) {
        fields.push(`${k} = $${idx++}`)
        values.push(updates[k])
      }
    }
    if (fields.length === 0) return NextResponse.json({ error: 'No updates' }, { status: 400 })
    values.push(ids)
    const result = await pool.query(
      `UPDATE crm_leads SET ${fields.join(', ')} WHERE id = ANY($${idx}::uuid[]) RETURNING id`,
      values
    )
    return NextResponse.json({ updated: result.rowCount })
  } catch (error) {
    return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 })
  }
}
