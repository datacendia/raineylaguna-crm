'use client'

/**
 * Global AI-draft review queue (ROADMAP #1).
 *
 * Lists every pending Claude-generated outreach draft across all leads, lets
 * the operator edit the copy inline, then Send (real delivery via the shared
 * dispatcher) or Discard. WhatsApp/Email send for real; Instagram DM / LinkedIn
 * are manual channels (no API) — "Send" records an operator-attested send and
 * the operator pastes the copy into the app themselves.
 */

import { useCallback, useEffect, useState } from 'react'

type Draft = {
  id: string
  lead_id: string
  channel: 'WhatsApp' | 'Email' | 'Instagram DM' | 'LinkedIn'
  body: string
  model: string | null
  prompt_version: string | null
  status: string
  generated_at: string
  lead_name: string
  district: string | null
  niche: string | null
  phone: string | null
  email: string | null
  digital_health_score: number | null
}

const MANUAL = new Set(['Instagram DM', 'LinkedIn'])

const channelClass: Record<string, string> = {
  WhatsApp: 'bg-green-100 text-green-800',
  Email: 'bg-blue-100 text-blue-800',
  'Instagram DM': 'bg-pink-100 text-pink-800',
  LinkedIn: 'bg-sky-100 text-sky-800',
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/drafts?status=pending')
    const data = res.ok ? await res.json() : []
    setDrafts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const bodyFor = (d: Draft) => edited[d.id] ?? d.body

  const recipientMissing = (d: Draft) =>
    (d.channel === 'WhatsApp' && !d.phone) || (d.channel === 'Email' && !d.email)

  async function saveBody(d: Draft) {
    const body = bodyFor(d)
    if (body === d.body) return
    await fetch(`/api/drafts/${d.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
  }

  async function send(d: Draft) {
    setBusy(d.id)
    setMsg((m) => ({ ...m, [d.id]: '' }))
    await saveBody(d)
    const res = await fetch(`/api/drafts/${d.id}/send`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) {
      setDrafts((ds) => ds.filter((x) => x.id !== d.id))
    } else {
      setMsg((m) => ({
        ...m,
        [d.id]: `Could not send: ${data.reason ?? data.error ?? res.statusText}`,
      }))
    }
  }

  async function discard(d: Draft) {
    setBusy(d.id)
    const res = await fetch(`/api/drafts/${d.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'discarded' }),
    })
    setBusy(null)
    if (res.ok) setDrafts((ds) => ds.filter((x) => x.id !== d.id))
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Draft queue</h1>
        <button onClick={load} className="text-sm text-gray-500 hover:text-gray-900">
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : drafts.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No pending drafts. Generate one from a lead, or wait for the
          Mon/Wed/Fri cron.
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((d) => {
            const manual = MANUAL.has(d.channel)
            const missing = recipientMissing(d)
            return (
              <div key={d.id} className="bg-white rounded-lg shadow p-5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="font-semibold">{d.lead_name}</span>
                  <span className="text-gray-400 text-sm">
                    {d.district} · {d.niche}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      channelClass[d.channel] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {d.channel}
                  </span>
                  {manual && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                      manual send
                    </span>
                  )}
                  <span className="ml-auto text-xs text-gray-400">
                    {d.model ?? 'draft'} · {new Date(d.generated_at).toLocaleString()}
                  </span>
                </div>

                <textarea
                  value={bodyFor(d)}
                  onChange={(e) => setEdited((m) => ({ ...m, [d.id]: e.target.value }))}
                  onBlur={() => saveBody(d)}
                  rows={6}
                  className="w-full border rounded-md p-3 text-sm font-mono"
                />

                <div className="mt-2 text-xs text-gray-500">
                  {d.channel === 'WhatsApp' && (d.phone ? `→ ${d.phone}` : '⚠ no phone on lead')}
                  {d.channel === 'Email' && (d.email ? `→ ${d.email}` : '⚠ no email on lead')}
                  {manual && '→ copy the text, send it from your account, then mark sent'}
                </div>

                {msg[d.id] && <p className="mt-2 text-sm text-red-600">{msg[d.id]}</p>}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => send(d)}
                    disabled={busy === d.id || (!manual && missing)}
                    className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm disabled:opacity-40"
                  >
                    {busy === d.id ? 'Sending…' : manual ? 'Mark sent' : 'Send'}
                  </button>
                  {manual && (
                    <button
                      onClick={() => navigator.clipboard?.writeText(bodyFor(d))}
                      className="px-4 py-2 rounded-md border text-sm"
                    >
                      Copy
                    </button>
                  )}
                  <button
                    onClick={() => discard(d)}
                    disabled={busy === d.id}
                    className="px-4 py-2 rounded-md border text-sm text-gray-600 disabled:opacity-40"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
