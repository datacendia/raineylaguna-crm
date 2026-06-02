'use client'

/**
 * Inline tag editor for a lead. Self-contained: fetches, adds, and removes
 * tags against /api/leads/[id]/tags (which returns the full string[] after
 * every mutation, so we just mirror the server's list).
 */
import { useEffect, useState } from 'react'

export default function TagEditor({ leadId }: { leadId: string }) {
  const [tags, setTags] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/leads/${leadId}/tags`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d)) setTags(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [leadId])

  const add = async () => {
    const name = input.trim()
    if (!name || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: name }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to add tag')
      if (Array.isArray(d)) setTags(d)
      setInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add tag')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (tag: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/tags?tag=${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to remove tag')
      if (Array.isArray(d)) setTags(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove tag')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2">Tags</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              disabled={busy}
              className="text-gray-400 hover:text-red-600 leading-none"
              title={`Remove "${t}"`}
              aria-label={`Remove tag ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-gray-400">No tags yet</span>}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Add a tag…"
          maxLength={100}
          className="border p-1.5 rounded text-sm flex-1"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !input.trim()}
          className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
