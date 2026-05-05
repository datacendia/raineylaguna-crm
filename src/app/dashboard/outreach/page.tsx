'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CHANNELS, type Lead, type OutreachEvent } from '@/lib/types'

export default function OutreachPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [events, setEvents] = useState<OutreachEvent[]>([])
  const [form, setForm] = useState({ lead_id: '', channel: 'Email', notes: '' })
  const [msg, setMsg] = useState('')

  const reload = () => {
    fetch('/api/leads').then((r) => r.json()).then((d) => setLeads(Array.isArray(d) ? d : []))
    fetch('/api/outreach').then((r) => r.json()).then((d) => setEvents(Array.isArray(d) ? d : []))
  }
  useEffect(reload, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.lead_id) return setMsg('Select a lead')
    const res = await fetch('/api/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ lead_id: '', channel: 'Email', notes: '' })
      setMsg('Logged.')
      reload()
    } else {
      setMsg('Error')
    }
  }

  const leadName = (id: string) => leads.find((l) => l.id === id)?.name ?? '—'

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-8">Outreach Tracking</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={submit} className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-xl font-bold">New Outreach</h2>
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
            <label className="block text-sm font-medium mb-1">Channel</label>
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="w-full border p-2 rounded"
            >
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border p-2 rounded h-32"
            />
          </div>
          <button className="bg-vermilion text-white px-4 py-2 rounded">Log Outreach</button>
          {msg && <p className="text-sm text-gray-500">{msg}</p>}
        </form>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Recent Outreach ({events.length})</h2>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {events.length === 0 && <p className="text-gray-400 text-sm">Nothing logged yet.</p>}
            {events.map((e) => (
              <div key={e.id} className="border-l-2 border-vermilion pl-3 py-1">
                <Link href={`/dashboard/leads/${e.lead_id}`} className="font-medium hover:text-vermilion text-sm">
                  {leadName(e.lead_id)}
                </Link>
                <div className="text-xs text-gray-500">{e.channel} · {new Date(e.created_at).toLocaleString()}</div>
                {e.notes && <p className="text-xs text-gray-700 mt-1">{e.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
