import type { Lead } from './types'

export type ScriptTemplate = {
  id: string
  label: string
  channel: 'Email' | 'Instagram DM' | 'WhatsApp' | 'LinkedIn'
  matches: (lead: Lead) => boolean
  render: (lead: Lead) => string
  /** Email subject line. Only used when channel === 'Email'. */
  subject?: (lead: Lead) => string
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'gastronomy-margin-rescue',
    label: 'Gastronomy · Margin Rescue (Instagram DM)',
    channel: 'Instagram DM',
    matches: (l) => l.niche === 'Gastronomy',
    render: (l) => `Hola ${l.name} team, I love the aesthetic of your dishes on Instagram!

I was trying to book a table / order directly but noticed you're primarily using ${
      l.website_status === 'Platform-Only' ? 'Mesa 24/7 / Linktree' : 'social media as your storefront'
    }.

I run Rainey Laguna Studios, a local tech studio in Lima. We help restaurants in ${l.district} build their own direct-booking and digital menu platforms so you can stop paying 15-30% commissions to aggregators and actually keep your customer's data for future marketing.

Would you be open to seeing a quick prototype of what a custom, commission-free platform would look like for ${l.name}?`,
  },
  {
    id: 'legal-authority',
    label: 'Legal · Authority & Security (Email / LinkedIn)',
    channel: 'Email',
    matches: (l) => l.niche === 'Professional Services',
    subject: (l) => `${l.name}: auditoría breve de su sitio web`,
    render: (l) => `Estimado equipo de ${l.name},

I am reaching out because while researching top-tier legal representation in ${l.district}, I came across your firm. However, I noticed that your current website ${
      l.evaluation?.includes('Mobile')
        ? 'is not mobile responsive'
        : l.evaluation?.includes('Security')
        ? 'lacks an SSL security certificate'
        : l.evaluation?.includes('Static')
        ? 'is a static page from an earlier era of the web'
        : (l.website_status === 'No Website' ? 'is absent' : 'has significant gaps')
    }. In the corporate sector, this digital footprint can inadvertently signal a lack of data security to potential international clients.

At Rainey Laguna Studios, we specialize in modernizing digital infrastructure for professional services. Furthermore, through our tool VigíaV2, we provide 24/7 uptime and security monitoring for client portals.

I have prepared a brief digital audit of your site showing the specific vulnerabilities — would you have 5 minutes next Tuesday to review it?`,
  },
  {
    id: 'automotive-uptime',
    label: 'Automotive · Uptime Insurance (WhatsApp / Email)',
    channel: 'WhatsApp',
    matches: (l) => l.niche === 'Automotive',
    render: (l) => `Hola team at ${l.name},

As a premium automotive service center in ${l.district}, your clients expect reliability. I noticed your website is currently ${
      l.website_status === 'No Website'
        ? 'missing entirely'
        : l.evaluation?.includes('Mobile')
        ? 'not running well on mobile'
        : l.evaluation?.includes('Speed')
        ? 'running very slowly'
        : 'showing performance issues'
    }, which can cost you clients searching for emergency assistance or high-end repairs from their phones.

We help automotive centers build fast, reliable service portals. More importantly, we deploy VigíaV2, a monitoring system that ensures your site and lead-capture forms never go offline without you knowing.

I'd love to show you how a reliable digital booking system can streamline your workshop schedule.`,
  },
  {
    id: 'beauty-booking',
    label: 'Beauty · Automated Booking (Instagram DM)',
    channel: 'Instagram DM',
    matches: (l) => l.niche === 'Beauty & Wellness',
    render: (l) => `Hola ${l.name}!

Adoré ver el trabajo en su feed. Vi que las reservas las manejan por DM/WhatsApp manual.

En Rainey Laguna Studios construimos sitios con motor de citas integrado para salones en ${l.district}: el cliente reserva solo, ustedes reciben confirmación, y dejan de perder horas confirmando turnos por chat.

¿Les muestro un prototipo de cómo se vería para ${l.name}?`,
  },
  {
    id: 'fitness-membership',
    label: 'Fitness · Membership Portal (Email)',
    channel: 'Email',
    matches: (l) => l.niche === 'Fitness',
    subject: (l) => `${l.name}: portal de reservas y membresías`,
    render: (l) => `Hi ${l.name} team,

I was looking at fitness studios in ${l.district} and your community stands out. The gap I noticed: members can't easily check class schedules or manage memberships from your current ${
      l.website_status === 'No Website' ? 'absence of website' : 'site'
    }.

Rainey Laguna Studios builds class-scheduling and membership portals for boutique gyms. Quick prototype possible — interested?`,
  },
]

export function templatesFor(lead: Lead): ScriptTemplate[] {
  return SCRIPT_TEMPLATES.filter((t) => t.matches(lead))
}
