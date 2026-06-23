import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { Lead } from '@/lib/types'
import { computePriorityScore } from '@/lib/priority-score'
import { buildPitchAngle } from '@/lib/pitch-angle'

/**
 * Analytics aggregation endpoint. Every figure is computed in SQL (fast even on
 * tens of thousands of rows), except the Opportunity Radar, which scores a
 * bounded candidate pool in JS so it can reuse the exact priority model and the
 * deterministic Pitch Angle engine.
 *
 * Chains/franchises and soft-deleted rows are excluded from the "addressable"
 * figures, matching the honest counting used elsewhere in the CRM.
 */

// Human labels for the most common audit flags (the stored per-lead label can
// include lead-specific detail like "Slow load (LCP 5.2s)").
const FLAG_LABELS: Record<string, string> = {
  no_website: 'No website at all',
  social_only: 'Social page only',
  site_unreachable: 'Website unreachable',
  no_https: 'No HTTPS / not secure',
  not_mobile: 'Not mobile-friendly',
  slow_lcp: 'Slow load (LCP)',
  poor_performance: 'Poor performance',
  weak_seo: 'Weak SEO',
  stale: 'Outdated / stale',
  weak_accessibility: 'Accessibility issues',
  no_structured_data: 'No social preview tags',
  no_analytics: 'No analytics installed',
}

export async function GET() {
  try {
    const [totals, stageRows, healthRow, contactRow, cityRows, nicheRows, sourceRows, flagRows, candidates] =
      await Promise.all([
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE COALESCE(is_chain,false)=false)::int AS addressable,
            COUNT(*) FILTER (WHERE audit_findings IS NOT NULL)::int AS audited
          FROM crm_leads WHERE deleted_at IS NULL
        `),
        pool.query(`
          SELECT pipeline_stage, COUNT(*)::int AS count
          FROM crm_leads WHERE deleted_at IS NULL
          GROUP BY pipeline_stage
        `),
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE digital_health_score IS NULL)::int AS unscored,
            COUNT(*) FILTER (WHERE digital_health_score BETWEEN 0 AND 20)::int AS b0,
            COUNT(*) FILTER (WHERE digital_health_score BETWEEN 21 AND 40)::int AS b1,
            COUNT(*) FILTER (WHERE digital_health_score BETWEEN 41 AND 60)::int AS b2,
            COUNT(*) FILTER (WHERE digital_health_score BETWEEN 61 AND 80)::int AS b3,
            COUNT(*) FILTER (WHERE digital_health_score BETWEEN 81 AND 100)::int AS b4
          FROM crm_leads WHERE deleted_at IS NULL
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE email IS NOT NULL AND email <> '')::int AS with_email,
            COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int AS with_phone,
            COUNT(*) FILTER (WHERE instagram_url IS NOT NULL)::int AS with_instagram,
            COUNT(*) FILTER (WHERE
              (email IS NOT NULL AND email <> '') OR (phone IS NOT NULL AND phone <> '')
              OR instagram_url IS NOT NULL OR facebook_url IS NOT NULL
              OR linkedin_url IS NOT NULL OR tiktok_url IS NOT NULL
            )::int AS reachable_any
          FROM crm_leads WHERE deleted_at IS NULL AND COALESCE(is_chain,false)=false
        `),
        pool.query(`
          SELECT city,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE COALESCE(is_chain,false)=false)::int AS addressable,
            COUNT(*) FILTER (WHERE audit_findings IS NOT NULL)::int AS audited,
            ROUND(AVG(digital_health_score) FILTER (WHERE digital_health_score IS NOT NULL))::int AS avg_health
          FROM crm_leads WHERE deleted_at IS NULL
          GROUP BY city ORDER BY total DESC
        `),
        pool.query(`
          SELECT niche,
            COUNT(*)::int AS total,
            ROUND(AVG(digital_health_score) FILTER (WHERE digital_health_score IS NOT NULL))::int AS avg_health
          FROM crm_leads WHERE deleted_at IS NULL AND COALESCE(is_chain,false)=false
          GROUP BY niche ORDER BY total DESC
        `),
        pool.query(`
          SELECT COALESCE(source,'(unknown)') AS source, COUNT(*)::int AS count
          FROM crm_leads WHERE deleted_at IS NULL
          GROUP BY source ORDER BY count DESC
        `),
        pool.query(`
          SELECT f->>'id' AS id,
                 mode() WITHIN GROUP (ORDER BY f->>'severity') AS severity,
                 COUNT(*)::int AS count
          FROM crm_leads,
            LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(audit_findings->'flags') = 'array'
                   THEN audit_findings->'flags' ELSE '[]'::jsonb END
            ) AS f
          WHERE deleted_at IS NULL AND COALESCE(is_chain,false)=false
          GROUP BY f->>'id' ORDER BY count DESC LIMIT 12
        `),
        // Opportunity Radar candidate pool: untouched, reachable, independent
        // leads with the lowest digital health (biggest sales gap). Scored
        // precisely in JS below, so we pull a generous pool and trim to top N.
        pool.query<Lead>(`
          SELECT * FROM crm_leads
          WHERE deleted_at IS NULL
            AND pipeline_stage = 'Lead'
            AND COALESCE(is_chain,false)=false
            AND (snoozed_until IS NULL OR snoozed_until <= now())
            AND audit_findings IS NOT NULL
            AND ((phone IS NOT NULL AND phone <> '') OR (email IS NOT NULL AND email <> '') OR instagram_url IS NOT NULL)
          ORDER BY digital_health_score ASC NULLS LAST, created_at DESC
          LIMIT 200
        `),
      ])

    const stage: Record<string, number> = { Lead: 0, Contacted: 0, Audited: 0, Proposal: 0, Closed: 0 }
    for (const r of stageRows.rows) stage[r.pipeline_stage] = r.count

    const h = healthRow.rows[0]
    const health = {
      unscored: h.unscored,
      buckets: [
        { label: '0–20 (critical)', count: h.b0 },
        { label: '21–40', count: h.b1 },
        { label: '41–60', count: h.b2 },
        { label: '61–80', count: h.b3 },
        { label: '81–100 (healthy)', count: h.b4 },
      ],
    }

    const topFlags = flagRows.rows.map((r) => ({
      id: r.id,
      label: FLAG_LABELS[r.id] ?? r.id,
      severity: r.severity as string,
      count: r.count,
    }))

    // Score + pitch-angle the candidate pool, then keep the highest-priority 12.
    const now = new Date()
    const opportunities = candidates.rows
      .map((lead) => {
        const ps = computePriorityScore(lead, now)
        const pitch = buildPitchAngle(lead)
        return {
          id: lead.id,
          name: lead.name,
          city: lead.city,
          district: lead.district,
          niche: lead.niche,
          score: ps.score,
          band: ps.band,
          health: lead.digital_health_score,
          opening: pitch.opening,
          headline: pitch.headline,
          talkingPoints: pitch.talkingPoints,
          locale: pitch.locale,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)

    return NextResponse.json({
      totals: totals.rows[0],
      contactability: contactRow.rows[0],
      stage,
      health,
      byCity: cityRows.rows,
      byNiche: nicheRows.rows,
      bySource: sourceRows.rows,
      topFlags,
      opportunities,
    })
  } catch (error) {
    console.error('[analytics] failed', error)
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 })
  }
}
