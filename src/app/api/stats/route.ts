import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT pipeline_stage, COUNT(*)::int AS count
      FROM crm_leads
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
    return NextResponse.json({ total, ...counts })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
