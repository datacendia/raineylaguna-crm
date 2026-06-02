/**
 * Twilio WhatsApp sender for CRM outreach.
 *
 * Outbound to leads happens *outside* any 24-hour customer-initiated session
 * window, which means Twilio requires a pre-approved Message Template
 * (TWILIO_TEMPLATE_SID). Free-form sends will be rejected by Meta in
 * production. We still allow free-form when no template SID is set, since
 * that path is useful for sandbox testing.
 *
 * Ported from vigiaV2/scripts/whatsapp/send.ts. Uses raw fetch so we don't
 * pull in the twilio npm package.
 */

import { serverEnv } from './env'

export interface TwilioConfig {
  accountSid: string
  authToken: string
  whatsappFrom: string
  templateSid?: string
}

export interface SendResult {
  ok: boolean
  sid?: string
  error?: string
}

export function getTwilioConfig(): TwilioConfig | null {
  const accountSid = serverEnv.TWILIO_ACCOUNT_SID
  const authToken = serverEnv.TWILIO_AUTH_TOKEN
  const whatsappFrom = serverEnv.TWILIO_WHATSAPP_FROM
  if (!accountSid || !authToken || !whatsappFrom) return null
  return {
    accountSid,
    authToken,
    whatsappFrom,
    templateSid: serverEnv.TWILIO_TEMPLATE_SID,
  }
}

/**
 * Accepts "999888777", "+51999888777", "51999888777", "whatsapp:+51..."
 * and returns "whatsapp:+<e164>". Defaults to Peru (+51) when no country
 * prefix is present.
 */
export function normalizeWhatsappNumber(s: string): string {
  const trimmed = s.trim()
  if (trimmed.startsWith('whatsapp:')) return trimmed
  const digits = trimmed.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return `whatsapp:${digits}`
  if (digits.startsWith('51')) return `whatsapp:+${digits}`
  return `whatsapp:+51${digits}`
}

export async function sendWhatsapp(
  cfg: TwilioConfig,
  to: string,
  body: string,
  statusCallback?: string
): Promise<SendResult> {
  const params = new URLSearchParams()
  params.set('To', normalizeWhatsappNumber(to))
  params.set('From', cfg.whatsappFrom)
  if (cfg.templateSid) {
    params.set('ContentSid', cfg.templateSid)
    params.set('ContentVariables', JSON.stringify({ '1': body.slice(0, 1024) }))
  } else {
    params.set('Body', body)
  }
  // Twilio will POST delivery/read updates to this URL (see
  // /api/webhooks/twilio). Only set when a public base URL + token exist.
  if (statusCallback) params.set('StatusCallback', statusCallback)

  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    const json = (await res.json()) as { sid?: string; message?: string; code?: number }
    if (!res.ok) {
      return { ok: false, error: `${json.code ?? res.status}: ${json.message ?? 'unknown'}` }
    }
    return { ok: true, sid: json.sid }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
