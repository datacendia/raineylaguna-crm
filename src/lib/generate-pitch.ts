/**
 * On-demand AI pitch-demo generator.
 *
 * Given a lead, produces ONE self-contained HTML document — a branded demo /
 * mockup tailored to the lead's `potential` (service type) — plus a small
 * internal "brief" panel (what they'll need + 1-2 innovations). Persists it to
 * crm_lead_pitches and returns the row.
 *
 * Mirrors the draft-outreach pattern (src/lib/draft-outreach.ts): single-source
 * prompt + version, raw Anthropic call via src/lib/anthropic.ts, one INSERT.
 *
 * Cost note: full HTML is ~3-8k output tokens per call, so generation is
 * on-demand only (operator clicks a button) — never run in a loop/cron.
 */

import type { Pool } from 'pg'
import type { AuditFindings } from './types'
import { complete } from './anthropic'
import { mapPotentialToService, SERVICES, type Service } from './services-map'

export const PITCH_PROMPT_VERSION = 'pitch-v1-2026-06-02'

/** Generous cap — a full one-page HTML mockup needs room. */
const MAX_TOKENS = 8000

const SYSTEM_PROMPT = `You are a senior front-end designer at Rainey Laguna, a boutique web studio in Lima, Peru. You produce a single, self-contained HTML document: a tailored DEMO/mockup for a prospective client, to be shown by a sales rep in a pitch.

Hard output rules:
- Output ONLY the HTML document, starting with <!doctype html>. No markdown, no code fences, no commentary before or after.
- Everything inline in ONE file: inline <style> only, no JavaScript, no external resources whatsoever (no <script>, no external CSS/fonts/CDNs, no remote <img>; use a system font stack and CSS-drawn shapes/gradients instead of images).
- Responsive and mobile-first. Clean, elegant, lots of whitespace. Print-safe.

Brand system (use it precisely):
- iron #0E0D0B (near-black text/ink), bone #F6F2E8 (warm off-white background), vermilion #E83C1E (single accent — CTAs, highlights), oxide #8AA9A0 (muted secondary).
- Tone: calm, confident, "hacemos pocas cosas, bien". Peruvian Spanish (neutral, tú). Bilingual touches (ES/EN) are welcome where natural.

Content rules:
- Use the prospect's REAL business name, district and niche. Write copy that fits their niche.
- Representative product/menu/service items typical for the niche are encouraged (that is the point of the demo). Keep example prices clearly illustrative or omit them.
- NEVER invent real contact details (phone, email, address) or fabricate specific statistics, review counts, or named testimonials. Generic, unnumbered social proof is fine.
- End the document with a clearly separated internal panel titled "Rainey Laguna · Brief interno". Start it with the opportunity label (the Potential value, verbatim — e.g. "Full Web Build") as a small heading, followed by ONE plain-language sentence describing what that build delivers. Then two short lists: "Lo que necesitará" (3-5 bullets) and "Innovaciones propuestas" (1-2 bullets, concrete and tasteful). Style the whole panel subtly (oxide border, small text) so it reads as an internal annotation, not part of the public mockup.`

interface PitchBrief {
  /** Short label of the artifact, for logs/UI. */
  kind: string
  /** Spanish instruction describing exactly what to build. */
  instruction: string
}

/**
 * Choose the artifact shape from the potential text (what the operator keyed
 * on), falling back to a full homepage. Diacritic-insensitive substring match.
 */
function pitchBrief(potential: string | null | undefined): PitchBrief {
  const p = (potential ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const has = (...kw: string[]) => kw.some((k) => p.includes(k))

  if (has('catalog', 'catalogo', 'menu', 'carta', 'tienda', 'store', 'commerce')) {
    return {
      kind: 'catalog',
      instruction:
        'Construye una página de catálogo de UNA sola pantalla (one-pager): encabezado con el nombre del negocio, y una cuadrícula elegante de 6 a 9 productos/ítems representativos del rubro (nombre, breve descripción y precio ilustrativo). Incluye un CTA de pedido por WhatsApp (visual, sin enlazar).',
    }
  }
  if (has('portal')) {
    return {
      kind: 'portal',
      instruction:
        'Construye la maqueta de un portal de cliente: cabecera con acceso, y un panel con 3-4 tarjetas de acción del rubro (p. ej. reservas, estado de pedido, pagos, documentos). Solo visual, sin lógica.',
    }
  }
  if (has('portfolio', 'portafolio')) {
    return {
      kind: 'portfolio',
      instruction:
        'Construye un portafolio de una página: encabezado, grilla de 4-6 proyectos/trabajos de ejemplo propios del rubro (con título y una línea), y una sección de contacto (visual).',
    }
  }
  if (has('landing', 'lead gen', 'leadgen')) {
    return {
      kind: 'landing',
      instruction:
        'Construye una landing de captación: hero con propuesta de valor clara, tres beneficios, un formulario de contacto (visual, sin enviar) y prueba social genérica sin cifras.',
    }
  }
  if (has('brand', 'marca', 'identity', 'identidad', 'logo')) {
    return {
      kind: 'brand',
      instruction:
        'Construye un mini brand board: logotipo tipográfico con el nombre del negocio, paleta de color propuesta (muestras), muestra tipográfica (titular + cuerpo) y una pequeña aplicación (p. ej. tarjeta o cabecera).',
    }
  }
  return {
    kind: 'homepage',
    instruction:
      'Construye una página de inicio (homepage) completa de una sola pantalla: hero con el nombre del negocio y una propuesta de valor, navegación simple, una sección de servicios/productos del rubro (3-4 ítems), una franja de confianza y un CTA de reserva/pedido/contacto (visual).',
  }
}

function buildUserPrompt(lead: Record<string, unknown>, service: Service, brief: PitchBrief): string {
  const lines: string[] = []
  const push = (label: string, val: unknown) => {
    if (val === null || val === undefined || val === '') return
    lines.push(`- ${label}: ${String(val)}`)
  }
  push('Negocio', lead.name)
  push('Distrito', lead.district)
  push('Nicho', lead.niche)
  push('Categoría', lead.category)
  push('Website actual', lead.website_url)
  push('Estado del website', lead.website_status)
  const audit = lead.audit_findings as AuditFindings | null
  push('Resumen de auditoría', audit?.summary)
  if (audit?.flags?.length) {
    push('Problemas detectados', audit.flags.map((f) => f.label).join('; '))
  }
  push('Oportunidad (Potential)', lead.potential)

  return [
    'Datos del prospecto:',
    lines.join('\n'),
    '',
    `Servicio de Rainey Laguna a presentar: ${service.name} — ${service.blurb}`,
    '',
    `Artefacto a construir (${brief.kind}): ${brief.instruction}`,
    '',
    'Genera ahora el documento HTML completo y autocontenido.',
  ].join('\n')
}

/** Strip accidental markdown code fences and leading prose. */
function cleanHtml(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
  }
  const i = s.toLowerCase().indexOf('<!doctype')
  const j = i === -1 ? s.toLowerCase().indexOf('<html') : i
  if (j > 0) s = s.slice(j)
  return s.trim()
}

export interface PitchRow {
  id: string
  lead_id: string
  potential: string | null
  service_key: string | null
  service_url: string | null
  html: string
  model: string | null
  prompt_version: string | null
  created_at: string
}

/**
 * Generate a pitch demo and INSERT it into crm_lead_pitches. Always generates;
 * the caller is responsible for gating (e.g. an explicit operator click).
 */
export async function generatePitchForLead(
  pool: Pool,
  lead: Record<string, unknown> & { id: string; potential?: string | null },
): Promise<PitchRow> {
  const auditForSite = lead.audit_findings as AuditFindings | null
  const hasSite =
    Boolean(lead.website_url) || auditForSite?.reachable === true || auditForSite?.hadSite === true
  const service = mapPotentialToService(lead.potential, { hasSite }) ?? SERVICES.websites
  const brief = pitchBrief(lead.potential)

  const { text, model } = await complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(lead, service, brief),
    max_tokens: MAX_TOKENS,
  })

  const html = cleanHtml(text)
  if (!html.toLowerCase().includes('<html') && !html.toLowerCase().includes('<!doctype')) {
    throw new Error('model did not return an HTML document')
  }

  const insert = await pool.query<PitchRow>(
    `INSERT INTO crm_lead_pitches
       (lead_id, potential, service_key, service_url, html, model, prompt_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      lead.id,
      (lead.potential as string | null) ?? null,
      service.key,
      service.url,
      html,
      model,
      PITCH_PROMPT_VERSION,
    ],
  )
  return insert.rows[0]
}
