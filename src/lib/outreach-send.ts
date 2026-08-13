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
import pool from './db'
import { isSuppressed } from './suppression'
import type { AuditStatus } from './types'

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
  /**
   * Recipient is on the do-not-contact list. TERMINAL — never retry, and never
   * hand to the operator to send by hand either. Distinct from `pending` for
   * exactly that reason: a suppressed contact that came back as `pending` would
   * be re-attempted on the next drain, which is the failure this prevents.
   */
  | { status: 'suppressed'; reason: string }

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
  /**
   * Lead's audit status. `unreachable` blocks the auto-send — see
   * unverifiedUnreachable below. Omitted means "unknown", which does not
   * block, so existing callers are unaffected until they pass it.
   */
  auditStatus?: AuditStatus | null
}

/**
 * Would this send go out on the back of a site we never actually reached?
 *
 * The crawler cannot tell a bot block from an outage, and 1,498 leads carry
 * `unreachable`. Every one of them generated an opener asserting the
 * prospect's website was down — including Bodytech, a major gym chain whose
 * site is live and simply blocked us. Asserting a false outage in the first
 * sentence of a cold approach is the most expensive kind of wrong.
 *
 * Exported so the drafts UI can warn before an operator clicks send.
 */
export function unverifiedUnreachable(auditStatus?: AuditStatus | null): boolean {
  return auditStatus === 'unreachable'
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

  // Do-not-contact, checked before EVERYTHING else — before the market gate,
  // before any provider call, and on every channel including the manual ones.
  // Someone who asked not to be contacted must not be messaged by hand either,
  // so this deliberately sits above the manual-market branch below.
  //
  // Fails CLOSED but RECOVERABLY, and the difference matters enormously:
  //   found      -> 'suppressed', which the drain treats as TERMINAL.
  //   lookup err -> 'pending', which is retryable.
  // Returning 'suppressed' on a failed lookup would mean a momentary database
  // blip during a drain permanently marks every queued event 'Not Interested'
  // with no way back. We still refuse to send, we just don't burn the queue.
  try {
    if (await isSuppressed(pool, { email: input.email, phone: input.phone })) {
      return { status: 'suppressed', reason: 'do_not_contact' }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[outreach-send] suppression lookup failed, refusing to send:', msg)
    return { status: 'pending', reason: `suppression_check_failed:${msg}` }
  }

  // Never auto-send copy built on a site we could not reach. Routed to the
  // operator rather than suppressed: the lead is perfectly valid, it is the
  // CLAIM that is unverified, and once a human confirms the site's real state
  // the message can go out with an accurate hook.
  //
  // Sits above the market and channel gates so it applies on every channel.
  if (unverifiedUnreachable(input.auditStatus)) {
    return { status: 'manual', reason: 'unverified_unreachable_site' }
  }

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
