'use client'

/**
 * "You are looking at a page, not the base."
 *
 * /api/leads now returns at most 500 rows by default instead of all 36,809.
 * That fixes a 38MB payload, but a page showing 500 rows with no indication
 * would simply swap one misleading number for another — the operator would
 * read "no results past here" as "no more leads exist", which is exactly the
 * class of error the pipeline counts already suffer from.
 *
 * So every page that pages says so, in the same words.
 */
export function TruncationNotice({
  shown,
  total,
  onLoadMore,
  loading,
}: {
  shown: number
  total: number | null
  onLoadMore?: () => void
  loading?: boolean
}) {
  // Total unknown (older response, or a failed header read) — say nothing
  // rather than guess. A wrong count is worse than no count.
  if (total === null) return null
  if (shown >= total) {
    return (
      <p className="text-xs text-gray-500 mt-2">
        Showing all {total.toLocaleString()}.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-3 mt-2">
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
        Showing {shown.toLocaleString()} of {total.toLocaleString()} — this is a
        page, not the whole base.
      </p>
      {onLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
