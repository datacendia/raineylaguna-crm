export type Lead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string | null
  district: string
  niche: string
  category: string | null
  instagram_active: boolean | null
  instagram_url: string | null
  google_place_id: string | null
  website_url: string | null
  website_status: string | null
  evaluation: string | null
  strategic_action: string | null
  potential: string | null
  pipeline_stage: PipelineStage
  notes: string | null
  next_action: string | null
  snoozed_until: string | null
  created_at: string
  updated_at: string
}

export type OutreachEvent = {
  id: string
  lead_id: string
  channel: 'Email' | 'Instagram DM' | 'WhatsApp' | 'LinkedIn'
  status: string
  scheduled_for: string | null
  sent_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type OutreachDraft = {
  id: string
  lead_id: string
  channel: 'WhatsApp' | 'Email' | 'Instagram DM' | 'LinkedIn'
  body: string
  model: string | null
  prompt_version: string | null
  status: 'pending' | 'sent' | 'discarded'
  generated_at: string
  acted_at: string | null
  acted_by: string | null
}

export type VideoAudit = {
  id: string
  lead_id: string
  loom_url: string | null
  conversion_status: string
  created_at: string
  updated_at: string
}

export const DISTRICTS = [
  'Ancón', 'Ate', 'Barranco', 'Breña', 'Carabayllo', 'Chaclacayo', 'Chorrillos',
  'Cieneguilla', 'Comas', 'El Agustino', 'Independencia', 'Jesús María', 'La Molina',
  'La Victoria', 'Lima Cercado', 'Lince', 'Los Olivos', 'Lurigancho', 'Lurín',
  'Magdalena del Mar', 'Miraflores', 'Pachacámac', 'Pucusana', 'Pueblo Libre',
  'Puente Piedra', 'Punta Hermosa', 'Punta Negra', 'Rímac', 'San Bartolo', 'San Borja',
  'San Isidro', 'San Juan de Lurigancho', 'San Juan de Miraflores', 'San Luis',
  'San Martín de Porres', 'San Miguel', 'Santa Anita', 'Santa María del Mar',
  'Santa Rosa', 'Santiago de Surco', 'Surquillo', 'Villa El Salvador',
  'Villa María del Triunfo',
] as const

export const NICHES = [
  'Gastronomy',
  'Professional Services',
  'Beauty & Wellness',
  'Automotive',
  'Fitness',
  'Industrial & Commercial',
] as const

export const STAGES = ['Lead', 'Contacted', 'Audited', 'Proposal', 'Closed'] as const

/**
 * Pipeline stage union derived from STAGES so the two stay in sync.
 * Use this type anywhere a pipeline stage is passed around (form state,
 * drag-and-drop handlers, API payloads) to avoid `string`-based casts.
 */
export type PipelineStage = (typeof STAGES)[number]

export const CHANNELS = ['Email', 'Instagram DM', 'WhatsApp', 'LinkedIn'] as const
