'use client'

/**
 * On-demand generate / regenerate button for a lead's pitch demo. Explicit
 * click only (controls Claude spend); regenerate asks for confirmation since it
 * replaces the current demo and costs tokens.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PitchActions({ leadId, hasPitch }: { leadId: string; hasPitch: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const generate = async () => {
    if (hasPitch && !confirm('¿Regenerar el demo? Esto consume tokens de Claude y reemplaza el actual.')) {
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/pitch`, { method: 'POST' })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (err) {
      alert(`No se pudo generar: ${err instanceof Error ? err.message : 'error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={generate}
      disabled={busy}
      className="shrink-0 rounded-md bg-vermilion px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      {busy ? 'Generando…' : hasPitch ? 'Regenerar demo' : 'Generar demo'}
    </button>
  )
}
