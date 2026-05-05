'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { STAGES, CHANNELS, type Lead, type OutreachEvent, type VideoAudit } from '@/lib/types'
import ScriptPanel from '@/components/ScriptPanel'

type LeadResponse = { lead: Lead; outreach: OutreachEvent[]; audits: VideoAudit[] }

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [data, setData] = useState<LeadResponse | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Lead>>({})
  const [outreachForm, setOutreachForm] = useState({ channel: 'Email', notes: '' })
  const [auditForm, setAuditForm] = useState({ loom_url: '' })

  const load = () => {
    fetch(`/api/leads/${id}`).then((r) => r.json()).then((d) => {
      setData(d)
      setForm(d.lead)
    })
  }
  useEffect(load, [id])

  const save = async () => {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setEditing(false)
    load()
  }

  const updateStage = async (stage: string) => {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_stage: stage }),
    })
    load()
  }

  const logOutreach = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/api/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: id, ...outreachForm }),
    })
    setOutreachForm({ channel: 'Email', notes: '' })
    load()
  }

  const logAudit = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/api/video-audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: id, ...auditForm }),
    })
    setAuditForm({ loom_url: '' })
    load()
  }

  const remove = async () => {
    if (!confirm('Delete this lead permanently?')) return
    await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    router.push('/dashboard/leads')
  }

  if (!data) return <div className="p-8">Loading…</div>
  const { lead, outreach, audits } = data

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/dashboard/leads" className="text-sm text-gray-500 hover:underline">← Back to leads</Link>
      <div className="flex justify-between items-start mt-2 mb-6">
        <h1 className="text-4xl font-bold">{lead.name}</h1>
        <div className="space-x-2">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="px-3 py-1 border rounded">Edit</button>
          ) : (
            <>
              <button onClick={save} className="px-3 py-1 bg-vermilion text-white rounded">Save</button>
              <button onClick={() => { setEditing(false); setForm(lead) }} className="px-3 py-1 border rounded">Cancel</button>
            </>
          )}
          <button onClick={remove} className="px-3 py-1 border border-red-300 text-red-600 rounded">Delete</button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="District" value={lead.district} />
          <Field label="Niche" value={lead.niche} />
          <Field label="Category" value={lead.category} />
          <Field label="Instagram Active" value={lead.instagram_active ? 'Yes' : 'No'} />
          <Field
            label="Website URL"
            value={editing ? <input className="border p-1 rounded w-full" value={form.website_url ?? ''} onChange={(e) => setForm({ ...form, website_url: e.target.value })} /> : (lead.website_url || '—')}
          />
          <Field label="Website Status" value={lead.website_status} />
          <Field
            label="Evaluation"
            value={editing ? <input className="border p-1 rounded w-full" value={form.evaluation ?? ''} onChange={(e) => setForm({ ...form, evaluation: e.target.value })} /> : (lead.evaluation || '—')}
          />
          <Field
            label="Strategic Action"
            value={editing ? <input className="border p-1 rounded w-full" value={form.strategic_action ?? ''} onChange={(e) => setForm({ ...form, strategic_action: e.target.value })} /> : (lead.strategic_action || '—')}
          />
          <Field label="Potential" value={lead.potential} />
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">Pipeline Stage</label>
          <div className="flex gap-2">
            {STAGES.map((s) => (
              <button
                key={s}
                onClick={() => updateStage(s)}
                className={`px-3 py-1 rounded text-sm ${lead.pipeline_stage === s ? 'bg-vermilion text-white' : 'border'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">Notes</label>
          <textarea
            className="w-full border rounded p-2 h-24"
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            onBlur={save}
            placeholder="Internal notes…"
          />
        </div>
      </div>

      <div className="mb-6">
        <ScriptPanel lead={lead} onLogged={load} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Outreach</h2>
          <form onSubmit={logOutreach} className="space-y-2 mb-4">
            <select
              value={outreachForm.channel}
              onChange={(e) => setOutreachForm({ ...outreachForm, channel: e.target.value })}
              className="border p-2 rounded w-full"
            >
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea
              value={outreachForm.notes}
              onChange={(e) => setOutreachForm({ ...outreachForm, notes: e.target.value })}
              placeholder="What did you say?"
              className="border p-2 rounded w-full h-20"
            />
            <button className="bg-vermilion text-white px-3 py-1 rounded text-sm">Log Outreach</button>
          </form>
          <div className="space-y-2">
            {outreach.length === 0 && <p className="text-sm text-gray-400">No outreach logged.</p>}
            {outreach.map((o) => (
              <div key={o.id} className="border-l-2 border-vermilion pl-3 py-1 text-sm">
                <div className="font-medium">{o.channel} <span className="text-gray-400 text-xs">{new Date(o.created_at).toLocaleString()}</span></div>
                {o.notes && <p className="text-gray-600 text-xs">{o.notes}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Video Audits</h2>
          <form onSubmit={logAudit} className="space-y-2 mb-4">
            <input
              type="url"
              value={auditForm.loom_url}
              onChange={(e) => setAuditForm({ loom_url: e.target.value })}
              placeholder="https://loom.com/..."
              className="border p-2 rounded w-full"
              required
            />
            <button className="bg-vermilion text-white px-3 py-1 rounded text-sm">Add Audit</button>
          </form>
          <div className="space-y-2">
            {audits.length === 0 && <p className="text-sm text-gray-400">No video audits.</p>}
            {audits.map((a) => (
              <div key={a.id} className="border-l-2 border-vermilion pl-3 py-1 text-sm">
                <a href={a.loom_url ?? '#'} target="_blank" rel="noopener" className="text-vermilion hover:underline break-all">
                  {a.loom_url}
                </a>
                <div className="text-gray-400 text-xs">{new Date(a.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-gray-500 text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-1">{value ?? '—'}</div>
    </div>
  )
}
