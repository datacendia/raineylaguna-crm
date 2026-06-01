import type { Lead } from './types'

type MapLead = Pick<Lead, 'google_place_id' | 'name' | 'district' | 'address'>

// Shared query: prefer the stored address, else a name + district search.
function mapsQuery(lead: MapLead): string {
  return encodeURIComponent(
    (lead.address?.trim() || `${lead.name} ${lead.district ?? ''} Lima Peru`).trim(),
  )
}

// Plain Google Maps link — no API key, no usage charge. Uses the stored
// google_place_id for an exact pin, falling back to the text query.
export function googleMapsUrl(lead: MapLead): string {
  const url = `https://www.google.com/maps/search/?api=1&query=${mapsQuery(lead)}`
  return lead.google_place_id
    ? `${url}&query_place_id=${encodeURIComponent(lead.google_place_id)}`
    : url
}

// Keyless embeddable map iframe src (output=embed) — also free, no API key.
export function googleMapsEmbedUrl(lead: MapLead): string {
  return `https://maps.google.com/maps?q=${mapsQuery(lead)}&z=16&hl=es&output=embed`
}
