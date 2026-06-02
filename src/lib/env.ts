/**
 * Environment-variable loader for the CRM.
 *
 * Single source of truth for every `process.env` read in app code. Use
 * `serverEnv.X` instead of `process.env.X` everywhere outside this file
 * (and outside test fixtures, which intentionally mutate process.env to
 * exercise env-dependent behaviour).
 *
 * Why a Proxy instead of a cached load:
 *
 *   - Vitest imports are hoisted, so a `const cached = readEnv()` would
 *     freeze values BEFORE test fixtures get to mutate `process.env`. The
 *     auth + lead-intake tests rely on per-test env mutations.
 *   - The proxy reads `process.env` on every access, so production gets a
 *     live view of Railway / Docker env, and tests can mutate freely.
 *
 * Why no zod:
 *
 *   - The CRM didn't already depend on zod. Pulling it in just for env
 *     validation is overkill for ~10 keys. We document required-ness in
 *     the union below; consumers handle "unset" the same way they did
 *     when they read process.env directly (degraded mode, 503, fallback).
 *   - vigiaV2 does use zod for its env loader; if the CRM grows API input
 *     validation needs that warrant zod, lift to that pattern then.
 *
 * Per rainey-stack/CONVENTIONS.md §10 (env-var policy). Closes BUGS.md C21.
 */

/**
 * Every env var the CRM reads in app code. Keep this list tight — adding a
 * key here is the only place a new env var ever needs to be acknowledged.
 *
 * `.env.example`, `DEPLOY.md`, the Railway dashboard, and any docker-compose
 * fixtures must agree with this set.
 */
const ENV_KEYS = [
  // Required for boot. Code paths that read these throw / 500 if unset.
  'DATABASE_URL',
  'CRM_COOKIE_SECRET',

  // Optional, with documented degraded-mode behaviour:
  'REDIS_URL', // queue.ts falls back to localhost:6379 (dev convenience)
  'CRM_LEAD_INTAKE_SECRET', // /api/leads/public 503s when unset
  'ANTHROPIC_API_KEY', // outreach drafter throws when unset
  'ANTHROPIC_MODEL', // outreach drafter falls back to DEFAULT_MODEL
  'TWILIO_ACCOUNT_SID', // twilio.ts throws when any of the four are unset
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'TWILIO_TEMPLATE_SID',
  'GOOGLE_PLACES_API_KEY', // discovery/backfill; also the audit route's PageSpeed fallback key
  'GOOGLE_PAGESPEED_API_KEY', // audit prefers this; falls back to GOOGLE_PLACES_API_KEY, then keyless

  // Email outreach (Resend). resend.ts returns a "not configured" result when
  // RESEND_API_KEY is unset, so the worker leaves the event Pending instead of
  // failing — same degraded-mode contract as Twilio.
  'RESEND_API_KEY',
  'RESEND_FROM', // e.g. "Rainey Laguna <hola@raineylaguna.com>"; required to send email

  // Outreach tracking + links
  'CRM_PUBLIC_BASE_URL', // public https origin; used to build Twilio StatusCallback URLs
  'TWILIO_STATUS_CALLBACK_TOKEN', // shared secret in the status-callback path; webhook 401s without it
  'CRM_INBOUND_EMAIL_SECRET', // shared secret for POST /api/leads/from-email (Cloudflare Email Worker)

  // Sereno (vigia) customer cross-reference sync
  'VIGIA_CUSTOMERS_URL', // read-only endpoint on vigia returning customer emails
  'VIGIA_SYNC_SECRET', // bearer secret presented to VIGIA_CUSTOMERS_URL

  // Digest auto-email (scripts/digest-email-cron.ts)
  'DIGEST_EMAIL_TO', // comma-separated recipients for the Monday digest email

  // Priority-score weight overrides (optional JSON; see src/lib/priority-score.ts)
  'CRM_PRIORITY_WEIGHTS',

  // Build / runtime metadata
  'NEXT_PUBLIC_GIT_SHA', // /api/health surfaces this as `version`; falls back to RAILWAY sha, then 'unknown'
  'RAILWAY_GIT_COMMIT_SHA', // injected by Railway for repo-linked services; health version fallback
  'NODE_ENV',
] as const

type EnvKey = (typeof ENV_KEYS)[number]

/**
 * Proxy over `process.env` that:
 *   - constrains keys to the explicit allow-list (typo-proof),
 *   - returns `undefined` for unset keys (consumers handle the absence),
 *   - reads live so test fixtures can mutate `process.env` between cases.
 */
export const serverEnv = new Proxy({} as Record<EnvKey, string | undefined>, {
  get(_target, key: string): string | undefined {
    if (!ENV_KEYS.includes(key as EnvKey)) {
      // In dev, surface unknown keys loudly so we catch typos before they
      // reach prod. In prod, silently return undefined to avoid crashing
      // on a refactor mistake.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[env] unknown key "${key}" — add to ENV_KEYS in src/lib/env.ts`)
      }
      return undefined
    }
    return process.env[key]
  },
  // Block writes — any mutation must happen on process.env directly,
  // and only inside test fixtures.
  set() {
    throw new Error('serverEnv is read-only. Mutate process.env directly in test fixtures.')
  },
})
