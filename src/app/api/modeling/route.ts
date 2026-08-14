import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { runModelSuite, suiteCoverage, type StageCounts } from '@/lib/modeling'
import type { Deal, DealEvent, PipelineStage } from '@/lib/types'

/**
 * GET /api/modeling — every commercial model, with its refusals.
 *
 * Returns each model as either a result or an explicit insufficient-data
 * object naming what is missing. Today most will refuse: there are no deals.
 * That is the correct output, not an error, so the route returns 200 with the
 * refusals in the body rather than a 4xx.
 *
 * REGISTERED IN src/proxy.ts. An /api route that reads commercial data and is
 * not in the proxy matcher is silently public — that is exactly how
 * /api/analytics served named leads, districts, health scores and pitch copy
 * to anyone who asked, and this route would leak revenue figures the same way.
 *
 * Query params:
 *   basis=revenue|contribution   LTV basis (default revenue)
 *   grossMargin=0.65             required for the contribution basis
 *   asOf=YYYY-MM-DD              evaluate as at a past date
 */
export async function GET(request: Request) {
  const url = new URL(request.url)

  const basisParam = url.searchParams.get('basis')
  if (basisParam && basisParam !== 'revenue' && basisParam !== 'contribution') {
    return NextResponse.json(
      { error: "basis must be 'revenue' or 'contribution'" },
      { status: 400 },
    )
  }

  const marginParam = url.searchParams.get('grossMargin')
  let grossMargin: number | undefined
  if (marginParam !== null) {
    grossMargin = Number(marginParam)
    if (!Number.isFinite(grossMargin)) {
      return NextResponse.json(
        { error: 'grossMargin must be a number between 0 and 1' },
        { status: 400 },
      )
    }
  }

  const asOfParam = url.searchParams.get('asOf')
  let asOf: Date | undefined
  if (asOfParam) {
    asOf = new Date(asOfParam)
    if (Number.isNaN(asOf.getTime())) {
      return NextResponse.json({ error: 'asOf must be a valid date' }, { status: 400 })
    }
  }

  try {
    // crm_deals / crm_deal_events may not exist yet if the migration has not
    // run. Guarded rather than 500ing, matching how /api/stats handles the
    // franchise-flag column — a fresh database should still answer.
    let deals: Deal[] = []
    let events: DealEvent[] = []
    let schemaReady = true
    try {
      const [d, e] = await Promise.all([
        pool.query<Deal>(`SELECT * FROM crm_deals`),
        pool.query<DealEvent>(`SELECT * FROM crm_deal_events ORDER BY occurred_at`),
      ])
      deals = d.rows
      events = e.rows
    } catch {
      schemaReady = false
    }

    // Counts, not rows. /api/leads ignores its limit param and ships all
    // 36,809 records as ~38MB of JSON; the funnel model needs five integers,
    // so this aggregates in Postgres rather than pulling the base into Node.
    const stageRows = await pool.query<{ pipeline_stage: string; count: number }>(
      `SELECT pipeline_stage, COUNT(*)::int AS count
         FROM crm_leads
        WHERE deleted_at IS NULL
        GROUP BY pipeline_stage`,
    )
    const stageCounts: StageCounts = {}
    for (const r of stageRows.rows) {
      stageCounts[r.pipeline_stage as PipelineStage] = r.count
    }
    const totalLeads = stageRows.rows.reduce((a, r) => a + r.count, 0)

    const suite = runModelSuite({
      deals,
      events,
      stageCounts,
      asOf,
      ltv: {
        basis: (basisParam as 'revenue' | 'contribution' | null) ?? undefined,
        grossMargin,
      },
    })

    return NextResponse.json({
      schemaReady,
      coverage: suiteCoverage(suite),
      inputs: {
        deals: deals.length,
        dealEvents: events.length,
        leads: totalLeads,
      },
      models: suite,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to run models' }, { status: 500 })
  }
}
