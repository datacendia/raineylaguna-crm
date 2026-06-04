'use client'

import { useEffect, useState } from 'react'

type Stats = {
  total: number
  addressable?: number | null
  Lead: number
  Contacted: number
  Audited: number
  Proposal: number
  Closed: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => {
    fetch('/api/stats').then((r) => r.json()).then(setStats)
  }, [])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg('')
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const data = await res.json()
    setImportMsg(
      res.ok
        ? `Imported ${data.imported} new lead${data.imported === 1 ? '' : 's'}` +
            (data.skipped ? `, skipped ${data.skipped} duplicate${data.skipped === 1 ? '' : 's'}` : '')
        : `Error: ${data.error}`,
    )
    setImporting(false)
    fetch('/api/stats').then((r) => r.json()).then(setStats)
  }

  const cards: { label: string; value: number | string }[] = [
    { label: 'Total Leads', value: stats?.total ?? 0 },
    { label: 'Addressable (independents)', value: stats?.addressable ?? '—' },
    { label: 'Proposals', value: stats?.Proposal ?? 0 },
    { label: 'Closed', value: stats?.Closed ?? 0 },
  ]

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8">CRM Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-500 text-sm">{c.label}</h3>
            <p className="text-3xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-2">Pipeline breakdown</h2>
        <div className="grid grid-cols-5 gap-2 text-sm">
          {(['Lead', 'Contacted', 'Audited', 'Proposal', 'Closed'] as const).map((s) => (
            <div key={s} className="border rounded p-3">
              <div className="text-gray-500">{s}</div>
              <div className="text-2xl font-bold">{stats?.[s] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Import Leads (CSV)</h2>
        <p className="text-gray-600 mb-4">
          Format: <code>name,district,niche,instagram_active,website_url,website_status,evaluation,strategic_action</code>
        </p>
        <input
          type="file"
          accept=".csv"
          onChange={handleImport}
          disabled={importing}
          className="block"
        />
        {importMsg && <p className="mt-2 text-sm">{importMsg}</p>}
      </div>
    </div>
  )
}
