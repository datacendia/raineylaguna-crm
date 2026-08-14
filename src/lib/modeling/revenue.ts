import type { Deal, DealEvent } from '../types'
import { monthKey, singleCurrency, sumDefined, type Cents } from './money'
import {
  belowMinimum,
  insufficient,
  MINIMUMS,
  noData,
  ok,
  type ModelResult,
} from './result'

/**
 * Recurring-revenue model: MRR, ARR, ARPA and average contract value.
 *
 * All of it derives from won deals. Nothing here estimates: if no deal has
 * ever been won, every figure below refuses rather than reporting zero.
 * "Zero MRR" and "we have never recorded a sale" look identical on a chart and
 * mean completely different things.
 */

export type RevenueSnapshot = {
  currency: string
  /** Sum of mrr_cents across deals live on the as-of date. */
  mrrCents: Cents
  /** MRR × 12. Not a forecast — a restatement, and labelled as one in the UI. */
  arrCents: Cents
  /** Count of deals contributing to MRR. */
  activeCustomers: number
  /** Mean recurring revenue per active account. */
  arpaCents: Cents
  /** Mean one-off contract value across won deals (the build fee). */
  averageContractValueCents: Cents | null
  asOf: string
}

/** A deal is live on `asOf` if it was won by then and had not churned by then. */
export function isActiveAt(deal: Deal, asOf: Date): boolean {
  if (deal.status === 'lost' || deal.status === 'open') return false
  if (!deal.closed_at) return false
  if (new Date(deal.closed_at) > asOf) return false
  if (deal.churned_at && new Date(deal.churned_at) <= asOf) return false
  return true
}

export function revenueSnapshot(
  deals: Deal[],
  asOf: Date = new Date(),
): ModelResult<RevenueSnapshot> {
  const won = deals.filter((d) => d.status === 'won' || d.status === 'churned')
  if (won.length === 0) {
    return noData<RevenueSnapshot>('closed-won deal', [
      'At least one deal marked won, with closed_at set',
      'mrr_cents on any deal that recurs',
    ])
  }

  const cur = singleCurrency(won)
  if (!cur.ok) return { ok: false, insufficient: cur.insufficient }

  const active = won.filter((d) => isActiveAt(d, asOf))

  // No customer live on this date is NOT "MRR of zero". Asked about a date
  // before the first sale, or after every customer has churned, a zero would
  // plot as a genuine trough on a revenue chart and read as collapse. The two
  // situations need different words, so this refuses instead.
  if (active.length === 0) {
    return insufficient<RevenueSnapshot>({
      reason: 'insufficient_history',
      message: `No customer was live as at ${asOf.toISOString().slice(0, 10)}, so there is no recurring revenue to report for that date — which is not the same as revenue of zero.`,
      needed: [
        'A date on or after the first deal was won',
        'Or deals that were still active on the date requested',
      ],
    })
  }

  const mrrCents = sumDefined(active.map((d) => d.mrr_cents))

  // Recurring revenue is optional in this business — a one-off build with no
  // retainer is a legitimate deal. But if NOTHING recurs, MRR/ARR/ARPA are
  // not "zero", they are inapplicable, and saying zero would read as decline.
  const anyRecurring = won.some((d) => typeof d.mrr_cents === 'number' && d.mrr_cents > 0)
  if (!anyRecurring) {
    return insufficient<RevenueSnapshot>({
      reason: 'missing_input',
      message:
        'No deal carries a recurring amount, so MRR, ARR and ARPA do not apply. Only one-off contract value can be reported.',
      needed: ['mrr_cents set on deals that bill monthly or annually'],
    })
  }

  const acv = won.filter((d) => typeof d.amount_cents === 'number')

  return ok({
    currency: cur.value,
    mrrCents,
    arrCents: mrrCents * 12,
    activeCustomers: active.length,
    // Safe: the empty case refused above.
    arpaCents: Math.round(mrrCents / active.length),
    averageContractValueCents: acv.length
      ? Math.round(sumDefined(acv.map((d) => d.amount_cents)) / acv.length)
      : null,
    asOf: asOf.toISOString(),
  })
}

export type MrrMovement = {
  month: string
  newCents: Cents
  expansionCents: Cents
  contractionCents: Cents
  churnedCents: Cents
  reactivationCents: Cents
  netCents: Cents
}

/**
 * Month-by-month MRR movement, reconstructed from the event log.
 *
 * This is why crm_deal_events is append-only. Current-state rows can say what
 * MRR is now; only the ordered events can say how it got there, and the
 * new/expansion/contraction/churn split is the whole diagnostic value.
 */
export function mrrMovement(events: DealEvent[]): ModelResult<MrrMovement[]> {
  const withDelta = events.filter((e) => typeof e.mrr_delta_cents === 'number')
  if (withDelta.length === 0) {
    return noData<MrrMovement[]>('MRR movement event', [
      'Deal events carrying mrr_delta_cents (won, expanded, contracted, churned)',
    ])
  }

  const byMonth = new Map<string, MrrMovement>()
  const row = (month: string): MrrMovement => {
    let r = byMonth.get(month)
    if (!r) {
      r = {
        month,
        newCents: 0,
        expansionCents: 0,
        contractionCents: 0,
        churnedCents: 0,
        reactivationCents: 0,
        netCents: 0,
      }
      byMonth.set(month, r)
    }
    return r
  }

  for (const e of withDelta) {
    const delta = e.mrr_delta_cents as number
    const r = row(monthKey(e.occurred_at))
    switch (e.event_type) {
      case 'won':
        r.newCents += delta
        break
      case 'expanded':
        r.expansionCents += delta
        break
      case 'contracted':
        r.contractionCents += delta
        break
      case 'churned':
        r.churnedCents += delta
        break
      case 'reactivated':
        r.reactivationCents += delta
        break
      default:
        // 'opened', 'lost' and 'renewed' move no recurring revenue by
        // definition. A delta on one of those is a data error, not a movement
        // to silently fold into net.
        break
    }
    if (
      e.event_type === 'won' ||
      e.event_type === 'expanded' ||
      e.event_type === 'contracted' ||
      e.event_type === 'churned' ||
      e.event_type === 'reactivated'
    ) {
      r.netCents += delta
    }
  }

  return ok([...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)))
}

/**
 * Mean contract value across won deals, separate from the snapshot so it can
 * be reported when nothing recurs.
 */
export function averageContractValue(deals: Deal[]): ModelResult<{
  currency: string
  valueCents: Cents
  sampleSize: number
}> {
  const won = deals.filter(
    (d) =>
      (d.status === 'won' || d.status === 'churned') &&
      typeof d.amount_cents === 'number',
  )
  if (won.length === 0) {
    return noData('won deal with a contract value', [
      'amount_cents set on won deals',
    ])
  }
  if (won.length < MINIMUMS.arpa) {
    return belowMinimum('won deals with a value', won.length, MINIMUMS.arpa, [
      `${MINIMUMS.arpa - won.length} more won deals with amount_cents recorded`,
    ])
  }

  const cur = singleCurrency(won)
  if (!cur.ok) return { ok: false, insufficient: cur.insufficient }

  return ok({
    currency: cur.value,
    valueCents: Math.round(sumDefined(won.map((d) => d.amount_cents)) / won.length),
    sampleSize: won.length,
  })
}
