/**
 * Shared generation logic for AI-drafted outreach.
 *
 * Both the on-demand `/api/leads/[id]/draft-outreach` route (ROADMAP item 12)
 * and the Mon/Wed/Fri cron `scripts/draft-outreach-cron.ts` (ROADMAP item 10)
 * import `generateDraftForLead` so the prompt stays single-source.
 *
 * Bumping the prompt: change PROMPT_VERSION + SYSTEM_PROMPT here. The version
 * is persisted per draft (`crm_outreach_drafts.prompt_version`) so you can A/B
 * send-through rates across versions later.
 */

import type { Pool } from 'pg'
import { complete } from './anthropic'

export const PROMPT_VERSION = 'v1-2026-05-06'

const SYSTEM_PROMPT = `You are a senior B2B copywriter for Rainey Laguna, a boutique web-development studio in Lima, Peru. You write the first WhatsApp message a sales rep sends to a Peruvian small-business owner who has never heard of us.

Constraints:
- Spanish (Peruvian register, neutral). Voseo NEVER. Use tú.
- 2 short paragraphs, max 90 words total.
- One concrete observation about THEIR business (district, niche, website status, evaluation, or strategic action — whichever is most specific). NEVER invent facts not present in the brief.
- One specific, low-friction next step (e.g., "te mando un Loom de 90 segundos con dos cambios concretos").
- No emojis. No exclamation marks beyond the greeting. No "espero que te encuentres bien".
- Sign off as "— Equipo Rainey Laguna" on its own line.
- Output ONLY the message body. No preface, no headers, no quotes.`

function buildUserPrompt(lead: Record<string, unknown>): string {
  const lines: string[] = []
  const push = (label: string, val: unknown) => {
    if (val === null || val === undefined || val === '') return
    lines.push(`- ${label}: ${String(val)}`)
  }
  push('Nombre del contacto', lead.name)
  push('Distrito', lead.district)
  push('Nicho', lead.niche)
  push('Categoría', lead.category)
  push('Website', lead.website_url)
  push('Estado del website', lead.website_status)
  push('Evaluación', lead.evaluation)
  push('Acción estratégica sugerida', lead.strategic_action)
  push('Potencial', lead.potential)
  push('Instagram activo', lead.instagram_active)
  push('Notas internas', lead.notes)
  return `Datos del prospecto:\n${lines.join('\n')}\n\nEscribe el primer mensaje de WhatsApp.`
}

/**
 * Generate a draft and INSERT it into crm_outreach_drafts. Returns the new row.
 * Caller is responsible for checking that generation should happen (e.g. cron
 * eligibility gates); this function always generates and inserts.
 */
export async function generateDraftForLead(
  pool: Pool,
  lead: Record<string, unknown> & { id: string }
) {
  const { text, model } = await complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(lead),
  })
  const insert = await pool.query(
    `INSERT INTO crm_outreach_drafts
       (lead_id, channel, body, model, prompt_version, status)
     VALUES ($1, 'WhatsApp', $2, $3, $4, 'pending')
     RETURNING *`,
    [lead.id, text, model, PROMPT_VERSION]
  )
  return insert.rows[0]
}
