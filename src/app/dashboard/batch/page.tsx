'use client'

import { useEffect, useState } from 'react'
import { DISTRICTS, NICHES, type Lead } from '@/lib/types'
import { SCRIPT_TEMPLATES } from '@/lib/scripts'

export default function BatchOutreachPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [filters, setFilters] = useState({ district: 'all', niche: 'all' })
  const [templateId, setTemplateId] = useState(SCRIPT_TEMPLATES[0].id)
  const [perDay, setPerDay] = useState(20)
  const [startAt, setStartAt] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.district !== 'all') params.set('district', filters.district)
    if (filters.niche !== 'all') params.set('niche', filters.niche)
    fetch(`/api/leads?${params}`).then((r) => r.json()).then((d) => setLeads(Array.isArray(d) ? d : []))
  }, [filters.district, filters.niche])

  const submit = async () => {
    setMsg('Scheduling…')
    const res = await fetch('/api/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_ids: leads.map((l) => l.id),
        template_id: templateId,
        per_day: perDay,
        start_at: startAt || undefined,
      }),
    })
    const data = await res.json()
    setMsg(res.ok ? `Scheduled ${data.scheduled} jobs.` : `Error: ${data.error}`)
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-4xl font-bold mb-2">Batch Outreach</h1>
      <p className="text-sm text-gray-500 mb-6">
        Filter a segment, pick a script template, and queue throttled outreach jobs (e.g., 20/day).
        The worker (`npm run worker`) processes the queue and marks events as Sent.
      </p>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">District</label>
            <select value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })} className="w-full border p-2 rounded">
              <option value="all">All Districts</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Niche</label>
            <select value={filters.niche} onChange={(e) => setFilters({ ...filters, niche: e.target.value })} className="w-full border p-2 rounded">
              <option value="all">All Niches</option>
              {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Template</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full border p-2 rounded">
            {SCRIPT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Only leads where the template matches the niche will be scheduled.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Per day</label>
            <input type="number" min={1} max={500} value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start at (optional)</label>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="w-full border p-2 rounded" />
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm mb-2">Will schedule for <strong>{leads.length}</strong> filtered leads (template-matching subset only).</p>
          <button onClick={submit} className="bg-vermilion text-white px-4 py-2 rounded">
            Schedule Batch
          </button>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
        </div>
      </div>
    </div>
  )
}
