'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { STAGES, type Lead, type PipelineStage } from '@/lib/types'

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])

  const load = () => {
    fetch('/api/leads').then((r) => r.json()).then((d) => setLeads(Array.isArray(d) ? d : []))
  }
  useEffect(load, [])

  // Shared mover used by both desktop drag-drop and the mobile stage <select>.
  const moveLead = async (id: string, stage: PipelineStage) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, pipeline_stage: stage } : l)))
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_stage: stage }),
    })
  }

  const handleDrop = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id) moveLead(id, stage)
  }

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <h1 className="text-3xl sm:text-4xl font-bold mb-2">Pipeline</h1>
      <p className="text-sm text-gray-500 mb-4">
        <span className="hidden lg:inline">Drag cards between columns</span>
        <span className="lg:hidden">Swipe across stages and use each card’s menu</span>
        {' '}to update stage.
      </p>
      {/* Mobile: swipeable horizontal kanban (snap). Desktop: 5-col grid. */}
      <div className="flex lg:grid lg:grid-cols-5 gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory pb-3 -mx-4 px-4 sm:mx-0 sm:px-0">
        {STAGES.map((stage) => {
          const items = leads.filter((l) => l.pipeline_stage === stage)
          return (
            <div
              key={stage}
              className="snap-start shrink-0 w-[80vw] sm:w-[320px] lg:w-auto bg-white rounded-lg shadow p-3 min-h-[300px]"
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
                    {/* Touch-friendly stage mover — HTML5 drag-drop doesn't work on touch. */}
                    <select
                      value={l.pipeline_stage}
                      onChange={(e) => moveLead(l.id, e.target.value as PipelineStage)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 w-full border rounded text-xs p-1 bg-white lg:hidden"
                      aria-label={`Move ${l.name} to another stage`}
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
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
