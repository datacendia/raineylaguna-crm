/**
 * Pitch Angle engine — turns a lead's REAL digital-audit findings into a
 * ready-to-send opening line plus concrete talking points, deterministically
 * and with zero API cost.
 *
 * This is the free, grounded complement to the AI drafter (draft-outreach.ts):
 * where that needs a paid model, this composes copy from the exact same audit
 * flags the audit step already produced. It never invents facts — every line
 * traces back to a flag that is present on the lead (`flags` records which).
 *
 * Bilingual: the market registry decides Spanish vs English per city, so a
 * Boston lead gets an English angle and a Lima/Bogotá lead a Spanish one.
 *
 * Pure (no I/O) → exhaustively unit-testable and safe to call in a hot loop
 * (e.g. ranking the Opportunity Radar on the analytics page).
 */
import type { AuditFlag } from './types'
import { localeForCity } from './markets'

export type Locale = 'es' | 'en'

export type PitchAngleInput = {
  name: string
  city?: string | null
  niche?: string | null
  website_url?: string | null
  instagram_url?: string | null
  audit_findings?: { flags?: AuditFlag[] | null } | null
}

export type PitchAngle = {
  locale: Locale
  /** Internal one-line summary of the biggest opportunity (for the operator). */
  headline: string
  /** A ready-to-send first line — a verifiable hook, never a generic intro. */
  opening: string
  /** 1-3 concrete, benefit-framed talking points drawn from real findings. */
  talkingPoints: string[]
  /** Flag ids the angle is built from — provenance, so nothing is fabricated. */
  flags: string[]
}

type Copy = {
  /** Higher = bigger/clearer sales opportunity; breaks ties within a severity. */
  weight: number
  es: { clause: string; point: string }
  en: { clause: string; point: string }
}

/**
 * Per-flag copy. `clause` slots into "I noticed that <clause>"; `point` is the
 * benefit-framed bullet. Keep these factual and non-hyperbolic — they go to a
 * real prospect.
 */
const COPY: Record<string, Copy> = {
  no_website: {
    weight: 100,
    es: {
      clause: 'no tiene una web propia, solo presencia en redes o directorios',
      point: 'Sin web propia: hoy los clientes que te buscan en Google llegan a la competencia',
    },
    en: {
      clause: 'has no real website — only social or directory listings',
      point: 'No real website: customers searching Google land on competitors instead',
    },
  },
  social_only: {
    weight: 95,
    es: {
      clause: 'solo existe en redes sociales, sin una web propia',
      point: 'Solo redes: una web propia da credibilidad y aparece en Google 24/7',
    },
    en: {
      clause: 'only has a social page, not a real website',
      point: 'Social-only: a real site builds trust and shows up on Google 24/7',
    },
  },
  site_unreachable: {
    weight: 90,
    es: {
      clause: 'su sitio web no carga / está caído',
      point: 'La web no responde: cada visita perdida es un cliente que se va a otro',
    },
    en: {
      clause: "their website doesn't load / is down",
      point: 'Site is down: every failed visit is a customer lost to someone else',
    },
  },
  no_https: {
    weight: 80,
    es: {
      clause: 'su web no usa HTTPS, así que el navegador la marca como «no segura»',
      point: 'Sin HTTPS: el navegador asusta a los visitantes con un aviso de inseguridad',
    },
    en: {
      clause: "the site isn't on HTTPS, so browsers label it 'not secure'",
      point: "No HTTPS: browsers scare visitors away with a 'not secure' warning",
    },
  },
  not_mobile: {
    weight: 75,
    es: {
      clause: 'la web no está adaptada a móvil, donde está la mayoría de tu tráfico',
      point: 'No es responsive: la mayoría navega desde el móvil y ahí se ve rota',
    },
    en: {
      clause: "the site isn't mobile-friendly, where most of the traffic is",
      point: 'Not mobile-friendly: most visitors are on phones and it breaks for them',
    },
  },
  slow_lcp: {
    weight: 70,
    es: {
      clause: 'la web tarda demasiado en cargar',
      point: 'Carga lenta: cada segundo extra hace que más visitantes abandonen',
    },
    en: {
      clause: 'the site is slow to load',
      point: 'Slow load: each extra second pushes more visitors to bounce',
    },
  },
  poor_performance: {
    weight: 65,
    es: {
      clause: 'la web tiene bajo rendimiento técnico (Google la penaliza en el ranking)',
      point: 'Bajo rendimiento: Google penaliza los sitios lentos en su ranking',
    },
    en: {
      clause: 'the site scores poorly on performance (Google penalises it in rankings)',
      point: 'Poor performance: Google demotes slow sites in its rankings',
    },
  },
  weak_seo: {
    weight: 60,
    es: {
      clause: 'su SEO es débil, por lo que casi no apareces en Google',
      point: 'SEO débil: no apareces cuando tus clientes te buscan por tu rubro',
    },
    en: {
      clause: "the SEO is weak, so you barely show up on Google",
      point: "Weak SEO: you don't appear when customers search your category",
    },
  },
  stale: {
    weight: 40,
    es: {
      clause: 'la web parece abandonada (el año del copyright está vencido)',
      point: 'Web desactualizada: un copyright viejo da señal de negocio abandonado',
    },
    en: {
      clause: 'the site looks abandoned (the copyright year is stale)',
      point: 'Stale site: an old copyright year signals an abandoned business',
    },
  },
  weak_accessibility: {
    weight: 30,
    es: {
      clause: 'la web tiene problemas de accesibilidad para parte de tus visitantes',
      point: 'Accesibilidad: parte de tus visitantes no puede usar bien el sitio',
    },
    en: {
      clause: 'the site has accessibility problems for some visitors',
      point: "Accessibility: some of your visitors can't use the site properly",
    },
  },
  no_structured_data: {
    weight: 20,
    es: {
      clause: 'le faltan etiquetas de vista previa, así que se ve pobre al compartirla',
      point: 'Sin vista previa social: el enlace se ve pobre al compartirlo en redes',
    },
    en: {
      clause: 'it lacks preview tags, so it looks plain when shared',
      point: 'No social preview: the link looks plain when shared anywhere',
    },
  },
  no_analytics: {
    weight: 10,
    es: {
      clause: 'no mide sus visitas (no hay analítica instalada)',
      point: 'Sin analítica: hoy no sabes cuántos clientes visitan ni de dónde llegan',
    },
    en: {
      clause: "they don't measure visits (no analytics installed)",
      point: "No analytics: you can't see how many customers visit or where from",
    },
  },
}

const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

function rankFlags(flags: AuditFlag[]): AuditFlag[] {
  return [...flags]
    .filter((f) => COPY[f.id])
    .sort((a, b) => {
      const sev = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
      if (sev !== 0) return sev
      return (COPY[b.id]?.weight ?? 0) - (COPY[a.id]?.weight ?? 0)
    })
}

/** Build the grounded opening line from the single strongest flag. */
function buildOpening(name: string, top: AuditFlag, locale: Locale): string {
  const c = COPY[top.id][locale]
  if (locale === 'es') {
    switch (top.id) {
      case 'no_website':
        return `Cuando busqué a ${name} en Google no encontré una web propia — esos clientes están llegando a tu competencia.`
      case 'social_only':
        return `${name} solo aparece en redes sociales; una web propia te daría credibilidad y presencia en Google todo el día.`
      case 'site_unreachable':
        return `Intenté entrar a la web de ${name} y no cargó — cada visita perdida es un cliente que se va a otro.`
      default:
        return `Revisé la web de ${name} y noté que ${c.clause} — eso te está costando clientes en silencio.`
    }
  }
  switch (top.id) {
    case 'no_website':
      return `When I searched for ${name} on Google I couldn't find a real website — those customers are landing on your competitors.`
    case 'social_only':
      return `${name} only shows up on social media; a real website would give you credibility and round-the-clock presence on Google.`
    case 'site_unreachable':
      return `I tried to open ${name}'s website and it wouldn't load — every failed visit is a customer lost to someone else.`
    default:
      return `I took a look at ${name}'s website and noticed ${c.clause} — that's quietly costing you customers.`
  }
}

/**
 * Compose a grounded pitch angle for a lead from its audit findings.
 * Falls back gracefully when there is no audit or the site is already healthy.
 */
export function buildPitchAngle(lead: PitchAngleInput): PitchAngle {
  const locale = localeForCity(lead.city)
  const name = lead.name?.trim() || (locale === 'es' ? 'el negocio' : 'the business')
  const allFlags = lead.audit_findings?.flags ?? []

  // No audit yet → tell the operator to run one rather than invent a hook.
  if (!lead.audit_findings) {
    return {
      locale,
      headline:
        locale === 'es'
          ? 'Sin auditoría todavía — córrela para generar un ángulo concreto'
          : 'Not audited yet — run an audit to unlock a concrete angle',
      opening:
        locale === 'es'
          ? `Aún no he auditado a ${name}; una auditoría rápida revelará el mejor ángulo de contacto.`
          : `I haven't audited ${name} yet; a quick audit will surface the best angle to lead with.`,
      talkingPoints: [],
      flags: [],
    }
  }

  const ranked = rankFlags(allFlags)

  // Audited but no actionable flags → the site is solid; pivot to an upsell.
  if (ranked.length === 0) {
    return {
      locale,
      headline:
        locale === 'es'
          ? 'Base sólida — el ángulo es crecimiento y conversión, no reparación'
          : 'Solid foundation — the angle is growth & conversion, not repair',
      opening:
        locale === 'es'
          ? `${name} ya tiene una buena base digital; el siguiente salto es convertir esas visitas en clientes.`
          : `${name} already has a solid digital base; the next leap is turning those visits into customers.`,
      talkingPoints:
        locale === 'es'
          ? ['Optimizar la conversión de la web existente', 'Campañas y contenido para crecer el tráfico']
          : ['Optimise conversion on the existing site', 'Content & campaigns to grow traffic'],
      flags: [],
    }
  }

  const top = ranked.slice(0, 3)
  const talkingPoints = top.map((f) => COPY[f.id][locale].point)
  const opening = buildOpening(name, ranked[0], locale)
  const extra = ranked.length - 1
  const headline =
    locale === 'es'
      ? `${name}: ${COPY[ranked[0].id].es.point}${extra > 0 ? ` (+${extra} señal${extra > 1 ? 'es' : ''} más)` : ''}`
      : `${name}: ${COPY[ranked[0].id].en.point}${extra > 0 ? ` (+${extra} more signal${extra > 1 ? 's' : ''})` : ''}`

  return { locale, headline, opening, talkingPoints, flags: top.map((f) => f.id) }
}
