'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Lead } from './types'

/**
 * Fetch leads a page at a time, and keep the true total in hand.
 *
 * /api/leads used to return all 36,809 rows to every caller. It now returns a
 * bounded page and reports the real total in X-Total-Count, so a page can show
 * "500 of 36,809" instead of implying that 500 is the base.
 *
 * Shared rather than reimplemented per page because four pages fetch this
 * endpoint and all four were making the same whole-table request.
 */
export function usePagedLeads(query = '', pageSize = 500) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true)
      try {
        const params = new URLSearchParams(query)
        params.set('limit', String(pageSize))
        params.set('offset', String(offset))
        const res = await fetch(`/api/leads?${params}`)
        const data = await res.json()
        const rows: Lead[] = Array.isArray(data) ? data : []

        // Absent header (older deploy, proxy stripping it) leaves total null,
        // and TruncationNotice then says nothing rather than guessing.
        const header = res.headers.get('X-Total-Count')
        setTotal(header === null ? null : Number(header))
        setLeads((prev) => (append ? [...prev, ...rows] : rows))
      } finally {
        setLoading(false)
      }
    },
    [query, pageSize],
  )

  useEffect(() => {
    void fetchPage(0, false)
  }, [fetchPage])

  const loadMore = useCallback(
    () => fetchPage(leads.length, true),
    [fetchPage, leads.length],
  )

  const reload = useCallback(() => fetchPage(0, false), [fetchPage])

  return { leads, setLeads, total, loading, loadMore, reload }
}
