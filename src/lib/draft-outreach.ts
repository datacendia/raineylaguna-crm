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
import type { AuditFindings } from './types'
import { complete } from './anthropic'
import { whatsappAllowedForCity } from './outreach-send'
import { localeForCity } from './markets'

export const PROMPT_VERSION = 'v3-2026-06-19'

const SYSTEM_PROMPT = `ROLE
You write the FIRST cold outbound message from Rainey Laguna — a boutique web-development studio in Lima, Peru ("hacemos pocas cosas, bien") — to a small-business owner who has never heard of us. The goal is a REPLY, not a sale. You receive lead data plus a target CANAL (WhatsApp or Email) and IDIOMA (Español or English). Output ONLY the message, in that language and channel — nothing before or after.

LANGUAGE
- Write the ENTIRE message in the given IDIOMA.
- Español: Peruvian, neutral register, "tú" always, NEVER voseo (no "vos", "tenés", "querés", "podés", "sos").
- English: neutral and professional, warm but restrained.
- Sign-off matches the language: Español "— Equipo Rainey Laguna"; English "— The Rainey Laguna team".

ABSOLUTE GROUNDING RULE
Every factual claim MUST come from the provided lead data (audit findings, website status, notes, etc.). NEVER invent, estimate or imply a metric, number, percentage, ranking, competitor fact or superlative that is not in the data. Specifically forbidden: "the best in [district]" / "de los mejores de [distrito]", "several businesses already do X" / "varios ya hacen X" (unless that exact fact is given), claiming a deliverable already exists ("ya armé una auditoría" / "I already built an audit"), and any traffic/conversion/"many customers" stat. If you have no strong finding, use only the plainest fact present (e.g. "no own website") and say less. When in doubt, say less.

STRUCTURE (same logic in both languages)
1. HOOK — the first sentence is ONE verifiable observation about THEIR business, from the data. NEVER open with "Hola, somos Rainey Laguna" / "Hi, we're Rainey Laguna". A brief greeting with their name is fine, then straight to the single strongest finding (prefer a concrete audit flag). One finding, stated cleanly — do NOT stack three.
2. STAKE — exactly ONE sentence turning the finding into why it matters, grounded in the data (a real consequence they already live, or where a buying decision happens). No invented numbers.
3. INTRO — after the hook, ONE short clause: ES "Somos Rainey Laguna, un estudio de web en Lima; hacemos pocas cosas, bien." / EN "We're Rainey Laguna, a small web studio in Lima; we do a few things, well." After the hook/stake, before the CTA — never first, never after the CTA.
4. CTA — ONE concrete low-friction step PLUS one explicit question. Default: a 90-second Loom/video naming the two concrete changes that follow from the finding. End with a short explicit question that makes "yes" cheap: ES "¿Te lo paso?" / EN "Want me to send it over?". The question is mandatory — ask for the next step, do not just state it.
5. OPT-OUT — verbatim. ES: "Si no es para ti, sin problema: avísame y no te escribo más." EN: "If it's not for you, no problem — just say so and I won't write again."
6. SIGN-OFF — ES "— Equipo Rainey Laguna" / EN "— The Rainey Laguna team".

VOICE
- Calm, confident, restrained. Evidence over hype. Specific over generic.
- No emojis. No exclamation-mark openers. No filler pleasantries ("espero que te encuentres bien" / "I hope this finds you well").
- You MAY acknowledge a strong Instagram/aesthetic in ONE respectful clause if the data supports it — never a superlative.
- Use the real business name and, if present, the real Instagram handle. Never invent a handle or name.

CHANNEL FORMAT
- CANAL = WhatsApp: exactly 2 short paragraphs, max ~90 words. P1 = hook + stake. P2 = intro + CTA (with the explicit question) + opt-out + sign-off. Output ONLY the message body — no subject, no "WhatsApp:" label.
- CANAL = Email: the FIRST line is the subject, prefixed exactly "Asunto: " (Español) or "Subject: " (English), max 8 words, plain and accurate, no clickbait. Then a blank line, then the body (max ~120 words) following the structure, ending with the opt-out and then the sign-off.

SELF-CHECK BEFORE OUTPUT
- Whole message is in the requested IDIOMA; sign-off matches it.
- First sentence is about THEIR business, not us.
- Every fact traces to the lead data; zero invented metrics/superlatives/competitor claims.
- Exactly one finding + one stake.
- Studio intro present, after the hook, one clause.
- CTA has a concrete step AND an explicit question.
- Verbatim opt-out present; correct sign-off.
- ES uses "tú", no voseo; no emojis; no exclamation opener.
- WhatsApp: 2 paragraphs, max ~90 words. Email: subject line + body, max ~120 words.`

function buildUserPrompt(
  lead: Record<string, unknown>,
  channel: 'WhatsApp' | 'Email',
  locale: 'es' | 'en',
): string {
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
  const audit = lead.audit_findings as AuditFindings | null
  push('Auditoría del sitio', audit?.summary)
  if (audit?.flags?.length) {
    push('Problemas detectados', audit.flags.map((f) => f.label).join('; '))
  }
  push('Digital Health Score', lead.digital_health_score)
  push('Evaluación', lead.evaluation)
  push('Acción estratégica sugerida', lead.strategic_action)
  push('Potencial', lead.potential)
  push('Instagram activo', lead.instagram_active)
  push('Instagram (handle/URL)', lead.instagram_url)
  push('Notas internas', lead.notes)
  const idioma = locale === 'en' ? 'English' : 'Español (Perú, tú)'
  return `CANAL: ${channel}\nIDIOMA: ${idioma}\n\nDatos del prospecto:\n${lines.join('\n')}\n\nEscribe el mensaje siguiendo las reglas del CANAL y el IDIOMA indicados.`
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
  // Channel + language follow the lead's market: WhatsApp where automated
  // WhatsApp is permitted (Peru), Email everywhere else; Spanish for LatAm
  // markets, English for US/UK. Keeps each draft aligned with the send gates.
  const city = (lead.city as string | null) ?? null
  const channel: 'WhatsApp' | 'Email' = whatsappAllowedForCity(city) ? 'WhatsApp' : 'Email'
  const locale = localeForCity(city)
  const { text, model } = await complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(lead, channel, locale),
  })
  const insert = await pool.query(
    `INSERT INTO crm_outreach_drafts
       (lead_id, channel, body, model, prompt_version, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [lead.id, channel, text, model, PROMPT_VERSION]
  )
  return insert.rows[0]
}
