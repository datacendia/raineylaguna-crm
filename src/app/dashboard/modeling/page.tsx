'use client'

import { useEffect, useState } from 'react'
import type { Insufficiency, ModelResult } from '@/lib/modeling/result'

/**
 * The modelling dashboard.
 *
 * Its central design constraint: most panels cannot answer yet, and that has
 * to read as a fact about the data rather than as a broken page. So the
 * coverage ratio is the headline, every refusal states what is missing and how
 * far off it is, and nothing renders a zero or a dash where a number would go.
 *
 * A dash is the failure mode this whole feature exists to avoid — it looks
 * like a measurement of nothing, when the truth is the absence of measurement.
 */

type Coverage = {
  answerable: number
  total: number
  blocked: Array<{ model: string; reason: string; message: string }>
}

type Payload = {
  schemaReady: boolean
  coverage: Coverage
  inputs: { deals: number; dealEvents: number; leads: number }
  models: Record<string, ModelResult<unknown>>
}

const LABELS: Record<string, string> = {
  revenue: 'Recurring revenue (MRR / ARR / ARPA)',
  mrrMovement: 'MRR movement by month',
  averageContractValue: 'Average contract value',
  churn: 'Churn (logo & revenue)',
  lifetime: 'Customer lifetime',
  cohorts: 'Cohort retention',
  ltv: 'Lifetime value',
  cac: 'Customer acquisition cost',
  unitEconomics: 'Unit economics (LTV:CAC, payback)',
  funnel: 'Pipeline funnel',
  winRate: 'Win rate',
  salesCycle: 'Sales cycle length',
  leadToCustomer: 'Lead → customer conversion',
}

const REASON_LABELS: Record<string, string> = {
  no_data: 'Nothing recorded yet',
  below_minimum: 'Too few to be meaningful',
  insufficient_history: 'Not enough time elapsed',
  missing_input: 'A required input is unset',
  not_aggregatable: 'Data cannot be combined',
}

function Refusal({ insufficient }: { insufficient: Insufficiency }) {
  const { reason, message, needed, have, require } = insufficient
  const pct = have !== undefined && require ? Math.min(100, (have / require) * 100) : null

  return (
    <div className="text-sm">
      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
        {REASON_LABELS[reason] ?? reason}
      </span>
      <p className="text-gray-600 mt-2">{message}</p>

      {/* Progress toward the threshold, so "not yet" is a distance rather
          than a wall. */}
      {pct !== null && (
        <div className="mt-2">
          <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
            <div className="h-full bg-gray-400" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {have} of {require}
          </p>
        </div>
      )}

      {needed.length > 0 && (
        <>
          <p className="text-xs font-medium text-gray-500 mt-3">Needs:</p>
          <ul className="text-xs text-gray-600 list-disc pl-4 mt-1 space-y-0.5">
            {needed.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/**
 * Results are rendered generically rather than with a bespoke component per
 * model. Thirteen hand-built panels would be thirteen places for a formatting
 * bug, and every model already returns plain, labelled scalars.
 */
function Result({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null

  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-gray-500">No rows.</p>
    const cols = Object.keys(value[0] as Record<string, unknown>)
    return (
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className="text-left text-gray-500">
              {cols.map((c) => (
                <th key={c} className="pr-3 pb-1 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.slice(0, 12).map((row, i) => (
              <tr key={i} className="border-t">
                {cols.map((c) => (
                  <td key={c} className="pr-3 py-1">
                    {formatScalar((row as Record<string, unknown>)[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (typeof value === 'object') {
    return (
      <dl className="text-sm space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-gray-500">{k}</dt>
            <dd className="font-medium text-right">{formatScalar(v)}</dd>
          </div>
        ))}
      </dl>
    )
  }

  return <p className="text-2xl font-semibold">{formatScalar(value)}</p>
}

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function ModelingPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/modeling')
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('Could not load models.'))
  }, [])

  if (error) return <div className="p-8 text-red-700">{error}</div>
  if (!data) return <div className="p-8 text-gray-500">Loading…</div>

  const { coverage, inputs, models, schemaReady } = data

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <h1 className="text-3xl sm:text-4xl font-bold mb-1">Modelling</h1>
      <p className="text-sm text-gray-500 mb-6">
        Commercial models. Each one either answers or says exactly what it is
        missing — nothing here is estimated or assumed.
      </p>

      {!schemaReady && (
        <div className="mb-6 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded p-3">
          The deals tables do not exist yet. Run <code>npm run migrate</code> to
          apply them; until then every value model reports no data.
        </div>
      )}

      {/* Coverage as the headline. "3 of 13" is the honest state of this
          system, and it should improve visibly as outcomes get recorded. */}
      <div className="mb-6 border rounded-lg p-4 bg-white">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold">
            {coverage.answerable}/{coverage.total}
          </span>
          <span className="text-sm text-gray-500">models can currently answer</span>
        </div>
        <div className="h-2 bg-gray-100 rounded mt-3 overflow-hidden">
          <div
            className="h-full bg-black"
            style={{ width: `${(coverage.answerable / coverage.total) * 100}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {inputs.deals.toLocaleString()} deals · {inputs.dealEvents.toLocaleString()}{' '}
          lifecycle events · {inputs.leads.toLocaleString()} leads
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(models).map(([key, result]) => (
          <section
            key={key}
            className={`border rounded-lg p-4 bg-white ${result.ok ? '' : 'opacity-90'}`}
          >
            <h2 className="font-semibold text-sm mb-3">{LABELS[key] ?? key}</h2>
            {result.ok ? (
              <Result value={result.value} />
            ) : (
              <Refusal insufficient={result.insufficient} />
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
