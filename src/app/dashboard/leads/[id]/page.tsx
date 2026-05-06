'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { STAGES, CHANNELS, type Lead, type OutreachEvent, type OutreachDraft, type VideoAudit } from '@/lib/types'
import ScriptPanel from '@/components/ScriptPanel'

type LeadResponse = { lead: Lead; outreach: OutreachEvent[]; audits: VideoAudit[] }

/**
 * wa.me deep link with a custom prefilled body. Strips non-digits and adds 51
 * country code if missing.
 */
function whatsappLinkWithBody(phone: string, body: string): string {
  const digits = phone.replace(/\D/g, '')
  const e164 = digits.startsWith('51') ? digits : `51${digits}`
  return `https://wa.me/${e164}?text=${encodeURIComponent(body)}`
}

/**
 * Build a wa.me deep link from a Peruvian phone number. Strips non-digits,
 * prepends 51 country code if not already present, and pre-fills a friendly
 * Spanish greeting using the lead's first name.
 */
function whatsappLink(phone: string, name: string): string {
  const digits = phone.replace(/\D/g, '')
  const e164 = digits.startsWith('51') ? digits : `51${digits}`
  const firstName = name.trim().split(/\s+/)[0] ?? ''
  const text = encodeURIComponent(`Hola ${firstName}, te escribo de Rainey Laguna.`)
  return `https://wa.me/${e164}?text=${text}`
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [data, setData] = useState<LeadResponse | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Lead>>({})
  const [outreachForm, setOutreachForm] = useState({ channel: 'Email', notes: '' })
  const [auditForm, setAuditForm] = useState({ loom_url: '' })
  const [draft, setDraft] = useState<OutreachDraft | null>(null)
  const [draftBody, setDraftBody] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  const loadDraft = () => {
    fetch(`/api/leads/${id}/draft-outreach`)
      .then((r) => r.json())
      .then((d: OutreachDraft | null) => {
        setDraft(d)
        setDraftBody(d?.body ?? '')
      })
      .catch(() => {})
  }

  const load = () => {
    fetch(`/api/leads/${id}`).then((r) => r.json()).then((d) => {
      setData(d)
      setForm(d.lead)
    })
    loadDraft()
  }
  useEffect(load, [id])

  const generateDraft = async () => {
    setGenerating(true)
    setDraftError(null)
    try {
      const res = await fetch(`/api/leads/${id}/draft-outreach`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')
      setDraft(json)
      setDraftBody(json.body)
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const updateDraft = async (status: 'sent' | 'discarded' | 'pending', bodyOverride?: string) => {
    if (!draft) return
    const payload: Record<string, unknown> = { draft_id: draft.id, status }
    if (typeof bodyOverride === 'string') payload.body = bodyOverride
    await fetch(`/api/leads/${id}/draft-outreach`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    loadDraft()
  }

  const sendDraftViaWhatsApp = async () => {
    if (!draft || !data?.lead.phone) return
    // Persist any in-place edits before opening the WhatsApp deep link.
    if (draftBody !== draft.body) {
      await updateDraft('sent', draftBody)
    } else {
      await updateDraft('sent')
    }
    // Also log a corresponding outreach event so the dashboard reflects it.
    await fetch('/api/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: id, channel: 'WhatsApp', notes: '[AI draft] ' + draftBody.slice(0, 200) }),
    })
    load()
    window.open(whatsappLinkWithBody(data.lead.phone, draftBody), '_blank', 'noopener')
  }

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
        <div>
          <h1 className="text-4xl font-bold">{lead.name}</h1>
          {lead.source && (
            <p className="text-xs text-gray-400 font-mono mt-1">via {lead.source}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          {lead.phone && (
            <a
              href={whatsappLink(lead.phone, lead.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
              title={`Open WhatsApp chat with ${lead.phone}`}
            >
              <span aria-hidden>💬</span> WhatsApp
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}?subject=${encodeURIComponent(`Hola ${lead.name.split(' ')[0]}`)}`}
              className="inline-flex items-center gap-1.5 px-3 py-1 border rounded text-sm"
              title={`Email ${lead.email}`}
            >
              <span aria-hidden>✉️</span> Email
            </a>
          )}
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
          <Field
            label="Phone"
            value={editing
              ? <input className="border p-1 rounded w-full" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+51 999 888 777" />
              : (lead.phone
                  ? <a href={whatsappLink(lead.phone, lead.name)} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">{lead.phone}</a>
                  : '—')}
          />
          <Field
            label="Email"
            value={editing
              ? <input className="border p-1 rounded w-full" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="alguien@ejemplo.com" />
              : (lead.email ? <a href={`mailto:${lead.email}`} className="text-vermilion hover:underline">{lead.email}</a> : '—')}
          />
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

      <div className="bg-white rounded-lg shadow p-6 mb-6 border-l-4 border-l-vermilion">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold">AI WhatsApp Draft</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Personalized opener generated from this lead's data. Review, edit, then send.
            </p>
          </div>
          <button
            onClick={generateDraft}
            disabled={generating}
            className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 disabled:opacity-50"
            title={draft ? 'Generate a new draft (replaces the current one)' : 'Generate a personalized opener'}
          >
            {generating ? 'Generating…' : draft ? '↻ Regenerate' : '✨ Generate draft'}
          </button>
        </div>

        {draftError && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
            {draftError}
          </div>
        )}

        {!draft && !generating && !draftError && (
          <p className="text-sm text-gray-400 italic">No draft yet. Click "Generate draft" to create one.</p>
        )}

        {draft && (
          <>
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              className="w-full border rounded p-3 text-sm font-sans whitespace-pre-wrap h-48"
              spellCheck
            />
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                onClick={sendDraftViaWhatsApp}
                disabled={!lead.phone}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={lead.phone ? 'Open WhatsApp with this body prefilled' : 'No phone on this lead'}
              >
                <span aria-hidden>💬</span> Send via WhatsApp
              </button>
              <button
                onClick={() => updateDraft('discarded')}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                Discard
              </button>
              <span className="ml-auto text-xs text-gray-400 font-mono">
                {draft.status} · {draft.model ?? 'unknown'} · {new Date(draft.generated_at).toLocaleString()}
              </span>
            </div>
          </>
        )}
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
