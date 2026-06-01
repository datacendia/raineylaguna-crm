import type { Lead } from './types'

// Builds a plain Google Maps URL for a lead — no API key, no usage charge.
// Prefers the stored google_place_id for an exact pin, and falls back to a
// name + district text search for the handful of leads without one.
export function googleMapsUrl(
  lead: Pick<Lead, 'google_place_id' | 'name' | 'district' | 'address'>,
): string {
  const q = encodeURIComponent(
    (lead.address?.trim() || `${lead.name} ${lead.district ?? ''} Lima Peru`).trim(),
  )
  const url = `https://www.google.com/maps/search/?api=1&query=${q}`
  return lead.google_place_id
    ? `${url}&query_place_id=${encodeURIComponent(lead.google_place_id)}`
    : url
}
