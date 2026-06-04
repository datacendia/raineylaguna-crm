import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { templatesFor, SCRIPT_TEMPLATES } from '@/lib/scripts'
import { businessHourSlot } from '@/lib/schedule'
import { dedupeByDestination } from '@/lib/outreach-dedupe'
import type { Lead } from '@/lib/types'

/**
 * Schedule a batch outreach campaign.
 * Body: {
 *   lead_ids: string[]
 *   template_id: string
 *   per_day: number       // throttle e.g. 20/day
 *   start_at?: string     // ISO timestamp
 * }
 *
 * Spreads sends across Lima business hours, stamping each as a Pending
 * crm_outreach_event. The outreach-drain cron (scripts/outreach-drain.ts) then
 * delivers each event once its scheduled_for time arrives.
 */
export async function POST(request: NextRequest) {
  try {
    const { lead_ids, template_id, per_day = 20, start_at } = await request.json()
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: 'No leads' }, { status: 400 })
    }
    const tpl = SCRIPT_TEMPLATES.find((t) => t.id === template_id)
    if (!tpl) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })

    const base = start_at ? new Date(start_at) : new Date()
    const { rows } = await pool.query<Lead>(
      'SELECT * FROM crm_leads WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
      [lead_ids]
    )

    // Only leads the chosen template actually matches.
    const eligible = rows.filter((lead) => templatesFor(lead).find((t) => t.id === template_id))
    // Collapse multiple locations of one company (same email / phone) to a
    // single message, so a batch never hits one corporate inbox N times.
    const { keep, skipped } = dedupeByDestination(eligible, tpl.channel)

    let scheduled = 0
    for (const lead of keep) {
      // Spread sends evenly across Lima business hours (09:00–18:00), with
      // `per_day` messages per day. `scheduled` is the running slot index.
      const scheduledFor = businessHourSlot(base, scheduled, per_day)

      const body = tpl.render(lead)
      const subject = tpl.channel === 'Email' ? tpl.subject?.(lead) ?? null : null
      await pool.query(
        `INSERT INTO crm_outreach_events (lead_id, channel, status, scheduled_for, notes, subject)
         VALUES ($1, $2, 'Pending', $3, $4, $5)`,
        [lead.id, tpl.channel, scheduledFor, body, subject]
      )
      scheduled++
    }

    return NextResponse.json({ scheduled, skippedDuplicates: skipped.length })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to schedule batch' }, { status: 500 })
  }
}
