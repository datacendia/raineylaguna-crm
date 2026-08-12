/**
 * The contract every model in this directory returns.
 *
 * The CRM has 36,809 leads, zero recorded conversions, zero logged outreach
 * events and no money anywhere in the schema. Every model here is therefore
 * being asked a question the data cannot currently answer, and the entire
 * design problem is what to do about that.
 *
 * The answer is: refuse, in a way the caller cannot accidentally ignore.
 *
 * A model returns either a real result or an explicit refusal naming what is
 * missing and how much of it is needed. It never returns 0, never returns
 * null-that-renders-as-a-dash, and never substitutes an assumed figure. Those
 * three habits are how a dashboard ends up presenting a fabricated LTV with
 * the same visual confidence as a measured one, and a number nobody can trace
 * is worse than an empty panel — it gets quoted in a board deck.
 *
 * The discriminated union forces the caller to handle both branches: there is
 * no `.value` to read without first narrowing on `ok`.
 */

/** Why a model could not produce a figure. */
export type InsufficiencyReason =
  /** The inputs are simply absent — no deals, no events, no closed outcomes. */
  | 'no_data'
  /** Some data exists but not enough for the result to mean anything. */
  | 'below_minimum'
  /** Enough rows, but not spanning enough time for a rate or curve. */
  | 'insufficient_history'
  /** A required business input (e.g. gross margin, acquisition cost) is unset. */
  | 'missing_input'
  /** Data exists but is internally inconsistent — mixed currencies, say. */
  | 'not_aggregatable'

export type Insufficiency = {
  reason: InsufficiencyReason
  /** One line, written for the operator, not the developer. */
  message: string
  /** What specifically has to exist before this model can answer. */
  needed: string[]
  /**
   * Observed vs required counts, where the model has a threshold. Lets a UI
   * render honest progress ("4 of 30 closed deals") instead of a blank.
   */
  have?: number
  require?: number
}

export type ModelResult<T> =
  | { ok: true; value: T }
  | { ok: false; insufficient: Insufficiency }

export const ok = <T>(value: T): ModelResult<T> => ({ ok: true, value })

export const insufficient = <T>(i: Insufficiency): ModelResult<T> => ({
  ok: false,
  insufficient: i,
})

/**
 * Minimum sample sizes.
 *
 * These are judgement, not arithmetic, and they are conservative on purpose:
 * the failure this whole module guards against is a confident number derived
 * from three data points. They are exported so the thresholds are visible and
 * arguable rather than buried in each model, and so a UI can show progress
 * toward them.
 *
 * A churn rate from 5 customers moves 20 points when one leaves; a cohort
 * curve needs enough months that the curve has a shape at all. Raising these
 * is safe. Lowering them means publishing noise.
 */
export const MINIMUMS = {
  /** Closed (won or lost) deals before a win rate is meaningful. */
  winRate: 20,
  /** Won deals before ARPA / average contract value is meaningful. */
  arpa: 10,
  /** Customers observed before a churn rate is meaningful. */
  churn: 20,
  /** Distinct monthly cohorts before a retention curve has a shape. */
  cohortMonths: 3,
  /** Customers in a single cohort before that cohort's row is shown. */
  cohortSize: 5,
  /** Won deals before an LTV figure is worth stating. */
  ltv: 20,
  /** Deals carrying an acquisition cost before CAC is meaningful. */
  cac: 10,
} as const

/**
 * Shorthand for "there is nothing at all yet", which is the state every model
 * in this repo is in today.
 */
export function noData<T>(what: string, needed: string[]): ModelResult<T> {
  return insufficient<T>({
    reason: 'no_data',
    message: `No ${what} has ever been recorded, so this cannot be computed.`,
    needed,
  })
}

/** Shorthand for "some data, but not enough to mean anything". */
export function belowMinimum<T>(
  what: string,
  have: number,
  require: number,
  needed: string[],
): ModelResult<T> {
  return insufficient<T>({
    reason: 'below_minimum',
    message: `Only ${have} ${what} recorded; ${require} needed before this figure is meaningful.`,
    needed,
    have,
    require,
  })
}
