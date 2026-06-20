/**
 * B2B contactability rules — "stay B2B, stay legal".
 *
 * Cold outreach is safest to a *business* contact, but a listed address is
 * often a sole trader's *personal* one — and in consent-first regimes (UK
 * PECR, EU) a sole trader counts as an individual. These helpers classify a
 * contact and decide whether an automated EMAIL may go out, given the lead's
 * market.
 *
 * Scope: email only. Automated WhatsApp is gated separately (Peru-only) in
 * outreach-send.ts; calling stays a human/manual decision.
 */
import { getMarket } from './markets'

/** Free / consumer mailbox providers. A business owner using one of these is
 *  indistinguishable from a private individual, so we don't treat it as a
 *  corporate subscriber. Lower-cased, no leading '@'. */
export const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com',
  'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com',
  'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'zoho.com',
])

/** Countries where automated cold email may go to ANY address (with an
 *  opt-out): US CAN-SPAM permits it, and LatAm enforcement is light. Anywhere
 *  else (UK/EU) automated email is restricted to business-domain addresses,
 *  because personal / sole-trader addresses need consent. */
const PERMISSIVE_EMAIL_COUNTRIES: ReadonlySet<string> = new Set([
  'Peru', 'Mexico', 'Colombia', 'Argentina', 'Panama', 'Ecuador', 'USA',
])

/** Lower-cased domain part of an email, or null if absent / malformed. */
export function emailDomain(email?: string | null): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  return domain || null
}

/** A "business" email = present, has a dotted domain, and is NOT a free
 *  consumer provider. */
export function isBusinessEmail(email?: string | null): boolean {
  const domain = emailDomain(email)
  return !!domain && domain.includes('.') && !FREE_EMAIL_DOMAINS.has(domain)
}

/** Whether the lead's market restricts automated email to business domains.
 *  Fail-safe: an unknown market gets the stricter rule (business-only). */
export function emailRequiresBusinessDomain(city?: string | null): boolean {
  const market = getMarket(city)
  if (!market) return true
  return !PERMISSIVE_EMAIL_COUNTRIES.has(market.country)
}

/** Decide whether an automated email may be sent to this lead. */
export function emailAllowedForLead(email?: string | null, city?: string | null): boolean {
  if (!emailRequiresBusinessDomain(city)) return true
  return isBusinessEmail(email)
}
