/**
 * Unified outreach dispatcher.
 *
 * One place that knows how to actually deliver a message on each channel, so
 * both the BullMQ worker (scheduled batch sends) and the on-demand drafts
 * queue (operator clicks "Send") share identical behaviour and we never have
 * two divergent send paths again.
 *
 * Channel support:
 *   - WhatsApp : Twilio (real send, with delivery/read tracking via StatusCallback)
 *   - Email    : Resend  (real send)
 *   - Instagram DM / LinkedIn : NO sanctioned send API exists. These are
 *     "manual" channels — we prepare + track the message and the operator
 *     sends it by hand, then marks it sent. We never pretend to deliver them.
 *
 * Every provider degrades gracefully: if a provider isn't configured (or the
 * recipient field is missing) we return `pending` with a machine-readable
 * reason instead of throwing, so a batch run continues and the operator can
 * fix config and retry.
 */

import { getTwilioConfig, sendWhatsapp } from './twilio'
import { getResendConfig, sendEmail, isEmail } from './resend'
import { getMarket, isManualOnlyMarket } from './markets'
import { emailAllowedForLead } from './contactability'
import { serverEnv } from './env'

export type Channel = 'Email' | 'Instagram DM' | 'WhatsApp' | 'LinkedIn'

/** Channels we can deliver programmatically right now. */
export const AUTOMATED_CHANNELS: Channel[] = ['WhatsApp', 'Email']
/** Channels with no sanctioned API — operator sends by hand. */
export const MANUAL_CHANNELS: Channel[] = ['Instagram DM', 'LinkedIn']

export function isManualChannel(channel: string): boolean {
  return (MANUAL_CHANNELS as string[]).includes(channel)
}

/**
 * Markets where automated WhatsApp outreach is currently permitted.
 *
 * Cold, automated WhatsApp/SMS to scraped numbers carries heavy legal
 * exposure outside Peru — US TCPA ($500–$1,500 statutory damages *per text*)
 * and UK PECR/GDPR — and breaches Twilio's AUP / WhatsApp Business policy
 * without prior opt-in. Until a per-market consent path exists, automated
 * WhatsApp is gated to Peru only. Email and the manual channels are unaffected.
 */
const AUTOMATED_WHATSAPP_COUNTRIES: readonly string[] = ['Peru']

/**
 * Whether automated WhatsApp may be sent to a lead in the given city.
 *
 * Fail-closed: a lead whose city isn't a known market (markets.ts) — or whose
 * city is missing — is treated as NOT allowed, so a new market or an
 * un-threaded call site never leaks a send.
 */
export function whatsappAllowedForCity(city?: string | null): boolean {
  const market = getMarket(city)
  return !!market && AUTOMATED_WHATSAPP_COUNTRIES.includes(market.country)
}

export type SendOutcome =
  /** Provider accepted the message. */
  | { status: 'sent'; providerId?: string }
  /** Couldn't send now (missing config / recipient / provider error). Retryable. */
  | { status: 'pending'; reason: string }
  /** Channel has no API; operator must send manually then mark it. */
  | { status: 'manual'; reason: string }

export interface SendInput {
  channel: Channel | string
  body: string
  phone?: string | null
  email?: string | null
  /** Email subject; a sensible default is used when omitted. */
  subject?: string | null
  /** Outreach-event id, used to correlate Twilio status callbacks. */
  eventId?: string
  /** Lead's market/city (markets.ts). Drives the automated-WhatsApp
   *  compliance gate — see whatsappAllowedForCity. */
  city?: string | null
}

const DEFAULT_EMAIL_SUBJECT = 'Una observación sobre su presencia digital'

/**
 * Build the Twilio StatusCallback URL for an event. Returns undefined unless a
 * public base URL + shared token are configured, so local/dev sends simply
 * don't request callbacks.
 */
export function buildStatusCallback(eventId?: string): string | undefined {
  const base = serverEnv.CRM_PUBLIC_BASE_URL
  const token = serverEnv.TWILIO_STATUS_CALLBACK_TOKEN
  if (!base || !token || !eventId) return undefined
  try {
    const u = new URL('/api/webhooks/twilio', base)
    u.searchParams.set('token', token)
    u.searchParams.set('event_id', eventId)
    return u.toString()
  } catch {
    return undefined
  }
}

export async function sendOutreach(input: SendInput): Promise<SendOutcome> {
  const channel = input.channel

  // Manual-only markets (markets.ts): the operator contacts every lead by hand,
  // so NO channel auto-sends here. Checked first, before any provider call, so
  // a newly added city can never leak an automated send before its per-channel
  // consent path exists.
  if (isManualOnlyMarket(input.city)) {
    const slug = String(channel).toLowerCase().replace(/\s+/g, '_')
    return { status: 'manual', reason: `manual_market:${input.city}:${slug}` }
  }

  if (channel === 'WhatsApp') {
    // Compliance gate: automated WhatsApp is Peru-only for now
    // (see whatsappAllowedForCity). Checked before any provider call so a
    // gated message never reaches Twilio. Stays Pending with a clear reason.
    if (!whatsappAllowedForCity(input.city)) {
      return {
        status: 'pending',
        reason: `whatsapp_gated:${input.city ?? 'unknown'}_market_not_allowed`,
      }
    }
    const cfg = getTwilioConfig()
    if (!cfg) return { status: 'pending', reason: 'twilio_not_configured' }
    if (!input.phone) return { status: 'pending', reason: 'lead_phone_missing' }
    const res = await sendWhatsapp(
      cfg,
      input.phone,
      input.body,
      buildStatusCallback(input.eventId),
    )
    return res.ok
      ? { status: 'sent', providerId: res.sid }
      : { status: 'pending', reason: `twilio_error:${res.error ?? 'unknown'}` }
  }

  if (channel === 'Email') {
    const cfg = getResendConfig()
    if (!cfg) return { status: 'pending', reason: 'resend_not_configured' }
    if (!isEmail(input.email)) return { status: 'pending', reason: 'lead_email_missing' }
    // B2B safety gate: in consent-first markets (UK/EU) automated email is
    // restricted to business-domain addresses; a free-provider address is
    // treated as an individual and held for manual review. Permissive markets
    // (US CAN-SPAM, Peru/LatAm) allow any address with an opt-out.
    if (!emailAllowedForLead(input.email, input.city)) {
      return { status: 'pending', reason: `email_gated:personal_address_in_${input.city ?? 'unknown'}` }
    }
    const subject = input.subject?.trim() || DEFAULT_EMAIL_SUBJECT
    const res = await sendEmail(cfg, input.email, subject, { text: input.body })
    return res.ok
      ? { status: 'sent', providerId: res.id }
      : { status: 'pending', reason: `resend_error:${res.error ?? 'unknown'}` }
  }

  // Instagram DM / LinkedIn (or anything unrecognised): manual.
  const slug = String(channel).toLowerCase().replace(/\s+/g, '_')
  return { status: 'manual', reason: `manual_channel:${slug}` }
}
