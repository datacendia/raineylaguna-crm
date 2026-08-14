import { normaliseBrand } from './chain-detect'

/**
 * Duplicate lead detection.
 *
 * The base holds 2,221 duplicate rows across 1,474 groups — "Tienda Mass" x83,
 * "Casa" x67, Starbucks LA x36, Home Depot x30 — plus 1,936 rows sharing a
 * phone number with another row. Every one of those is a lead the batch sender
 * would contact more than once, and "Will schedule for 36809 filtered leads"
 * has no dedupe filter in front of it.
 *
 * Two independent duplicate signals, deliberately kept separate:
 *
 *   identity  same normalised name in the same city AND district. One business
 *             scraped more than once. Note the district requirement: the same
 *             name across MANY districts is a chain, not a duplicate, and
 *             chain-detect.ts owns that case. Getting this backwards would
 *             merge 42 Adidas branches into one lead.
 *
 *   contact   same phone or same email. A shared mobile can legitimately mean
 *             a chain's head office, so this signal is reported but is NOT
 *             sufficient on its own to merge — the caller decides.
 *
 * Merging is destructive, so nothing here mutates anything. The module ranks
 * each group and nominates a survivor; the caller applies it.
 */

export type DedupeCandidate = {
  id: string
  name: string
  city?: string | null
  district?: string | null
  phone?: string | null
  email?: string | null
  website_url?: string | null
  digital_health_score?: number | null
  audited_at?: string | null
  pipeline_stage?: string | null
  created_at?: string | null
}

export type DuplicateGroup = {
  /** What made these a group. */
  reason: 'identity' | 'phone' | 'email'
  key: string
  /** The row to keep — richest, then oldest. See pickSurvivor. */
  survivorId: string
  /** Rows to merge into the survivor. Never includes survivorId. */
  duplicateIds: string[]
  size: number
}

/** Digits only, so +51 999 111 222 and 51999111222 collide as they should. */
export function normalisePhone(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '')
}

export function normaliseEmail(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase()
}

/** Identity key: brand + where it is. Same business, same place. */
export function identityKey(lead: DedupeCandidate): string {
  const brand = normaliseBrand(lead.name)
  if (!brand) return ''
  const city = String(lead.city ?? '').trim().toLowerCase()
  const district = String(lead.district ?? '').trim().toLowerCase()
  return `${brand}|${city}|${district}`
}

/**
 * How much a row is worth keeping. Higher wins.
 *
 * Merging is destructive and the fields are unevenly populated — email exists
 * on 7.6% of rows, audits on 34% — so the survivor must be the row carrying
 * the most that would otherwise be lost, not simply the first one seen.
 */
export function richness(lead: DedupeCandidate): number {
  let score = 0
  if (lead.email) score += 8
  if (lead.phone) score += 5
  if (lead.website_url) score += 3
  if (typeof lead.digital_health_score === 'number') score += 3
  if (lead.audited_at) score += 2
  // Pipeline history outranks every field COMBINED, not merely most of them —
  // hence 100 against a field ceiling of 21.
  //
  // The asymmetry is real: a missing email can be copied across from the row
  // being merged away, but the record that this lead was contacted, audited
  // and sent a proposal cannot be reconstructed, and the outreach events,
  // drafts and video audits pointing at it would all have to be repointed.
  // Keeping the worked row makes a merge cheap; keeping the richer one makes
  // it lossy.
  if (lead.pipeline_stage && lead.pipeline_stage !== 'Lead') score += 100
  return score
}

/**
 * Pick the row to keep: richest first, oldest as the tie-break.
 *
 * Oldest rather than newest deliberately — the original row is the one other
 * tables (outreach events, drafts, video audits) are most likely to reference,
 * so keeping it minimises what a merge has to repoint.
 */
export function pickSurvivor(group: DedupeCandidate[]): DedupeCandidate {
  return [...group].sort((a, b) => {
    const r = richness(b) - richness(a)
    if (r !== 0) return r
    const at = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY
    const bt = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY
    if (at !== bt) return at - bt
    // Final tie-break on id so the choice is deterministic across runs —
    // a dry run must nominate the same survivor the live run will.
    return a.id < b.id ? -1 : 1
  })[0]
}

function buildGroups(
  leads: DedupeCandidate[],
  reason: DuplicateGroup['reason'],
  keyOf: (l: DedupeCandidate) => string,
): DuplicateGroup[] {
  const byKey = new Map<string, DedupeCandidate[]>()
  for (const lead of leads) {
    const key = keyOf(lead)
    if (!key) continue
    const list = byKey.get(key)
    if (list) list.push(lead)
    else byKey.set(key, [lead])
  }

  const groups: DuplicateGroup[] = []
  for (const [key, members] of byKey) {
    if (members.length < 2) continue
    const survivor = pickSurvivor(members)
    groups.push({
      reason,
      key,
      survivorId: survivor.id,
      duplicateIds: members.filter((m) => m.id !== survivor.id).map((m) => m.id),
      size: members.length,
    })
  }
  return groups.sort((a, b) => b.size - a.size)
}

/**
 * Rows that are the same business scraped twice. This is the signal safe to
 * merge on.
 */
export function findIdentityDuplicates(leads: DedupeCandidate[]): DuplicateGroup[] {
  return buildGroups(leads, 'identity', identityKey)
}

/**
 * Rows sharing a contact point. Reported for review, NOT auto-merged: a shared
 * number is as likely to be a chain's head office as a duplicate, and the
 * existing franchise migration already treats 3+ shared phones as a chain.
 */
export function findContactCollisions(leads: DedupeCandidate[]): DuplicateGroup[] {
  return [
    ...buildGroups(leads, 'phone', (l) => normalisePhone(l.phone)),
    ...buildGroups(leads, 'email', (l) => normaliseEmail(l.email)),
  ].sort((a, b) => b.size - a.size)
}

export type DedupeReport = {
  totalLeads: number
  identityGroups: DuplicateGroup[]
  contactCollisions: DuplicateGroup[]
  /** Rows that would be merged away if the identity groups were applied. */
  mergeableRows: number
  /** Distinct businesses left afterwards. */
  distinctAfterMerge: number
}

export function dedupeReport(leads: DedupeCandidate[]): DedupeReport {
  const identityGroups = findIdentityDuplicates(leads)
  const mergeableRows = identityGroups.reduce((n, g) => n + g.duplicateIds.length, 0)
  return {
    totalLeads: leads.length,
    identityGroups,
    contactCollisions: findContactCollisions(leads),
    mergeableRows,
    distinctAfterMerge: leads.length - mergeableRows,
  }
}
