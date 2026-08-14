import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { appendDealEvent, eventForTransition, mrrDeltaFor, validateDeal } from '@/lib/deals'
import type { Deal } from '@/lib/types'

/**
 * Deals — the write path that makes the value models answerable.
 *
 * GET  /api/deals            list deals (optionally ?lead_id=)
 * POST /api/deals            create one, appending its opening lifecycle event
 *
 * REGISTERED IN src/proxy.ts. This returns contract values and churn reasons;
 * an /api route holding commercial data and missing from that matcher is
 * silently public, which is how /api/analytics leaked named leads.
 */
export async function GET(request: NextRequest) {
  try {
    const leadId = new URL(request.url).searchParams.get('lead_id')
    const { rows } = leadId
      ? await pool.query<Deal>(
          `SELECT * FROM crm_deals WHERE lead_id = $1 ORDER BY opened_at DESC`,
          [leadId],
        )
      : await pool.query<Deal>(`SELECT * FROM crm_deals ORDER BY opened_at DESC LIMIT 1000`)
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const errors = validateDeal(body, { requireLead: true })
  if (errors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const status = (body.status as string) ?? 'open'
    const { rows } = await client.query<Deal>(
      `INSERT INTO crm_deals
         (lead_id, status, amount_cents, mrr_cents, currency, billing_period,
          contract_start, contract_end, closed_at, churned_at, churn_reason,
          channel, acquisition_cost_cents, notes)
       VALUES ($1,$2,$3,$4,COALESCE($5,'PEN'),COALESCE($6,'one_time'),
               $7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        body.lead_id,
        status,
        body.amount_cents ?? null,
        body.mrr_cents ?? null,
        body.currency ?? null,
        body.billing_period ?? null,
        body.contract_start ?? null,
        body.contract_end ?? null,
        body.closed_at ?? null,
        body.churned_at ?? null,
        body.churn_reason ?? null,
        body.channel ?? null,
        body.acquisition_cost_cents ?? null,
        body.notes ?? null,
      ],
    )
    const deal = rows[0]

    // A deal created directly as 'won' gets its won event, not an 'opened'
    // one — otherwise the month it was actually won is lost, and backfilling
    // history (which is how this table will first be populated) would produce
    // an MRR movement chart with no new business in it at all.
    const event = eventForTransition(null, deal.status)
    if (event) {
      await appendDealEvent(client, {
        dealId: deal.id,
        eventType: deal.status === 'open' ? 'opened' : event,
        occurredAt: deal.closed_at ?? deal.contract_start ?? deal.opened_at,
        mrrDeltaCents: mrrDeltaFor(
          deal.status === 'open' ? 'opened' : event,
          null,
          deal.mrr_cents,
        ),
        amountCents: deal.amount_cents,
      })
    }

    await client.query('COMMIT')
    return NextResponse.json(deal, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    const message = err instanceof Error ? err.message : 'unknown'
    // Surface constraint violations as 400 — they are the caller's bad input,
    // not a server fault, and the constraint text names the rule broken.
    const isConstraint = /violates check constraint|foreign key/i.test(message)
    return NextResponse.json(
      { error: isConstraint ? message : 'Failed to create deal' },
      { status: isConstraint ? 400 : 500 },
    )
  } finally {
    client.release()
  }
}
