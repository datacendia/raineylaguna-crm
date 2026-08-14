import type { Deal } from '../types'
import { insufficient, type ModelResult, ok } from './result'

/**
 * Currency handling for the models.
 *
 * The lead base spans Lima, Boston, Glasgow, Los Angeles, Bogotá and Buenos
 * Aires — PEN, USD, GBP, COP and ARS. Summing those into one "revenue" figure
 * requires FX rates the system does not have and, for ARS in particular, rates
 * that would have to be dated per transaction to mean anything.
 *
 * Rather than pick a rate and bury it, every aggregate refuses to mix. The
 * caller either scopes to one currency or gets an explicit refusal. This is
 * the `not_aggregatable` case, and it is a real one the moment the second
 * market closes a deal — not a hypothetical.
 */

/** All money is minor units (cents). Never float. */
export type Cents = number

export type CurrencyScoped<T> = T & { currency: string }

/**
 * Assert that a set of deals shares one currency, returning it.
 *
 * An empty set is not an error here — the caller's own minimum-sample check
 * owns that case and produces a better message than "no currency".
 */
export function singleCurrency(deals: Deal[]): ModelResult<string> {
  const seen = new Set(deals.map((d) => d.currency))
  if (seen.size === 0) return ok('')
  if (seen.size === 1) return ok([...seen][0])
  const list = [...seen].sort().join(', ')
  return insufficient<string>({
    reason: 'not_aggregatable',
    message: `Deals span ${seen.size} currencies (${list}); totals across them would require FX rates this system does not hold.`,
    needed: [
      'Scope the query to a single currency',
      'Or record dated FX rates so cross-currency totals can be derived rather than assumed',
    ],
  })
}

/** Sum, treating null as absent rather than as zero. */
export function sumDefined(values: Array<number | null | undefined>): Cents {
  let total = 0
  for (const v of values) if (typeof v === 'number') total += v
  return total
}

/** Count of entries that actually carry a number. */
export function countDefined(values: Array<number | null | undefined>): number {
  let n = 0
  for (const v of values) if (typeof v === 'number') n++
  return n
}

/**
 * Mean over defined values only, in cents, rounded to a whole cent.
 * Returns null when nothing is defined — the caller decides whether that is a
 * refusal or simply an empty slice.
 */
export function meanCents(values: Array<number | null | undefined>): Cents | null {
  const n = countDefined(values)
  if (n === 0) return null
  return Math.round(sumDefined(values) / n)
}

/** UTC year-month key, `YYYY-MM`. The cohort bucket for every time model. */
export function monthKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Whole months between two dates, floored. Used for cohort period offsets. */
export function monthsBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === 'string' ? new Date(from) : from
  const b = typeof to === 'string' ? new Date(to) : to
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  )
}
