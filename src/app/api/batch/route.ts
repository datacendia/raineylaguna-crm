import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOutreachQueue } from '@/lib/queue'
import { templatesFor, SCRIPT_TEMPLATES } from '@/lib/scripts'
import type { Lead } from '@/lib/types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Schedule a batch outreach campaign.
 * Body: {
 *   lead_ids: string[]
 *   template_id: string
 *   per_day: number       // throttle e.g. 20/day
 *   start_at?: string     // ISO timestamp
 * }
 *
 * Spreads jobs across days, stamping each as a pending crm_outreach_event,
 * and enqueues a BullMQ job for the worker (which will later send / remind).
 */
export async function POST(request: NextRequest) {
  try {
    const { lead_ids, template_id, per_day = 20, start_at } = await request.json()
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: 'No leads' }, { status: 400 })
    }
    const tpl = SCRIPT_TEMPLATES.find((t) => t.id === template_id)
    if (!tpl) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })

    // Queue is lazily constructed so the rest of the app boots even when
    // Redis isn't configured. Surface a clear 503 here if so.
    const outreachQueue = getOutreachQueue()
    if (!outreachQueue) {
      return NextResponse.json(
        { error: 'Outreach queue unavailable: REDIS_URL is not configured.' },
        { status: 503 },
      )
    }

    const baseTime = start_at ? new Date(start_at).getTime() : Date.now()
    const { rows } = await pool.query<Lead>(
      'SELECT * FROM crm_leads WHERE id = ANY($1::uuid[])',
      [lead_ids]
    )

    let scheduled = 0
    for (let i = 0; i < rows.length; i++) {
      const lead = rows[i]
      if (!templatesFor(lead).find((t) => t.id === template_id)) continue
      const dayOffset = Math.floor(i / per_day)
      const slotInDay = i % per_day
      const scheduledFor = new Date(baseTime + dayOffset * DAY_MS + slotInDay * 60_000)

      const body = tpl.render(lead)
      const insert = await pool.query(
        `INSERT INTO crm_outreach_events (lead_id, channel, status, scheduled_for, notes)
         VALUES ($1, $2, 'Pending', $3, $4) RETURNING id`,
        [lead.id, tpl.channel, scheduledFor, body]
      )
      const eventId = insert.rows[0].id
      await outreachQueue.add(
        'send',
        { lead_id: lead.id, channel: tpl.channel, body, template_id: tpl.id },
        {
          delay: Math.max(0, scheduledFor.getTime() - Date.now()),
          jobId: eventId,
          removeOnComplete: 1000,
          removeOnFail: 1000,
        }
      )
      scheduled++
    }

    return NextResponse.json({ scheduled })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to schedule batch' }, { status: 500 })
  }
}
