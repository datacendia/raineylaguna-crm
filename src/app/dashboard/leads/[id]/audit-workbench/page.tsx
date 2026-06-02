'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import AuditWorkbench from '@/components/AuditWorkbench'
import type { Lead } from '@/lib/types'

export default function AuditWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [lead, setLead] = useState<Lead | null>(null)
  const [auditor, setAuditor] = useState('')
  const [meLoaded, setMeLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.lead) setLead(d.lead)
        else setError(true)
      })
      .catch(() => setError(true))
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (u?.name) setAuditor(u.name)
      })
      .catch(() => {})
      .finally(() => setMeLoaded(true))
  }, [id])

  if (error) {
    return (
      <div className="p-8">
        Lead not found. <Link href="/dashboard/leads" className="text-vermilion underline">← Back to leads</Link>
      </div>
    )
  }
  if (!lead || !meLoaded) return <div className="p-8">Loading…</div>

  return (
    <AuditWorkbench
      leadId={id}
      leadName={lead.name}
      websiteUrl={lead.website_url}
      auditorName={auditor}
      initial={lead.manual_audit}
    />
  )
}
