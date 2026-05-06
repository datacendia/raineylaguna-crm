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
  website_url: string | null
  website_status: string | null
  evaluation: string | null
  strategic_action: string | null
  potential: string | null
  pipeline_stage: 'Lead' | 'Contacted' | 'Audited' | 'Proposal' | 'Closed'
  notes: string | null
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

export type VideoAudit = {
  id: string
  lead_id: string
  loom_url: string | null
  conversion_status: string
  created_at: string
  updated_at: string
}

export const DISTRICTS = [
  'Miraflores',
  'San Isidro',
  'Santiago de Surco',
  'San Borja',
  'La Molina',
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

export const CHANNELS = ['Email', 'Instagram DM', 'WhatsApp', 'LinkedIn'] as const
