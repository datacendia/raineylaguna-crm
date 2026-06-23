'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { healthColor } from '@/lib/audit'
import { bandColor, type ScoreBand } from '@/lib/priority-score'

type Analytics = {
  totals: { total: number; addressable: number; audited: number }
  contactability: {
    total: number
    with_email: number
    with_phone: number
    with_instagram: number
    reachable_any: number
  }
  stage: Record<string, number>
  health: { unscored: number; buckets: { label: string; count: number }[] }
  byCity: { city: string; total: number; addressable: number; audited: number; avg_health: number | null }[]
  byNiche: { niche: string; total: number; avg_health: number | null }[]
  bySource: { source: string; count: number }[]
  topFlags: { id: string; label: string; severity: string; count: number }[]
  opportunities: {
    id: string
    name: string
    city: string
    district: string
    niche: string
    score: number
    band: ScoreBand
    health: number | null
    opening: string
    headline: string
    talkingPoints: string[]
    locale: 'es' | 'en'
  }[]
}

function Card({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-gray-500 text-sm">{label}</h3>
      <p className="text-3xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function Bar({ label, count, max, tone = 'bg-vermilion' }: { label: string; count: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-44 shrink-0 text-gray-600 truncate" title={label}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
        <div className={`${tone} h-4 rounded`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right tabular-nums text-gray-700">{count.toLocaleString()}</span>
    </div>
  )
}

const sevTone: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-gray-400',
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('request failed'))))
      .then(setData)
      .catch(() => setError('Could not load analytics.'))
  }, [])

  const copy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500)
    })
  }

  if (error) return <div className="p-8 text-red-700">{error}</div>
  if (!data) return <div className="p-8 text-gray-500">Loading analytics…</div>

  const { totals, contactability, stage, health, byCity, byNiche, bySource, topFlags, opportunities } = data
  const reachablePct = contactability.total ? Math.round((contactability.reachable_any / contactability.total) * 100) : 0
  const healthMax = Math.max(1, ...health.buckets.map((b) => b.count))
  const nicheMax = Math.max(1, ...byNiche.map((n) => n.total))
  const flagMax = Math.max(1, ...topFlags.map((f) => f.count))
  const sourceMax = Math.max(1, ...bySource.map((s) => s.count))

  return (
    <div className="min-h-screen p-4 sm:p-8 space-y-8">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Live insight across every market — plus an auto-ranked queue of who to contact next and what to say.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Total leads" value={totals.total} />
        <Card label="Addressable (independents)" value={totals.addressable} sub="chains & placeholders excluded" />
        <Card label="Audited" value={totals.audited} sub={`${totals.total ? Math.round((totals.audited / totals.total) * 100) : 0}% of all leads`} />
        <Card label="Reachable" value={`${reachablePct}%`} sub={`${contactability.reachable_any.toLocaleString()} have a contact channel`} />
      </div>

      {/* Opportunity Radar — the headline feature */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-xl font-bold">Opportunity Radar</h2>
          <span className="text-xs text-gray-400">Top untouched, reachable leads · scored + auto-pitched · no AI cost</span>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Each opening line is built only from this lead’s real audit findings — copy it and go.
        </p>
        {opportunities.length === 0 ? (
          <p className="text-gray-400 text-sm">No eligible leads yet. Run audits to populate the radar.</p>
        ) : (
          <div className="space-y-3">
            {opportunities.map((o, i) => {
              const band = bandColor(o.band)
              const hc = o.health != null ? healthColor(o.health) : { bg: 'bg-gray-100', text: 'text-gray-600' }
              return (
                <div key={o.id} className="border rounded-lg p-4 hover:border-vermilion transition-colors">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-300 font-bold tabular-nums">{i + 1}</span>
                        <Link href={`/dashboard/leads/${o.id}`} className="font-semibold hover:text-vermilion truncate">
                          {o.name}
                        </Link>
                        <span className={`text-xs px-2 py-0.5 rounded ${band.bg} ${band.text}`}>{o.band} · {o.score}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${hc.bg} ${hc.text}`}>
                          Health {o.health ?? '—'}
                        </span>
                        <span className="text-xs text-gray-400">{o.city} · {o.district} · {o.niche}</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-800 italic">“{o.opening}”</p>
                      {o.talkingPoints.length > 0 && (
                        <ul className="mt-2 list-disc list-inside text-xs text-gray-600 space-y-0.5">
                          {o.talkingPoints.map((t, j) => <li key={j}>{t}</li>)}
                        </ul>
                      )}
                    </div>
                    <button
                      onClick={() => copy(o.id, o.opening)}
                      className="shrink-0 text-xs border rounded px-3 py-1.5 hover:bg-gray-50"
                    >
                      {copied === o.id ? 'Copied!' : 'Copy opener'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Pipeline + health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Pipeline</h2>
          <div className="grid grid-cols-5 gap-2 text-center">
            {(['Lead', 'Contacted', 'Audited', 'Proposal', 'Closed'] as const).map((s) => (
              <div key={s} className="border rounded p-3">
                <div className="text-xs text-gray-500">{s}</div>
                <div className="text-2xl font-bold">{(stage[s] ?? 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-1">Digital health distribution</h2>
          <p className="text-xs text-gray-400 mb-4">Lower = bigger sales opportunity · {health.unscored.toLocaleString()} unscored</p>
          <div className="space-y-2">
            {health.buckets.map((b) => (
              <Bar key={b.label} label={b.label} count={b.count} max={healthMax} />
            ))}
          </div>
        </section>
      </div>

      {/* Opportunity signals + contactability */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-1">Top opportunity signals</h2>
          <p className="text-xs text-gray-400 mb-4">Most common audit findings across addressable leads</p>
          <div className="space-y-2">
            {topFlags.map((f) => (
              <Bar key={f.id} label={f.label} count={f.count} max={flagMax} tone={sevTone[f.severity] ?? 'bg-vermilion'} />
            ))}
            {topFlags.length === 0 && <p className="text-sm text-gray-400">No audit findings yet.</p>}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Contactability</h2>
          <div className="space-y-2">
            <Bar label="Has phone" count={contactability.with_phone} max={contactability.total} tone="bg-green-500" />
            <Bar label="Has email" count={contactability.with_email} max={contactability.total} tone="bg-green-500" />
            <Bar label="Has Instagram" count={contactability.with_instagram} max={contactability.total} tone="bg-green-500" />
            <Bar label="Any channel" count={contactability.reachable_any} max={contactability.total} tone="bg-iron" />
          </div>
        </section>
      </div>

      {/* By city */}
      <section className="bg-white rounded-lg shadow p-6 overflow-x-auto">
        <h2 className="text-xl font-bold mb-4">By market</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-4">City</th>
              <th className="py-2 pr-4 text-right">Total</th>
              <th className="py-2 pr-4 text-right">Addressable</th>
              <th className="py-2 pr-4 text-right">Audited</th>
              <th className="py-2 pr-4 text-right">Avg health</th>
            </tr>
          </thead>
          <tbody>
            {byCity.map((c) => (
              <tr key={c.city} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{c.city}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{c.total.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{c.addressable.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{c.audited.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{c.avg_health ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* By niche + source */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">By niche</h2>
          <div className="space-y-2">
            {byNiche.map((n) => (
              <Bar key={n.niche} label={`${n.niche}${n.avg_health != null ? ` · ~${n.avg_health}` : ''}`} count={n.total} max={nicheMax} />
            ))}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">By source</h2>
          <div className="space-y-2">
            {bySource.map((s) => (
              <Bar key={s.source} label={s.source} count={s.count} max={sourceMax} tone="bg-iron" />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
