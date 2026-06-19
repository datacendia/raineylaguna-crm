'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DISTRICTS, NICHES, STAGES, type Lead, type PipelineStage } from '@/lib/types'
import { computePriorityScore, bandColor } from '@/lib/priority-score'
import { googleMapsUrl } from '@/lib/maps'
import { healthColor } from '@/lib/audit'
import { LEAD_SOURCES, normalizeSource } from '@/lib/lead-source'

function whatsappLink(phone: string, name: string): string {
  const digits = phone.replace(/\D/g, '')
  const e164 = digits.startsWith('51') ? digits : `51${digits}`
  const firstName = name.trim().split(/\s+/)[0] ?? ''
  const text = encodeURIComponent(`Hola ${firstName}, te escribo de Rainey Laguna.`)
  return `https://wa.me/${e164}?text=${text}`
}

// The dataset can run to tens of thousands of leads. Rendering every row at
// once locks up the browser, so the table renders in PAGE_SIZE chunks with a
// "Show more" control. Filtering/sorting still happens over the full set.
const PAGE_SIZE = 100

type SortKey =
  | 'name' | 'score' | 'district' | 'address' | 'niche' | 'stage' | 'next_action'
  | 'website' | 'health' | 'evaluation' | 'strategic_action' | 'email' | 'phone' | 'social' | 'chat'

// Columns whose first click should sort high-to-low (most relevant first).
const NUMERIC_KEYS = new Set<SortKey>(['score', 'health', 'social', 'chat'])

const socialCount = (l: Lead): number =>
  [l.instagram_url, l.facebook_url, l.linkedin_url, l.tiktok_url].filter(Boolean).length

function SortHeader({
  label, sortKey, sort, onSort, className,
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  return (
    <th
      className={`text-left p-3 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 ${className ?? ''}`}
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? 'text-vermilion' : 'text-gray-300'}`}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </span>
    </th>
  )
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    district: 'all', niche: 'all', stage: 'all', search: '', includeSnoozed: false,
    website: 'all', evaluation: 'all', social: 'all', chat: 'all', source: 'all', nextAction: '', strategicAction: '',
    hideChains: true,
  })
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStage, setBulkStage] = useState<PipelineStage>('Contacted')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkSnoozeDate, setBulkSnoozeDate] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Update filters and reset paging to the first chunk together. Doing this in
  // one handler avoids a setState-in-effect and keeps the rendered list bounded
  // after any filter/search/sort change.
  const applyFilter = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setVisibleCount(PAGE_SIZE)
  }

  // Clicking a header sorts by that column; clicking the active column flips
  // direction. Numeric columns start descending, text columns ascending.
  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: NUMERIC_KEYS.has(key) ? 'desc' : 'asc' },
    )
    setVisibleCount(PAGE_SIZE)
  }

  const resetFilters = () => {
    setFilters({
      district: 'all', niche: 'all', stage: 'all', search: '', includeSnoozed: false,
      website: 'all', evaluation: 'all', social: 'all', chat: 'all', source: 'all', nextAction: '', strategicAction: '',
      hideChains: true,
    })
    setVisibleCount(PAGE_SIZE)
  }

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.district !== 'all') params.set('district', filters.district)
    if (filters.niche !== 'all') params.set('niche', filters.niche)
    if (filters.stage !== 'all') params.set('stage', filters.stage)
    if (filters.includeSnoozed) params.set('include_snoozed', 'true')
    fetch(`/api/leads?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setLeads(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [filters.district, filters.niche, filters.stage, filters.includeSnoozed])

  // Distinct Website-status / Evaluation values for their dropdowns, derived
  // from the loaded set so the options always reflect real data.
  const websiteStatuses = Array.from(new Set(leads.map((l) => l.website_status).filter(Boolean))).sort() as string[]
  const evaluations = Array.from(new Set(leads.map((l) => l.evaluation).filter(Boolean))).sort() as string[]

  const scored = leads.map((l) => ({ lead: l, ps: computePriorityScore(l) }))

  const matchSocial = (l: Lead): boolean => {
    switch (filters.social) {
      case 'any': return socialCount(l) > 0
      case 'none': return socialCount(l) === 0
      case 'instagram': return !!l.instagram_url
      case 'facebook': return !!l.facebook_url
      case 'linkedin': return !!l.linkedin_url
      case 'tiktok': return !!l.tiktok_url
      default: return true
    }
  }

  const rows = scored.filter(({ lead }) => {
    if (filters.search && !lead.name.toLowerCase().includes(filters.search.toLowerCase())) return false
    if (filters.website !== 'all' && (lead.website_status ?? '') !== filters.website) return false
    if (filters.evaluation !== 'all' && (lead.evaluation ?? '') !== filters.evaluation) return false
    if (filters.nextAction && !(lead.next_action ?? '').toLowerCase().includes(filters.nextAction.toLowerCase())) return false
    if (filters.strategicAction && !(lead.strategic_action ?? '').toLowerCase().includes(filters.strategicAction.toLowerCase())) return false
    if (filters.social !== 'all' && !matchSocial(lead)) return false
    if (filters.chat !== 'all' && (filters.chat === 'has' ? !lead.phone : !!lead.phone)) return false
    if (filters.source !== 'all' && normalizeSource(lead.source) !== filters.source) return false
    if (filters.hideChains && lead.is_chain) return false
    return true
  })

  const dir = sort.dir === 'asc' ? 1 : -1
  const sortVal = (r: { lead: Lead; ps: { score: number } }): string | number => {
    const l = r.lead
    switch (sort.key) {
      case 'score': return r.ps.score
      case 'social': return socialCount(l)
      case 'chat': return l.phone ? 1 : 0
      case 'stage': return STAGES.indexOf(l.pipeline_stage)
      case 'name': return l.name.toLowerCase()
      case 'district': return (l.district ?? '').toLowerCase()
      case 'address': return (l.address ?? '').toLowerCase()
      case 'niche': return (l.niche ?? '').toLowerCase()
      case 'next_action': return (l.next_action ?? '').toLowerCase()
      case 'website': return (l.website_status ?? '').toLowerCase()
      case 'health': return l.digital_health_score ?? -1
      case 'evaluation': return (l.evaluation ?? '').toLowerCase()
      case 'strategic_action': return (l.strategic_action ?? '').toLowerCase()
      case 'email': return (l.email ?? '').toLowerCase()
      case 'phone': return (l.phone ?? '').toLowerCase()
      default: return 0
    }
  }
  const sorted = [...rows].sort((a, b) => {
    const av = sortVal(a), bv = sortVal(b)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
  const filtered = sorted.map((s) => s.lead)
  const visible = filtered.slice(0, visibleCount)
  const scoreById = new Map(sorted.map((s) => [s.lead.id, s.ps]))

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((l) => l.id)))
  }
  const toggleOne = (id: string) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const bulkUpdate = async () => {
    if (selected.size === 0) return
    setBulkBusy(true)
    const res = await fetch('/api/leads/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected), updates: { pipeline_stage: bulkStage } }),
    })
    setBulkBusy(false)
    if (res.ok) {
      setLeads((prev) => prev.map((l) => (selected.has(l.id) ? { ...l, pipeline_stage: bulkStage } : l)))
      setSelected(new Set())
    }
  }

  // Bulk snooze: an explicit ISO date (YYYY-MM-DD) is sent as snoozed_until.
  // Passing `null` un-snoozes every selected lead in one call.
  const bulkSnooze = async (untilISO: string | null) => {
    if (selected.size === 0) return
    setBulkBusy(true)
    const ids = Array.from(selected)
    const res = await fetch('/api/leads/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, updates: { snoozed_until: untilISO } }),
    })
    setBulkBusy(false)
    if (res.ok) {
      setLeads((prev) => prev.map((l) => (selected.has(l.id) ? { ...l, snoozed_until: untilISO } : l)))
      setSelected(new Set())
      setBulkSnoozeDate('')
    }
  }

  // Offset helper: "+7d" -> ISO date string 7 days from today (local).
  const isoDaysFromNow = (days: number): string => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    // YYYY-MM-DD slice is what <input type="date"> and Postgres DATE both expect.
    return d.toISOString().slice(0, 10)
  }

  // CSV export reuses the server-supported filters (district/niche/stage and
  // snooze visibility). Client-only filters (search, social, website, …) are
  // not represented server-side, so the download reflects the coarser filter.
  const exportParams = new URLSearchParams()
  if (filters.district !== 'all') exportParams.set('district', filters.district)
  if (filters.niche !== 'all') exportParams.set('niche', filters.niche)
  if (filters.stage !== 'all') exportParams.set('stage', filters.stage)
  if (filters.includeSnoozed) exportParams.set('include_snoozed', 'true')
  const exportHref = `/api/leads/export?${exportParams.toString()}`

  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Leads <span className="text-base text-gray-500 font-normal">({filtered.length})</span></h1>
        <a
          href={exportHref}
          className="inline-flex items-center gap-1.5 border rounded px-3 py-2 text-sm hover:bg-gray-50"
          title="Download leads (district / niche / stage filters apply) as CSV"
        >
          ⬇ Export CSV
        </a>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search by name…"
            value={filters.search}
            onChange={(e) => applyFilter({ search: e.target.value })}
            className="border p-2 rounded"
          />
          <select value={filters.district} onChange={(e) => applyFilter({ district: e.target.value })} className="border p-2 rounded">
            <option value="all">All Districts</option>
            {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filters.niche} onChange={(e) => applyFilter({ niche: e.target.value })} className="border p-2 rounded">
            <option value="all">All Niches</option>
            {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filters.stage} onChange={(e) => applyFilter({ stage: e.target.value })} className="border p-2 rounded">
            <option value="all">All Stages</option>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={filters.website} onChange={(e) => applyFilter({ website: e.target.value })} className="border p-2 rounded">
            <option value="all">All Website statuses</option>
            {websiteStatuses.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <select value={filters.evaluation} onChange={(e) => applyFilter({ evaluation: e.target.value })} className="border p-2 rounded">
            <option value="all">All Evaluations</option>
            {evaluations.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
          <select value={filters.social} onChange={(e) => applyFilter({ social: e.target.value })} className="border p-2 rounded">
            <option value="all">All Social</option>
            <option value="any">Has any social</option>
            <option value="none">No social</option>
            <option value="instagram">Has Instagram</option>
            <option value="facebook">Has Facebook</option>
            <option value="linkedin">Has LinkedIn</option>
            <option value="tiktok">Has TikTok</option>
          </select>
          <select value={filters.chat} onChange={(e) => applyFilter({ chat: e.target.value })} className="border p-2 rounded">
            <option value="all">Phone: any</option>
            <option value="has">Has phone</option>
            <option value="none">No phone</option>
          </select>
          <select value={filters.source} onChange={(e) => applyFilter({ source: e.target.value })} className="border p-2 rounded">
            <option value="all">All Sources</option>
            {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
          <input
            type="text"
            placeholder="Next action contains…"
            value={filters.nextAction}
            onChange={(e) => applyFilter({ nextAction: e.target.value })}
            className="border p-2 rounded"
          />
          <input
            type="text"
            placeholder="Strategic action contains…"
            value={filters.strategicAction}
            onChange={(e) => applyFilter({ strategicAction: e.target.value })}
            className="border p-2 rounded"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={filters.includeSnoozed}
              onChange={(e) => applyFilter({ includeSnoozed: e.target.checked })}
            />
            Include snoozed leads
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={filters.hideChains}
              onChange={(e) => applyFilter({ hideChains: e.target.checked })}
            />
            Hide chains
          </label>
          <button onClick={resetFilters} className="border rounded px-3 py-2 text-sm hover:bg-gray-50">
            Clear filters
          </button>
        </div>
        <p className="text-xs text-gray-400">Tip: click any column header to sort; click again to reverse.</p>
      </div>

      {selected.size > 0 && (
        <div className="bg-iron text-bone p-3 rounded-lg mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm">{selected.size} selected</span>

          {/* Bulk stage change */}
          <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value as PipelineStage)} className="text-iron p-1 rounded text-sm">
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={bulkUpdate} disabled={bulkBusy} className="bg-vermilion px-3 py-1 rounded text-sm disabled:opacity-50">
            {bulkBusy ? 'Updating…' : 'Move to stage'}
          </button>

          {/* Visual divider between stage group and snooze group */}
          <span className="h-5 w-px bg-bone/30" aria-hidden />

          {/* Bulk snooze: quick presets, custom date, or un-snooze */}
          <span className="text-xs uppercase tracking-wide opacity-70">Snooze</span>
          <button
            onClick={() => bulkSnooze(isoDaysFromNow(7))}
            disabled={bulkBusy}
            className="bg-bone/10 hover:bg-bone/20 px-2 py-1 rounded text-xs disabled:opacity-50"
            title="Snooze all selected leads for 7 days"
          >
            +7d
          </button>
          <button
            onClick={() => bulkSnooze(isoDaysFromNow(30))}
            disabled={bulkBusy}
            className="bg-bone/10 hover:bg-bone/20 px-2 py-1 rounded text-xs disabled:opacity-50"
            title="Snooze all selected leads for 30 days"
          >
            +30d
          </button>
          <input
            type="date"
            value={bulkSnoozeDate}
            onChange={(e) => setBulkSnoozeDate(e.target.value)}
            min={isoDaysFromNow(1)}
            className="text-iron p-1 rounded text-sm"
            aria-label="Snooze until date"
          />
          <button
            onClick={() => bulkSnoozeDate && bulkSnooze(bulkSnoozeDate)}
            disabled={bulkBusy || !bulkSnoozeDate}
            className="bg-vermilion px-3 py-1 rounded text-sm disabled:opacity-50"
          >
            {bulkBusy ? 'Snoozing…' : 'Snooze until'}
          </button>
          <button
            onClick={() => bulkSnooze(null)}
            disabled={bulkBusy}
            className="bg-bone/10 hover:bg-bone/20 px-2 py-1 rounded text-xs disabled:opacity-50"
            title="Clear snooze on all selected leads"
          >
            Unsnooze
          </button>

          <button onClick={() => setSelected(new Set())} className="text-sm underline ml-auto">Clear</button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="p-3 w-8"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
              <SortHeader label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
              <SortHeader label="Score" sortKey="score" sort={sort} onSort={toggleSort} />
              <SortHeader label="District" sortKey="district" sort={sort} onSort={toggleSort} />
              <SortHeader label="Address" sortKey="address" sort={sort} onSort={toggleSort} />
              <SortHeader label="Niche" sortKey="niche" sort={sort} onSort={toggleSort} />
              <SortHeader label="Stage" sortKey="stage" sort={sort} onSort={toggleSort} />
              <SortHeader label="Next Action" sortKey="next_action" sort={sort} onSort={toggleSort} />
              <SortHeader label="Website" sortKey="website" sort={sort} onSort={toggleSort} />
              <SortHeader label="Health" sortKey="health" sort={sort} onSort={toggleSort} />
              <SortHeader label="Evaluation" sortKey="evaluation" sort={sort} onSort={toggleSort} />
              <SortHeader label="Strategic Action" sortKey="strategic_action" sort={sort} onSort={toggleSort} />
              <SortHeader label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
              <SortHeader label="Phone" sortKey="phone" sort={sort} onSort={toggleSort} />
              <SortHeader label="Social" sortKey="social" sort={sort} onSort={toggleSort} />
              <SortHeader label="Chat" sortKey="chat" sort={sort} onSort={toggleSort} className="w-10" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={16} className="p-6 text-gray-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={16} className="p-6 text-gray-500">No leads match these filters.</td></tr>
            ) : visible.map((l) => {
              const snoozeMs = l.snoozed_until ? new Date(l.snoozed_until).getTime() : null
              const snoozeExpired = snoozeMs !== null && snoozeMs <= Date.now()
              const snoozeActive = snoozeMs !== null && snoozeMs > Date.now()
              return (
              <tr key={l.id} className={`border-b hover:bg-gray-50 ${snoozeExpired ? 'bg-amber-50/40' : ''} ${snoozeActive ? 'opacity-60' : ''}`}>
                <td className="p-3"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} /></td>
                <td className="p-3">
                  <Link href={`/dashboard/leads/${l.id}`} className="text-vermilion hover:underline">{l.name}</Link>
                  {snoozeExpired && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded" title="Snooze ended — needs attention">⏰ due</span>
                  )}
                  {snoozeActive && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded" title={`Snoozed until ${new Date(snoozeMs!).toLocaleDateString()}`}>💤 {new Date(snoozeMs!).toLocaleDateString()}</span>
                  )}
                  {l.sereno_customer && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded" title="Converted to a Sereno customer">★ Sereno</span>
                  )}
                </td>
                <td className="p-3 text-sm">
                  {(() => {
                    const ps = scoreById.get(l.id)
                    if (!ps) return null
                    const c = bandColor(ps.band)
                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}
                        title={`${ps.band} · ${ps.why}\nrecency ${ps.breakdown.recency} · web ${ps.breakdown.website} · niche ${ps.breakdown.niche} · work ${ps.breakdown.workability}`}
                      >
                        <span className="font-mono tabular-nums">{ps.score}</span>
                        <span className="opacity-80">{ps.band}</span>
                      </span>
                    )
                  })()}
                </td>
                <td className="p-3 text-sm">{l.district}</td>
                <td className="p-3 text-sm text-gray-600 max-w-[16rem] truncate" onClick={(e) => e.stopPropagation()}>
                  <a href={googleMapsUrl(l)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" title={l.address ?? 'View on Google Maps'}>
                    {l.address ?? <span className="text-gray-500 whitespace-nowrap">📍 Map</span>}
                  </a>
                </td>
                <td className="p-3 text-sm">{l.niche}</td>
                <td className="p-3 text-sm">
                  <span className="px-2 py-1 rounded-full bg-gray-100 text-xs">{l.pipeline_stage}</span>
                </td>
                <td className="p-3 text-sm text-gray-700 max-w-xs truncate" title={l.next_action ?? ''}>
                  {l.next_action ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="p-3 text-sm text-gray-600">{l.website_status ?? '—'}</td>
                <td className="p-3 text-sm">
                  {l.digital_health_score == null ? (
                    <span className="text-gray-300">—</span>
                  ) : (() => {
                    const c = healthColor(l.digital_health_score)
                    return (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${c.bg} ${c.text}`}
                        title={l.audit_findings?.summary ?? ''}
                      >
                        {l.digital_health_score}
                      </span>
                    )
                  })()}
                </td>
                <td className="p-3 text-sm text-gray-600">{l.evaluation ?? '—'}</td>
                <td className="p-3 text-sm text-gray-600">{l.strategic_action ?? '—'}</td>
                <td className="p-3 text-sm max-w-[14rem] truncate" onClick={(e) => e.stopPropagation()}>
                  {l.email ? (
                    <a href={`mailto:${l.email}`} className="text-blue-600 hover:underline" title={l.email}>{l.email}</a>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="p-3 text-sm whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {l.phone ? (
                    <a href={`tel:${l.phone.replace(/\s+/g, '')}`} className="text-gray-700 hover:underline" title={l.phone}>{l.phone}</a>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="p-3 text-sm" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    {l.instagram_url && (
                      <a href={l.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:text-pink-800" title={l.instagram_url} aria-label="Open Instagram">📷</a>
                    )}
                    {l.facebook_url && (
                      <a href={l.facebook_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800" title={l.facebook_url} aria-label="Open Facebook">👍</a>
                    )}
                    {l.linkedin_url && (
                      <a href={l.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:text-sky-900 font-semibold text-xs" title={l.linkedin_url} aria-label="Open LinkedIn">in</a>
                    )}
                    {l.tiktok_url && (
                      <a href={l.tiktok_url} target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-black" title={l.tiktok_url} aria-label="Open TikTok">🎵</a>
                    )}
                    {!l.instagram_url && !l.facebook_url && !l.linkedin_url && !l.tiktok_url && (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-sm" onClick={(e) => e.stopPropagation()}>
                  {l.phone ? (
                    <a
                      href={whatsappLink(l.phone, l.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:text-green-800"
                      title={`WhatsApp ${l.phone}`}
                      aria-label="Open WhatsApp"
                    >
                      💬
                    </a>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-center gap-4 mt-4 text-sm text-gray-600">
          <span>Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}</span>
          {visibleCount < filtered.length && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="px-4 py-1.5 border rounded hover:bg-gray-50"
            >
              Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
