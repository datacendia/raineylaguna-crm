'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Deal } from '@/lib/types'

/**
 * Record the commercial outcome of a lead.
 *
 * This is the only place a deal can be created, and without it every value
 * model — LTV, churn, retention, cohorts, unit economics — stays permanently
 * refused for want of data. Nothing else in the CRM writes money.
 *
 * The form asks for the fields the models actually need and says why, because
 * the difference between a deal with a contract_start and one without is the
 * difference between a cohort curve existing and not existing. A "record the
 * win" form that quietly accepts a blank date would recreate exactly the gap
 * this schema was added to close.
 */

const money = (cents: number | null, currency: string) =>
  cents === null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)

type FormState = {
  status: string
  amount: string
  mrr: string
  currency: string
  billing_period: string
  contract_start: string
  closed_at: string
  churned_at: string
  churn_reason: string
  acquisition_cost: string
  channel: string
}

const EMPTY: FormState = {
  status: 'won',
  amount: '',
  mrr: '',
  currency: 'PEN',
  billing_period: 'one_time',
  contract_start: '',
  closed_at: new Date().toISOString().slice(0, 10),
  churned_at: '',
  churn_reason: '',
  acquisition_cost: '',
  channel: '',
}

/** Cents from a decimal string. Empty stays null — absent, not zero. */
function toCents(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function DealPanel({ leadId }: { leadId: string }) {
  const [deals, setDeals] = useState<Deal[]>([])
  const [form, setForm] = useState<FormState>(EMPTY)
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/deals?lead_id=${leadId}`)
    const data = await res.json()
    setDeals(Array.isArray(data) ? data : [])
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])
    setSaving(true)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          status: form.status,
          amount_cents: toCents(form.amount),
          mrr_cents: toCents(form.mrr),
          currency: form.currency,
          billing_period: form.billing_period,
          contract_start: form.contract_start || null,
          closed_at: form.closed_at ? `${form.closed_at}T00:00:00Z` : null,
          churned_at: form.churned_at ? `${form.churned_at}T00:00:00Z` : null,
          churn_reason: form.churn_reason || null,
          acquisition_cost_cents: toCents(form.acquisition_cost),
          channel: form.channel || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // Field-level messages from validateDeal, so the operator is told
        // which rule was broken rather than "failed".
        setErrors(
          Array.isArray(body.errors)
            ? body.errors.map((x: { field: string; message: string }) => `${x.field}: ${x.message}`)
            : [body.error ?? 'Failed to save deal'],
        )
        return
      }
      setForm(EMPTY)
      setOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const markChurned = async (deal: Deal) => {
    const when = window.prompt('Churn date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10))
    if (!when) return
    const reason = window.prompt('Reason (optional)') ?? null
    await fetch(`/api/deals/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'churned',
        churned_at: `${when}T00:00:00Z`,
        churn_reason: reason,
      }),
    })
    await load()
  }

  const field = (k: keyof FormState) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value }),
    className: 'w-full border p-2 rounded text-sm',
  })

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Deals</h3>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
        >
          {open ? 'Cancel' : '+ Record a deal'}
        </button>
      </div>

      {deals.length === 0 && !open && (
        <p className="text-xs text-gray-500 mt-2">
          No deal recorded. Until at least one exists, LTV, churn and retention
          have nothing to compute from.
        </p>
      )}

      {deals.length > 0 && (
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className="text-left text-gray-500 text-xs">
              <th className="py-1">Status</th>
              <th>Value</th>
              <th>MRR</th>
              <th>Started</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="py-1.5 capitalize">{d.status}</td>
                <td>{money(d.amount_cents, d.currency)}</td>
                <td>{money(d.mrr_cents, d.currency)}</td>
                <td>{d.contract_start ?? '—'}</td>
                <td className="text-right">
                  {d.status === 'won' && (
                    <button
                      onClick={() => markChurned(d)}
                      className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50"
                    >
                      Mark churned
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-3">
          {errors.length > 0 && (
            <ul className="col-span-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 space-y-1">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <label className="text-xs">
            Status
            <select {...field('status')}>
              <option value="won">Won</option>
              <option value="open">Open</option>
              <option value="lost">Lost</option>
            </select>
          </label>

          <label className="text-xs">
            Currency
            <select {...field('currency')}>
              {['PEN', 'USD', 'GBP', 'COP', 'ARS'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            One-off value
            <input type="number" step="0.01" min="0" placeholder="3200.00" {...field('amount')} />
          </label>

          <label className="text-xs">
            Monthly recurring
            <input type="number" step="0.01" min="0" placeholder="0.00" {...field('mrr')} />
            <span className="block text-gray-400 mt-0.5">
              Monthly figure even if billed annually.
            </span>
          </label>

          <label className="text-xs">
            Closed on
            <input type="date" {...field('closed_at')} />
            <span className="block text-gray-400 mt-0.5">
              Required for won/lost — sales cycle and win rate need it.
            </span>
          </label>

          <label className="text-xs">
            Contract start
            <input type="date" {...field('contract_start')} />
            <span className="block text-gray-400 mt-0.5">
              The cohort key. Without it this deal is in no retention curve.
            </span>
          </label>

          <label className="text-xs">
            Billing
            <select {...field('billing_period')}>
              <option value="one_time">One-off</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>

          <label className="text-xs">
            Acquisition cost
            <input type="number" step="0.01" min="0" placeholder="optional" {...field('acquisition_cost')} />
            <span className="block text-gray-400 mt-0.5">
              Needed for CAC and payback. Blank is excluded, not counted as free.
            </span>
          </label>

          <div className="col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-black text-white rounded text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save deal'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
