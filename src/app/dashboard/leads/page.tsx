'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DISTRICTS, NICHES, STAGES, type Lead } from '@/lib/types'

function whatsappLink(phone: string, name: string): string {
  const digits = phone.replace(/\D/g, '')
  const e164 = digits.startsWith('51') ? digits : `51${digits}`
  const firstName = name.trim().split(/\s+/)[0] ?? ''
  const text = encodeURIComponent(`Hola ${firstName}, te escribo de Rainey Laguna.`)
  return `https://wa.me/${e164}?text=${text}`
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ district: 'all', niche: 'all', stage: 'all', search: '' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStage, setBulkStage] = useState<string>('Contacted')
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.district !== 'all') params.set('district', filters.district)
    if (filters.niche !== 'all') params.set('niche', filters.niche)
    if (filters.stage !== 'all') params.set('stage', filters.stage)
    fetch(`/api/leads?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setLeads(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [filters.district, filters.niche, filters.stage])

  const filtered = filters.search
    ? leads.filter((l) => l.name.toLowerCase().includes(filters.search.toLowerCase()))
    : leads

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
      setLeads((prev) => prev.map((l) => (selected.has(l.id) ? { ...l, pipeline_stage: bulkStage as any } : l)))
      setSelected(new Set())
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Leads <span className="text-base text-gray-500 font-normal">({filtered.length})</span></h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search by name…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="border p-2 rounded"
          />
          <select value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })} className="border p-2 rounded">
            <option value="all">All Districts</option>
            {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filters.niche} onChange={(e) => setFilters({ ...filters, niche: e.target.value })} className="border p-2 rounded">
            <option value="all">All Niches</option>
            {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })} className="border p-2 rounded">
            <option value="all">All Stages</option>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bg-iron text-bone p-3 rounded-lg mb-4 flex items-center gap-3">
          <span className="text-sm">{selected.size} selected</span>
          <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} className="text-iron p-1 rounded text-sm">
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={bulkUpdate} disabled={bulkBusy} className="bg-vermilion px-3 py-1 rounded text-sm">
            {bulkBusy ? 'Updating…' : 'Move to stage'}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm underline ml-auto">Clear</button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="p-3 w-8"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">District</th>
              <th className="text-left p-3">Niche</th>
              <th className="text-left p-3">Stage</th>
              <th className="text-left p-3">Website</th>
              <th className="text-left p-3">Evaluation</th>
              <th className="text-left p-3">Strategic Action</th>
              <th className="text-left p-3 w-10">Chat</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-gray-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-gray-500">No leads match these filters.</td></tr>
            ) : filtered.map((l) => (
              <tr key={l.id} className="border-b hover:bg-gray-50">
                <td className="p-3"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} /></td>
                <td className="p-3"><Link href={`/dashboard/leads/${l.id}`} className="text-vermilion hover:underline">{l.name}</Link></td>
                <td className="p-3 text-sm">{l.district}</td>
                <td className="p-3 text-sm">{l.niche}</td>
                <td className="p-3 text-sm">
                  <span className="px-2 py-1 rounded-full bg-gray-100 text-xs">{l.pipeline_stage}</span>
                </td>
                <td className="p-3 text-sm text-gray-600">{l.website_status ?? '—'}</td>
                <td className="p-3 text-sm text-gray-600">{l.evaluation ?? '—'}</td>
                <td className="p-3 text-sm text-gray-600">{l.strategic_action ?? '—'}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
