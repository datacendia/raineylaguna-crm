import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT pipeline_stage, COUNT(*)::int AS count
      FROM crm_leads
      WHERE deleted_at IS NULL
      GROUP BY pipeline_stage
    `)
    const counts: Record<string, number> = {
      Lead: 0,
      Contacted: 0,
      Audited: 0,
      Proposal: 0,
      Closed: 0,
    }
    for (const row of result.rows) counts[row.pipeline_stage] = row.count
    const total = Object.values(counts).reduce((a, b) => a + b, 0)

    // "Real addressable" = the universe a one-person boutique can actually sell
    // to: independents only, with chains/franchises/placeholders excluded. This
    // is the honest counterweight to the headline `total`. Guarded so the
    // endpoint keeps working before the franchise-flag migration has run.
    let addressable: number | null = null
    try {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS c FROM crm_leads
          WHERE deleted_at IS NULL AND COALESCE(is_chain, false) = false`,
      )
      addressable = r.rows[0]?.c ?? null
    } catch {
      addressable = null
    }

    return NextResponse.json({ total, addressable, ...counts })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
