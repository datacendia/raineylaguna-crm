'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { STAGES, CHANNELS, type Lead, type OutreachEvent, type OutreachDraft, type VideoAudit } from '@/lib/types'
import ScriptPanel from '@/components/ScriptPanel'
import { googleMapsUrl, googleMapsEmbedUrl } from '@/lib/maps'
import { healthColor, severityColor } from '@/lib/audit'

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
  const [auditing, setAuditing] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)

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

  const runAudit = async () => {
    setAuditing(true)
    setAuditError(null)
    try {
      const res = await fetch(`/api/leads/${id}/audit`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Audit failed')
      load()
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : 'Audit failed')
    } finally {
      setAuditing(false)
    }
  }

  /**
   * Snooze the lead for N days. Pass 0 to clear the snooze.
   * The list page hides snoozed leads by default.
   */
  const snoozeFor = async (days: number) => {
    const until =
      days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snoozed_until: until }),
    })
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
          {lead.instagram_url && (
            <a
              href={lead.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-pink-600 hover:bg-pink-700 text-white rounded text-sm"
              title={lead.instagram_url}
            >
              <span aria-hidden>📷</span> Instagram
            </a>
          )}
          {lead.facebook_url && (
            <a
              href={lead.facebook_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
              title={lead.facebook_url}
            >
              <span aria-hidden>👍</span> Facebook
            </a>
          )}
          {lead.linkedin_url && (
            <a
              href={lead.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded text-sm"
              title={lead.linkedin_url}
            >
              <span aria-hidden>in</span> LinkedIn
            </a>
          )}
          {lead.tiktok_url && (
            <a
              href={lead.tiktok_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-900 hover:bg-black text-white rounded text-sm"
              title={lead.tiktok_url}
            >
              <span aria-hidden>🎵</span> TikTok
            </a>
          )}
          {lead.website_url && (
            <a
              href={lead.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 border rounded text-sm"
              title={lead.website_url}
            >
              <span aria-hidden>🌐</span> Website
            </a>
          )}
          <a
            href={googleMapsUrl(lead)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 border rounded text-sm"
            title="View on Google Maps"
          >
            <span aria-hidden>📍</span> Maps
          </a>
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
          <Field
            label="Address"
            value={
              <a href={googleMapsUrl(lead)} target="_blank" rel="noopener noreferrer" className="text-vermilion hover:underline">
                {lead.address ?? 'View on Google Maps'}
              </a>
            }
          />
          <Field label="Niche" value={lead.niche} />
          <Field label="Category" value={lead.category} />
          <Field
            label="Instagram"
            value={editing
              ? <input className="border p-1 rounded w-full" value={form.instagram_url ?? ''} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} placeholder="https://instagram.com/handle" />
              : (lead.instagram_url
                  ? <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">{lead.instagram_url.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}</a>
                  : '—')}
          />
          <Field
            label="Facebook"
            value={editing
              ? <input className="border p-1 rounded w-full" value={form.facebook_url ?? ''} onChange={(e) => setForm({ ...form, facebook_url: e.target.value })} placeholder="https://facebook.com/page" />
              : (lead.facebook_url
                  ? <a href={lead.facebook_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{lead.facebook_url.replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '')}</a>
                  : '—')}
          />
          <Field
            label="LinkedIn"
            value={editing
              ? <input className="border p-1 rounded w-full" value={form.linkedin_url ?? ''} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/company/slug" />
              : (lead.linkedin_url
                  ? <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">{lead.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\//, '').replace(/\/$/, '')}</a>
                  : '—')}
          />
          <Field
            label="TikTok"
            value={editing
              ? <input className="border p-1 rounded w-full" value={form.tiktok_url ?? ''} onChange={(e) => setForm({ ...form, tiktok_url: e.target.value })} placeholder="https://tiktok.com/@handle" />
              : (lead.tiktok_url
                  ? <a href={lead.tiktok_url} target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:underline">{lead.tiktok_url.replace(/^https?:\/\/(www\.)?tiktok\.com\//, '').replace(/\/$/, '')}</a>
                  : '—')}
          />
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

        <div className="mt-6 grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Next Action</label>
            <input
              type="text"
              defaultValue={lead.next_action ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v === (lead.next_action ?? '')) return
                fetch(`/api/leads/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ next_action: v || null }),
                }).then(load)
              }}
              placeholder='e.g. "Send Loom audit", "Follow up after proposal"'
              className="border p-2 rounded w-full"
            />
            <p className="text-xs text-gray-400 mt-1">Saved on blur. Shown in the leads list.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Snooze
              {lead.snoozed_until && (
                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                  new Date(lead.snoozed_until).getTime() <= Date.now()
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {new Date(lead.snoozed_until).getTime() <= Date.now()
                    ? `expired ${new Date(lead.snoozed_until).toLocaleDateString()}`
                    : `until ${new Date(lead.snoozed_until).toLocaleDateString()}`}
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[1, 3, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => snoozeFor(d)}
                  className="px-2.5 py-1 border rounded text-xs hover:bg-gray-50"
                  title={`Snooze until ${new Date(Date.now() + d * 86400_000).toLocaleDateString()}`}
                >
                  {d}d
                </button>
              ))}
              {lead.snoozed_until && (
                <button
                  onClick={() => snoozeFor(0)}
                  className="px-2.5 py-1 border border-amber-300 text-amber-700 rounded text-xs hover:bg-amber-50"
                >
                  Wake up
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Hidden from default leads list while snoozed.</p>
          </div>
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

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-gray-700">Digital Audit</h2>
            {lead.audited_at && (
              <span className="text-xs text-gray-400">{new Date(lead.audited_at).toLocaleString()}</span>
            )}
          </div>
          <button
            onClick={runAudit}
            disabled={auditing}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50"
          >
            {auditing ? 'Auditing…' : lead.audited_at ? 'Re-run audit' : 'Run audit'}
          </button>
        </div>

        {auditError && <p className="text-sm text-red-600 mb-3">{auditError}</p>}

        {lead.digital_health_score == null ? (
          <p className="text-sm text-gray-500">
            Not audited yet. Runs Google PageSpeed + on-page checks (~10–20s).
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-4">
              {(() => {
                const c = healthColor(lead.digital_health_score)
                return (
                  <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-lg shrink-0 ${c.bg} ${c.text}`}>
                    <span className="text-2xl font-bold tabular-nums">{lead.digital_health_score}</span>
                    <span className="text-[10px] uppercase tracking-wide">Health</span>
                  </div>
                )
              })()}
              <div className="flex-1">
                <p className="text-sm text-gray-700">{lead.audit_findings?.summary}</p>
                {lead.audit_findings && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    {lead.audit_findings.scores.performance != null && <span>Perf {lead.audit_findings.scores.performance}</span>}
                    {lead.audit_findings.scores.seo != null && <span>SEO {lead.audit_findings.scores.seo}</span>}
                    {lead.audit_findings.scores.accessibility != null && <span>A11y {lead.audit_findings.scores.accessibility}</span>}
                    {lead.audit_findings.scores.bestPractices != null && <span>BP {lead.audit_findings.scores.bestPractices}</span>}
                    {lead.audit_findings.metrics.lcpMs != null && <span>LCP {(lead.audit_findings.metrics.lcpMs / 1000).toFixed(1)}s</span>}
                  </div>
                )}
              </div>
            </div>

            {lead.audit_findings?.flags?.length ? (
              <ul className="flex flex-col gap-1.5">
                {lead.audit_findings.flags.map((f) => {
                  const c = severityColor(f.severity)
                  return (
                    <li key={f.id} className="flex items-center gap-2 text-sm">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${c.bg} ${c.text}`}>{f.severity}</span>
                      <span className="text-gray-700">{f.label}</span>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-medium text-gray-700">Location</h2>
          <a
            href={googleMapsUrl(lead)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-vermilion hover:underline whitespace-nowrap"
          >
            Open in Google Maps ↗
          </a>
        </div>
        {lead.address && <p className="text-sm text-gray-600 mb-3">{lead.address}</p>}
        <iframe
          title={`Map of ${lead.name}`}
          src={googleMapsEmbedUrl(lead)}
          className="w-full h-72 rounded-lg border"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
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
