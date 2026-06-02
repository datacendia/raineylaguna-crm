/**
 * Monday digest data + email rendering.
 *
 * Extracted from the digest page so the page (interactive HTML) and the
 * digest-email cron (scripts/digest-email-cron.ts) share one source of truth
 * for the weekly numbers. Pure-ish: takes a pg Pool, returns plain data.
 *
 * All lead-facing queries exclude soft-deleted leads.
 */
import type { Pool } from 'pg'

export type DigestCounts = {
  added: number
  outreach: number
  wins: number
  proposals_out: number
}

export type DigestLead = {
  id: string
  name: string
  district: string
  niche: string
  potential: string | null
  pipeline_stage: string
  notes: string | null
  last_outreach_at: string | null
  days_since_outreach: number | null
}

export type DigestChannelCount = { channel: string; n: number }
export type DigestWin = { id: string; name: string; district: string; updated_at: string }

export type DigestData = {
  counts: DigestCounts
  cold: DigestLead[]
  topPotential: DigestLead[]
  channels: DigestChannelCount[]
  wins: DigestWin[]
}

export async function loadDigest(pool: Pool): Promise<DigestData> {
  // "This week" = since the most recent Monday 00:00 in Lima time.
  const sinceMon = `date_trunc('week', NOW() AT TIME ZONE 'America/Lima')`

  const [counts, cold, topPotential, channels, wins] = await Promise.all([
    pool.query<DigestCounts>(
      `SELECT
         (SELECT COUNT(*)::int FROM crm_leads WHERE deleted_at IS NULL AND created_at >= ${sinceMon}) AS added,
         (SELECT COUNT(*)::int FROM crm_outreach_events WHERE created_at >= ${sinceMon}) AS outreach,
         (SELECT COUNT(*)::int FROM crm_leads WHERE deleted_at IS NULL AND pipeline_stage = 'Closed' AND updated_at >= ${sinceMon}) AS wins,
         (SELECT COUNT(*)::int FROM crm_leads WHERE deleted_at IS NULL AND pipeline_stage = 'Proposal') AS proposals_out`,
    ),
    pool.query<DigestLead>(
      `WITH last_out AS (
         SELECT lead_id, MAX(created_at) AS last_at
         FROM crm_outreach_events
         GROUP BY lead_id
       )
       SELECT l.id, l.name, l.district, l.niche, l.potential, l.pipeline_stage, l.notes,
              lo.last_at::text AS last_outreach_at,
              EXTRACT(DAY FROM NOW() - lo.last_at)::int AS days_since_outreach
       FROM crm_leads l
       LEFT JOIN last_out lo ON lo.lead_id = l.id
       WHERE l.deleted_at IS NULL
         AND l.pipeline_stage IN ('Contacted', 'Audited', 'Proposal')
         AND (lo.last_at IS NULL OR lo.last_at < NOW() - INTERVAL '14 days')
       ORDER BY lo.last_at NULLS FIRST
       LIMIT 10`,
    ),
    pool.query<DigestLead>(
      `SELECT id, name, district, niche, potential, pipeline_stage, notes,
              NULL::text AS last_outreach_at, NULL::int AS days_since_outreach
       FROM crm_leads
       WHERE deleted_at IS NULL
         AND pipeline_stage = 'Lead'
         AND id NOT IN (SELECT DISTINCT lead_id FROM crm_outreach_events)
         AND potential IS NOT NULL
       ORDER BY
         CASE potential
           WHEN 'High' THEN 1 WHEN 'Alta' THEN 1
           WHEN 'Medium' THEN 2 WHEN 'Media' THEN 2
           ELSE 3
         END,
         created_at ASC
       LIMIT 10`,
    ),
    pool.query<DigestChannelCount>(
      `SELECT channel::text, COUNT(*)::int AS n
       FROM crm_outreach_events
       WHERE created_at >= ${sinceMon}
       GROUP BY channel
       ORDER BY n DESC`,
    ),
    pool.query<DigestWin>(
      `SELECT id, name, district, updated_at::text
       FROM crm_leads
       WHERE deleted_at IS NULL AND pipeline_stage = 'Closed' AND updated_at >= ${sinceMon}
       ORDER BY updated_at DESC`,
    ),
  ])

  return {
    counts: counts.rows[0] ?? { added: 0, outreach: 0, wins: 0, proposals_out: 0 },
    cold: cold.rows,
    topPotential: topPotential.rows,
    channels: channels.rows,
    wins: wins.rows,
  }
}

const esc = (s: string | null | undefined): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string
  ))

/** Minimal, email-client-safe HTML (inline styles, no external CSS). */
export function renderDigestHtml(data: DigestData, baseUrl?: string): string {
  const { counts, cold, topPotential, channels, wins } = data
  const link = (id: string, name: string) =>
    baseUrl ? `<a href="${baseUrl}/dashboard/leads/${id}">${esc(name)}</a>` : esc(name)

  const stat = (label: string, value: number) =>
    `<td style="padding:12px 16px;border:1px solid #eee;text-align:center">
       <div style="font-size:28px;font-weight:700">${value}</div>
       <div style="font-size:11px;text-transform:uppercase;color:#888">${label}</div>
     </td>`

  const leadRows = (leads: DigestLead[], showDays: boolean) =>
    leads
      .map(
        (l) => `<tr>
          <td style="padding:6px 10px;border-top:1px solid #eee">${link(l.id, l.name)}</td>
          <td style="padding:6px 10px;border-top:1px solid #eee;color:#666">${esc(l.district)}</td>
          <td style="padding:6px 10px;border-top:1px solid #eee;color:#666">${esc(l.niche)}</td>
          <td style="padding:6px 10px;border-top:1px solid #eee;color:#666">${esc(l.pipeline_stage)}</td>
          ${showDays ? `<td style="padding:6px 10px;border-top:1px solid #eee;color:#666">${l.days_since_outreach == null ? '—' : `${l.days_since_outreach}d`}</td>` : ''}
        </tr>`,
      )
      .join('')

  const section = (title: string, inner: string) =>
    `<h2 style="font-size:18px;margin:28px 0 8px">${title}</h2>${inner}`

  return `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;max-width:720px;margin:0 auto;padding:16px">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888">Monday digest · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <h1 style="font-size:26px;margin:4px 0 16px">This week at Rainey Laguna</h1>
    <table style="border-collapse:collapse;width:100%"><tr>
      ${stat('Added', counts.added)}${stat('Outreach', counts.outreach)}${stat('Proposals out', counts.proposals_out)}${stat('Wins', counts.wins)}
    </tr></table>
    ${section('Outreach by channel', channels.length ? channels.map((c) => `<span style="display:inline-block;border:1px solid #eee;border-radius:8px;padding:6px 12px;margin:0 6px 6px 0"><b>${c.n}</b> ${esc(c.channel)}</span>`).join('') : '<p style="color:#888">No outreach logged this week.</p>')}
    ${wins.length ? section('🏆 Closed this week', `<ul>${wins.map((w) => `<li>${link(w.id, w.name)} · ${esc(w.district)}</li>`).join('')}</ul>`) : ''}
    ${section('🥶 Going cold (14+ days)', cold.length ? `<table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="text-align:left;color:#888;font-size:11px;text-transform:uppercase"><th style="padding:6px 10px">Name</th><th style="padding:6px 10px">District</th><th style="padding:6px 10px">Niche</th><th style="padding:6px 10px">Stage</th><th style="padding:6px 10px">Days</th></tr>${leadRows(cold, true)}</table>` : '<p style="color:#888">All active leads are warm.</p>')}
    ${section('🎯 High-potential, not yet contacted', topPotential.length ? `<table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="text-align:left;color:#888;font-size:11px;text-transform:uppercase"><th style="padding:6px 10px">Name</th><th style="padding:6px 10px">District</th><th style="padding:6px 10px">Niche</th><th style="padding:6px 10px">Stage</th></tr>${leadRows(topPotential, false)}</table>` : '<p style="color:#888">All high-potential leads contacted.</p>')}
  </body></html>`
}
