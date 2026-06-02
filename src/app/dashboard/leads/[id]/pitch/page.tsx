/**
 * Pitch demo viewer for one lead.
 *
 * Renders the latest generated HTML artifact in a fully sandboxed iframe (no
 * scripts, no same-origin) so model-authored markup can never touch the CRM.
 * Generation happens here via the on-demand button (PitchActions).
 */
import pool from '@/lib/db'
import { notFound } from 'next/navigation'
import { mapPotentialToService, describePotential } from '@/lib/services-map'
import PitchActions from './PitchActions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PitchRow {
  id: string
  html: string
  service_url: string | null
  model: string | null
  prompt_version: string | null
  created_at: string
}

export default async function PitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const leadRes = await pool.query(
    `SELECT id, name, district, niche, potential, website_url
     FROM crm_leads WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  )
  if (leadRes.rows.length === 0) notFound()
  const lead = leadRes.rows[0] as {
    id: string; name: string; district: string; niche: string
    potential: string | null; website_url: string | null
  }

  const pitchRes = await pool.query<PitchRow>(
    `SELECT id, html, service_url, model, prompt_version, created_at
     FROM crm_lead_pitches WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id],
  )
  const pitch = pitchRes.rows[0] ?? null
  const service = mapPotentialToService(lead.potential, { hasSite: Boolean(lead.website_url) })
  const description = describePotential(lead.potential)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
            Demo · {lead.potential ?? '—'}
          </p>
          <h1 className="text-2xl font-bold text-iron">{lead.name}</h1>
          <p className="text-sm text-gray-500">{lead.district} · {lead.niche}</p>
          {description && <p className="text-sm text-gray-600 mt-1 max-w-xl">{description}</p>}
          {service && (
            <a
              href={service.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-vermilion hover:underline"
            >
              Servicio: {service.name} →
            </a>
          )}
        </div>
        <PitchActions leadId={id} hasPitch={Boolean(pitch)} />
      </div>

      {pitch ? (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <iframe
            title={`Demo — ${lead.name}`}
            srcDoc={pitch.html}
            sandbox=""
            className="w-full"
            style={{ height: '80vh', border: 0 }}
          />
        </div>
      ) : (
        <div className="border border-dashed rounded-lg p-12 text-center text-gray-500">
          <p className="mb-2 text-lg">Aún no hay demo para este lead.</p>
          <p className="text-sm">
            Pulsa <span className="font-medium">Generar demo</span> para crear una maqueta
            con IA (consume tokens de Claude).
          </p>
        </div>
      )}

      {pitch && (
        <p className="mt-3 text-xs text-gray-400">
          Generado {new Date(pitch.created_at).toLocaleString('es-PE')}
          {pitch.model ? ` · ${pitch.model}` : ''}
          {pitch.prompt_version ? ` · ${pitch.prompt_version}` : ''}
        </p>
      )}
    </div>
  )
}
