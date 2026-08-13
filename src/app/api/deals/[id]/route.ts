import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { appendDealEvent, eventForTransition, mrrDeltaFor, validateDeal } from '@/lib/deals'
import type { Deal } from '@/lib/types'

/**
 * PATCH /api/deals/[id] — update a deal and record what actually happened.
 *
 * The lifecycle event is DERIVED from the transition rather than supplied by
 * the caller. Trusting the caller to remember it would mean a deal that
 * quietly changed status without an event, and since the retention and NRR
 * models read the event log rather than the status column, such a deal is
 * invisible to every one of them. Deriving it makes forgetting impossible.
 *
 * An edit that changes no status and no recurring amount appends nothing, so
 * correcting a typo does not manufacture a movement.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Locked so a concurrent PATCH cannot interleave and derive its event from
    // a status this one has already moved past.
    const before = await client.query<Deal>(
      `SELECT * FROM crm_deals WHERE id = $1 FOR UPDATE`,
      [id],
    )
    if (before.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }
    const prev = before.rows[0]

    // Validate the MERGED state, not the patch alone: sending only
    // status:'won' must still be caught for having no closed_at, and sending
    // only closed_at must be checked against the status already stored.
    const merged = { ...prev, ...body }
    const errors = validateDeal(merged as Record<string, unknown>)
    if (errors.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 })
    }

    const FIELDS = [
      'status', 'amount_cents', 'mrr_cents', 'currency', 'billing_period',
      'contract_start', 'contract_end', 'closed_at', 'churned_at',
      'churn_reason', 'channel', 'acquisition_cost_cents', 'notes',
    ] as const

    const sets: string[] = []
    const values: unknown[] = []
    for (const field of FIELDS) {
      if (field in body) {
        sets.push(`${field} = $${values.length + 1}`)
        values.push(body[field])
      }
    }
    if (sets.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 })
    }
    values.push(id)

    const after = await client.query<Deal>(
      `UPDATE crm_deals SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    )
    const deal = after.rows[0]

    const transition = eventForTransition(prev.status, deal.status)
    if (transition) {
      await appendDealEvent(client, {
        dealId: deal.id,
        eventType: transition,
        occurredAt:
          transition === 'churned'
            ? (deal.churned_at ?? new Date().toISOString())
            : (deal.closed_at ?? new Date().toISOString()),
        mrrDeltaCents: mrrDeltaFor(transition, prev.mrr_cents, deal.mrr_cents),
        amountCents: deal.amount_cents,
      })
    } else if (
      deal.status === 'won' &&
      (deal.mrr_cents ?? 0) !== (prev.mrr_cents ?? 0)
    ) {
      // Same status, different recurring value: an expansion or contraction.
      // This is where net revenue retention above 100% comes from, and it is
      // invisible unless recorded at the moment it happens.
      const grew = (deal.mrr_cents ?? 0) > (prev.mrr_cents ?? 0)
      const kind = grew ? 'expanded' : 'contracted'
      await appendDealEvent(client, {
        dealId: deal.id,
        eventType: kind,
        occurredAt: new Date().toISOString(),
        mrrDeltaCents: mrrDeltaFor(kind, prev.mrr_cents, deal.mrr_cents),
        amountCents: null,
      })
    }

    await client.query('COMMIT')
    return NextResponse.json(deal)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    const message = err instanceof Error ? err.message : 'unknown'
    const isConstraint = /violates check constraint|foreign key/i.test(message)
    return NextResponse.json(
      { error: isConstraint ? message : 'Failed to update deal' },
      { status: isConstraint ? 400 : 500 },
    )
  } finally {
    client.release()
  }
}
