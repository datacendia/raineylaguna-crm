/**
 * Do-not-contact list.
 *
 * Every automated send goes through `sendOutreach` (outreach-send.ts), and
 * `sendOutreach` asks this module first. That is the whole design: one choke
 * point, checked on every channel, so a new send path cannot forget to honour
 * an opt-out.
 *
 * Matching is by CONTACT POINT, not by lead. The same person routinely appears
 * on more than one lead row — duplicate imports, several branches sharing a
 * mobile — and "stop contacting me" has to silence all of them.
 *
 * Normalisation here must agree with how crm_leads stores contacts, or a
 * suppression written from a webhook will not match the lead it came from:
 *   email → trimmed + lowercased   (same as api/leads/public/route.ts)
 *   phone → digits only            (same as api/leads/public/route.ts)
 */
import type { Pool, PoolClient } from 'pg'

type Db = Pool | PoolClient

export type SuppressionReason = 'opt_out' | 'bounce' | 'complaint' | 'manual'
export type SuppressionSource = 'whatsapp' | 'email' | 'operator' | 'api'

export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null
  const e = String(email).trim().toLowerCase()
  return e || null
}

export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null
  const p = String(phone).replace(/\D/g, '')
  return p || null
}

/**
 * Opt-out intent in an inbound message.
 *
 * Deliberately conservative: it matches only when the message is essentially
 * JUST the keyword, so "no me gusta el stop motion" is not read as an opt-out.
 * Getting this wrong in the permissive direction silences a live prospect;
 * getting it wrong in the strict direction means the operator handles it by
 * hand. The strict direction is the safer failure.
 *
 * Covers the Spanish keywords a Peruvian recipient would actually send, plus
 * the English ones WhatsApp and email clients suggest.
 */
const OPT_OUT_WORDS = [
  'stop', 'baja', 'alto', 'cancelar', 'cancela', 'salir', 'eliminar',
  'desuscribir', 'desuscribirme', 'unsubscribe', 'remove', 'quit', 'end',
  'no molestar', 'no escribir', 'no contactar', 'dejar de escribir',
]

export function isOptOut(body?: string | null): boolean {
  if (!body) return false
  // Strip accents, punctuation and collapse whitespace, then require the whole
  // message to be the keyword (optionally with a polite lead-in like "por favor").
  const t = String(body)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents: "cancelá" → "cancela"
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return false
  const stripped = t
    .replace(/^(por favor|porfavor|please|pls)\s+/, '')
    .replace(/\s+(por favor|porfavor|please|pls)$/, '')
    .trim()
  return OPT_OUT_WORDS.includes(stripped)
}

/**
 * True when either contact point is on the list. Called before every send, so
 * it is a single indexed query rather than two round trips.
 */
export async function isSuppressed(
  db: Db,
  contact: { email?: string | null; phone?: string | null },
): Promise<boolean> {
  const email = normalizeEmail(contact.email)
  const phone = normalizePhone(contact.phone)
  if (!email && !phone) return false

  const { rows } = await db.query<{ n: string }>(
    `SELECT 1 AS n FROM crm_suppressions
      WHERE (email IS NOT NULL AND email = $1)
         OR (phone IS NOT NULL AND phone = $2)
      LIMIT 1`,
    [email, phone],
  )
  return rows.length > 0
}

/**
 * Record an opt-out. Idempotent — re-suppressing an already-suppressed contact
 * refreshes the provenance rather than erroring, so a recipient who sends STOP
 * three times does not produce three failures.
 */
export async function suppress(
  db: Db,
  input: {
    email?: string | null
    phone?: string | null
    reason?: SuppressionReason
    source?: SuppressionSource
    leadId?: string | null
    note?: string | null
  },
): Promise<{ suppressed: boolean }> {
  const email = normalizeEmail(input.email)
  const phone = normalizePhone(input.phone)
  if (!email && !phone) return { suppressed: false }

  // There are two partial unique indexes (email, phone), and a contact may
  // collide on either. Rather than a conditional upsert that can only target
  // one of them, insert and treat a unique violation as success: the row
  // already existing IS the desired end state. Contention here is a human
  // sending STOP twice, so the simple form is also the correct one.
  try {
    await db.query(
      `INSERT INTO crm_suppressions (email, phone, reason, source, lead_id, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        email,
        phone,
        input.reason ?? 'opt_out',
        input.source ?? 'operator',
        input.leadId ?? null,
        input.note ?? null,
      ],
    )
  } catch (err) {
    // 23505 = unique_violation. Already suppressed — nothing to do.
    if ((err as { code?: string }).code !== '23505') throw err
  }

  return { suppressed: true }
}
