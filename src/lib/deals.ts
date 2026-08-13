import type { PoolClient } from 'pg'
import type { BillingPeriod, DealEventType, DealStatus } from './types'

/**
 * Deal write rules.
 *
 * Pure validation and event derivation, kept out of the route so it can be
 * tested without a database. The route owns the SQL; this owns the "is this a
 * legal transition, and what event does it imply" question.
 *
 * Every state change appends to crm_deal_events. That is not bookkeeping for
 * its own sake — the retention and NRR models read the event log, not the
 * status column, because a status column cannot answer a question about the
 * past. A deal whose status is mutated without an event is invisible to every
 * time-shaped model, so the write path derives the event rather than trusting
 * the caller to remember it.
 */

export const DEAL_STATUSES: DealStatus[] = ['open', 'won', 'lost', 'churned']
export const BILLING_PERIODS: BillingPeriod[] = ['one_time', 'monthly', 'annual']

export type DealWriteInput = {
  lead_id?: string
  status?: string
  amount_cents?: number | null
  mrr_cents?: number | null
  currency?: string
  billing_period?: string
  contract_start?: string | null
  contract_end?: string | null
  closed_at?: string | null
  churned_at?: string | null
  churn_reason?: string | null
  channel?: string | null
  acquisition_cost_cents?: number | null
  notes?: string | null
}

export type ValidationError = { field: string; message: string }

const isIsoDate = (v: string): boolean => !Number.isNaN(Date.parse(v))

/**
 * Validate a create/update payload.
 *
 * Mirrors the CHECK constraints in 2026-08-12-deals-and-outcomes.sql so the
 * caller gets a field-level message instead of a Postgres constraint-violation
 * string. The database remains the real enforcement — this is for the human.
 */
export function validateDeal(
  input: DealWriteInput,
  { requireLead = false }: { requireLead?: boolean } = {},
): ValidationError[] {
  const errors: ValidationError[] = []

  if (requireLead && !input.lead_id) {
    errors.push({ field: 'lead_id', message: 'A deal must belong to a lead.' })
  }

  if (input.status !== undefined && !DEAL_STATUSES.includes(input.status as DealStatus)) {
    errors.push({
      field: 'status',
      message: `status must be one of ${DEAL_STATUSES.join(', ')}.`,
    })
  }

  if (
    input.billing_period !== undefined &&
    !BILLING_PERIODS.includes(input.billing_period as BillingPeriod)
  ) {
    errors.push({
      field: 'billing_period',
      message: `billing_period must be one of ${BILLING_PERIODS.join(', ')}.`,
    })
  }

  for (const field of ['amount_cents', 'mrr_cents', 'acquisition_cost_cents'] as const) {
    const v = input[field]
    if (v === undefined || v === null) continue
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      errors.push({ field, message: `${field} must be a whole number of cents.` })
    } else if (v < 0) {
      errors.push({ field, message: `${field} cannot be negative.` })
    }
  }

  if (input.currency !== undefined && !/^[A-Z]{3}$/.test(input.currency)) {
    errors.push({ field: 'currency', message: 'currency must be a 3-letter ISO code.' })
  }

  for (const field of ['contract_start', 'contract_end', 'closed_at', 'churned_at'] as const) {
    const v = input[field]
    if (v && !isIsoDate(v)) {
      errors.push({ field, message: `${field} must be a valid date.` })
    }
  }

  if (
    input.contract_start &&
    input.contract_end &&
    isIsoDate(input.contract_start) &&
    isIsoDate(input.contract_end) &&
    Date.parse(input.contract_end) < Date.parse(input.contract_start)
  ) {
    errors.push({
      field: 'contract_end',
      message: 'contract_end cannot be before contract_start.',
    })
  }

  // The two rules that make a deal legible to the models. A won deal with no
  // close date cannot be placed in time, and a churn with no date is invisible
  // to every retention curve.
  if ((input.status === 'won' || input.status === 'lost') && !input.closed_at) {
    errors.push({
      field: 'closed_at',
      message: 'A won or lost deal needs a close date — without it, win rate over time and sales-cycle length cannot be computed.',
    })
  }
  if (input.status === 'churned' && !input.churned_at) {
    errors.push({
      field: 'churned_at',
      message: 'A churned deal needs a churn date — the date IS the measurement for retention.',
    })
  }

  return errors
}

/**
 * The lifecycle event a status change implies.
 *
 * Returns null when the status did not change, so an edit that only corrects
 * an amount does not manufacture a spurious lifecycle event and distort MRR
 * movement.
 */
export function eventForTransition(
  from: DealStatus | null,
  to: DealStatus,
): DealEventType | null {
  if (from === to) return null
  switch (to) {
    case 'open':
      // Coming back to open from a closed state is a reactivation; arriving
      // at open for the first time is simply the deal being created.
      return from === null ? 'opened' : 'reactivated'
    case 'won':
      return from === 'churned' ? 'reactivated' : 'won'
    case 'lost':
      return 'lost'
    case 'churned':
      return 'churned'
  }
}

/**
 * Signed MRR movement for an event, in cents.
 *
 * Summing this column in occurred_at order reconstructs MRR at any past date,
 * so it has to be right at write time — there is no way to recover it later.
 */
export function mrrDeltaFor(
  event: DealEventType,
  previousMrr: number | null,
  nextMrr: number | null,
): number | null {
  const prev = previousMrr ?? 0
  const next = nextMrr ?? 0
  switch (event) {
    case 'won':
    case 'reactivated':
      return next
    case 'churned':
      // The whole recurring value leaves.
      return prev === 0 ? null : -prev
    case 'lost':
    case 'opened':
    case 'renewed':
      // No recurring revenue moves. Explicitly null rather than 0 so these
      // never contribute a phantom zero to a movement chart.
      return null
    case 'expanded':
    case 'contracted':
      return next - prev
  }
}

/**
 * Append a lifecycle event. Callers pass their transaction client so the event
 * and the deal row commit together — a deal that moved without its event would
 * be silently wrong in every retention figure.
 */
export async function appendDealEvent(
  client: PoolClient,
  params: {
    dealId: string
    eventType: DealEventType
    occurredAt: string
    mrrDeltaCents: number | null
    amountCents: number | null
    note?: string | null
  },
): Promise<void> {
  await client.query(
    `INSERT INTO crm_deal_events
       (deal_id, event_type, occurred_at, mrr_delta_cents, amount_cents, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.dealId,
      params.eventType,
      params.occurredAt,
      params.mrrDeltaCents,
      params.amountCents,
      params.note ?? null,
    ],
  )
}
