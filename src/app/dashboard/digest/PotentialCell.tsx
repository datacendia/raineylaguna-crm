'use client'

/**
 * Digest "Potential" cell: links the free-text potential to the matching
 * raineylaguna.com service, and offers an on-demand "Generate / view demo"
 * button. Generation is explicit (a click) so Claude spend stays controlled —
 * the first click generates if needed, later clicks just open the saved demo.
 */

import { useState } from 'react'
import { mapPotentialToService, describePotential } from '@/lib/services-map'

export default function PotentialCell({
  leadId,
  potential,
  hasSite,
}: {
  leadId: string
  potential: string | null
  hasSite: boolean
}) {
  const [busy, setBusy] = useState(false)
  const service = mapPotentialToService(potential, { hasSite })
  const description = describePotential(potential)

  if (!potential) return <span className="text-gray-400">—</span>
  // Level words (High/Medium/…) resolve to null → plain text, no link/demo.
  if (!service) return <span className="text-gray-700">{potential}</span>

  const openDemo = async () => {
    setBusy(true)
    try {
      const existing = await fetch(`/api/leads/${leadId}/pitch`).then((r) => r.json())
      if (!existing || !existing.id) {
        const res = await fetch(`/api/leads/${leadId}/pitch`, { method: 'POST' })
        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          throw new Error(e.error || `HTTP ${res.status}`)
        }
      }
      window.open(`/dashboard/leads/${leadId}/pitch`, '_blank', 'noopener')
    } catch (err) {
      alert(`No se pudo generar el demo: ${err instanceof Error ? err.message : 'error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-0.5 max-w-[18rem]">
      <a
        href={service.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-iron hover:text-vermilion hover:underline"
        title={`${service.name} — ${service.blurb}`}
      >
        {potential}
      </a>
      {description && <span className="text-xs text-gray-500 leading-snug">{description}</span>}
      <button
        type="button"
        onClick={openDemo}
        disabled={busy}
        className="self-start text-xs text-oxide hover:text-vermilion disabled:opacity-50"
      >
        {busy ? 'Generando…' : 'Generar / ver demo →'}
      </button>
    </div>
  )
}
