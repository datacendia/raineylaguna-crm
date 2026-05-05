'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { type Lead, type VideoAudit } from '@/lib/types'

export default function VideoAuditsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [audits, setAudits] = useState<VideoAudit[]>([])
  const [form, setForm] = useState({ lead_id: '', loom_url: '' })

  const reload = () => {
    fetch('/api/leads').then((r) => r.json()).then((d) => setLeads(Array.isArray(d) ? d : []))
    fetch('/api/video-audits').then((r) => r.json()).then((d) => setAudits(Array.isArray(d) ? d : []))
  }
  useEffect(reload, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.lead_id) return
    const res = await fetch('/api/video-audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ lead_id: '', loom_url: '' })
      reload()
    }
  }

  const leadName = (id: string) => leads.find((l) => l.id === id)?.name ?? '—'

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-8">Video Audits</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={submit} className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-xl font-bold">New Video Audit</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Lead</label>
            <select
              value={form.lead_id}
              onChange={(e) => setForm({ ...form, lead_id: e.target.value })}
              className="w-full border p-2 rounded"
              required
            >
              <option value="">Select a lead…</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.district}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Loom URL</label>
            <input
              type="url"
              value={form.loom_url}
              onChange={(e) => setForm({ ...form, loom_url: e.target.value })}
              className="w-full border p-2 rounded"
              required
            />
          </div>
          <button className="bg-vermilion text-white px-4 py-2 rounded">Add Audit</button>
        </form>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">All Audits ({audits.length})</h2>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {audits.length === 0 && <p className="text-gray-400 text-sm">No audits yet.</p>}
            {audits.map((a) => (
              <div key={a.id} className="border-l-2 border-vermilion pl-3 py-1">
                <Link href={`/dashboard/leads/${a.lead_id}`} className="font-medium hover:text-vermilion text-sm">
                  {leadName(a.lead_id)}
                </Link>
                <a href={a.loom_url ?? '#'} target="_blank" rel="noopener" className="block text-xs text-vermilion hover:underline break-all">
                  {a.loom_url}
                </a>
                <div className="text-xs text-gray-500">{new Date(a.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
