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

  // Build / runtime metadata
  'NEXT_PUBLIC_GIT_SHA', // /api/health surfaces this as `version`; falls back to 'unknown'
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
