/**
 * Resend email sender for CRM outreach.
 *
 * Mirrors the twilio.ts contract exactly so the unified dispatcher can treat
 * both providers the same way:
 *   - `getResendConfig()` returns null when RESEND_API_KEY / RESEND_FROM are
 *     unset → caller leaves the event Pending (degraded mode, no throw).
 *   - `sendEmail()` returns `{ ok, id? , error? }`.
 *
 * Raw fetch, no SDK — keeps the dependency surface small (same rationale as
 * anthropic.ts / twilio.ts).
 *
 * Required env: RESEND_API_KEY, RESEND_FROM (e.g. "Rainey Laguna <hola@raineylaguna.com>").
 */

import { serverEnv } from './env'

const ENDPOINT = 'https://api.resend.com/emails'

export interface ResendConfig {
  apiKey: string
  from: string
}

export interface EmailSendResult {
  ok: boolean
  id?: string
  error?: string
}

export function getResendConfig(): ResendConfig | null {
  const apiKey = serverEnv.RESEND_API_KEY
  const from = serverEnv.RESEND_FROM
  if (!apiKey || !from) return null
  return { apiKey, from }
}

/** Basic RFC-5322-ish sanity check so we never hand Resend obvious garbage. */
export function isEmail(s: string | null | undefined): s is string {
  if (!s) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

export interface SendEmailOptions {
  text?: string
  html?: string
  replyTo?: string
}

export async function sendEmail(
  cfg: ResendConfig,
  to: string,
  subject: string,
  opts: SendEmailOptions,
): Promise<EmailSendResult> {
  if (!isEmail(to)) return { ok: false, error: 'invalid_recipient' }
  if (!opts.text && !opts.html) return { ok: false, error: 'empty_body' }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [to.trim()],
        subject,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.html ? { html: opts.html } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      id?: string
      message?: string
      name?: string
    }
    if (!res.ok) {
      return { ok: false, error: `${res.status}: ${json.message ?? json.name ?? 'unknown'}` }
    }
    return { ok: true, id: json.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
