import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// Server-side whitelist of columns that bulk PATCH is allowed to modify.
// Any other key in `updates` is silently dropped so a buggy client can never
// clobber fields like `email` or `created_at` across many rows at once.
const ALLOWED = ['pipeline_stage', 'snoozed_until'] as const

export async function PATCH(request: NextRequest) {
  try {
    const { ids, updates } = (await request.json()) as { ids: string[]; updates: Record<string, unknown> }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No ids' }, { status: 400 })
    }
    const fields: string[] = []
    const values: unknown[] = []
    let idx = 1
    for (const k of ALLOWED) {
      if (k in updates) {
        const v = updates[k]
        // snoozed_until accepts ISO strings and explicit null (= un-snooze).
        // Empty string from a cleared <input type="date"> also means null.
        if (k === 'snoozed_until' && (v === '' || v === undefined)) {
          fields.push(`${k} = NULL`)
          continue
        }
        fields.push(`${k} = $${idx++}`)
        values.push(v)
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
