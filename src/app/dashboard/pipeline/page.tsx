'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { STAGES, type Lead } from '@/lib/types'

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])

  const load = () => {
    fetch('/api/leads').then((r) => r.json()).then((d) => setLeads(Array.isArray(d) ? d : []))
  }
  useEffect(load, [])

  const handleDrop = async (e: React.DragEvent, stage: string) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, pipeline_stage: stage as any } : l)))
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_stage: stage }),
    })
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8">Pipeline</h1>
      <p className="text-sm text-gray-500 mb-4">Drag cards between columns to update stage.</p>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {STAGES.map((stage) => {
          const items = leads.filter((l) => l.pipeline_stage === stage)
          return (
            <div
              key={stage}
              className="bg-white rounded-lg shadow p-3 min-h-[300px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, stage)}
            >
              <h3 className="font-bold mb-3 flex justify-between">
                <span>{stage}</span>
                <span className="text-gray-400 text-sm">{items.length}</span>
              </h3>
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {items.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}
                    className="border p-2 rounded bg-gray-50 cursor-grab active:cursor-grabbing"
                  >
                    <Link href={`/dashboard/leads/${l.id}`} className="font-medium text-sm hover:text-vermilion block">
                      {l.name}
                    </Link>
                    <div className="text-xs text-gray-500 mt-1">{l.district} · {l.niche}</div>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-gray-400 italic">Drop leads here</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
