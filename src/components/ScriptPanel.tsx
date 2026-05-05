'use client'

import { useState } from 'react'
import { templatesFor } from '@/lib/scripts'
import type { Lead } from '@/lib/types'

export default function ScriptPanel({ lead, onLogged }: { lead: Lead; onLogged?: () => void }) {
  const templates = templatesFor(lead)
  const [activeId, setActiveId] = useState(templates[0]?.id)
  const [copyMsg, setCopyMsg] = useState('')

  if (templates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-2">Outreach Scripts</h2>
        <p className="text-sm text-gray-500">No matching template for niche: {lead.niche}</p>
      </div>
    )
  }

  const active = templates.find((t) => t.id === activeId) ?? templates[0]
  const text = active.render(lead)

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopyMsg('Copied to clipboard')
    setTimeout(() => setCopyMsg(''), 2000)
  }

  const logAsOutreach = async () => {
    await fetch('/api/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: lead.id, channel: active.channel, notes: text }),
    })
    setCopyMsg('Logged as outreach event')
    setTimeout(() => setCopyMsg(''), 2000)
    onLogged?.()
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-3">Outreach Scripts</h2>
      <div className="flex flex-wrap gap-2 mb-3">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`text-xs px-3 py-1 rounded ${active.id === t.id ? 'bg-vermilion text-white' : 'border'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-500 mb-2">Channel: {active.channel}</div>
      <textarea
        readOnly
        value={text}
        className="w-full border rounded p-3 h-64 font-mono text-xs"
      />
      <div className="flex gap-2 mt-3">
        <button onClick={copy} className="bg-vermilion text-white px-3 py-1 rounded text-sm">Copy</button>
        <button onClick={logAsOutreach} className="border px-3 py-1 rounded text-sm">Copy & Log as outreach</button>
        {copyMsg && <span className="text-sm text-gray-500 self-center">{copyMsg}</span>}
      </div>
    </div>
  )
}
