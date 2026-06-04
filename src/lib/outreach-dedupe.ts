import type { Lead } from './types'
import { computePriorityScore } from './priority-score'

/**
 * Outreach destination de-duplication.
 *
 * A company with several locations in the CRM usually shares ONE corporate
 * contact — the same email, or the same switchboard number (OXXO's branches all
 * carry +51 1 6013636; the Tambos share one Lindcorp inbox). Scheduling a batch
 * straight off a district sweep therefore fires N messages at a single inbox.
 *
 * This collapses a batch to one message per destination, so a multi-location
 * company is contacted once, not once per branch.
 */

/** Lowercased, trimmed email — or null if absent/blank. */
export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null
  const v = email.trim().toLowerCase()
  return v || null
}

/** Digits-only phone (drops +, spaces, dashes) — or null if absent/blank. */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null
  const v = phone.replace(/\D/g, '')
  return v || null
}

/** Lowercased URL without a trailing slash — or null if absent/blank. */
function normalizeUrl(url?: string | null): string | null {
  if (!url) return null
  const v = url.trim().toLowerCase().replace(/\/+$/, '')
  return v || null
}

/**
 * The destination an outreach message on `channel` is actually delivered to,
 * normalised so the same inbox/number matches across rows regardless of how it
 * was stored. null = this lead has no usable destination for the channel.
 */
export function destinationFor(lead: Lead, channel: string): string | null {
  switch (channel) {
    case 'Email':
      return normalizeEmail(lead.email)
    case 'WhatsApp':
      return normalizePhone(lead.phone)
    case 'Instagram DM':
      return normalizeUrl(lead.instagram_url)
    case 'LinkedIn':
      return normalizeUrl(lead.linkedin_url)
    default:
      return null
  }
}

export type DedupeResult = { keep: Lead[]; skipped: Lead[] }

/**
 * Collapse leads that share an outreach destination so a multi-location company
 * receives a single message. Leads with no destination for the channel are all
 * kept (each is its own recipient — a missing contact is not evidence two rows
 * are the same company). Within a shared-destination group the highest-priority
 * lead is the representative that is kept; the others are returned in `skipped`.
 *
 * Pure and deterministic for a given `now`; performs no I/O.
 */
export function dedupeByDestination(
  leads: Lead[],
  channel: string,
  now: Date = new Date(),
): DedupeResult {
  const groups = new Map<string, Lead[]>()
  const keep: Lead[] = []

  for (const lead of leads) {
    const dest = destinationFor(lead, channel)
    if (!dest) {
      keep.push(lead) // nothing to collapse on
      continue
    }
    const arr = groups.get(dest)
    if (arr) arr.push(lead)
    else groups.set(dest, [lead])
  }

  const skipped: Lead[] = []
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      keep.push(arr[0])
      continue
    }
    // Keep the strongest lead per destination; skip the other locations.
    const ranked = [...arr].sort((a, b) => {
      const sa = computePriorityScore(a, now).score
      const sb = computePriorityScore(b, now).score
      if (sb !== sa) return sb - sa
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    keep.push(ranked[0])
    skipped.push(...ranked.slice(1))
  }

  return { keep, skipped }
}
