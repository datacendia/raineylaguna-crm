/**
 * Sentry browser-SDK initialization for the CRM.
 *
 * Loaded by Next.js into the client bundle. Initializes Sentry only when
 * NEXT_PUBLIC_SENTRY_DSN is set; otherwise the SDK no-ops, so the dashboard
 * ships unchanged when no DSN is configured.
 *
 * DSNs are public by design (https://docs.sentry.io/concepts/key-terms/dsn-explainer/),
 * so it's fine to inline NEXT_PUBLIC_SENTRY_DSN into the client bundle.
 *
 * Mirrors vigiaV2/instrumentation-client.ts. Per rainey-stack/CONVENTIONS.md §13.5.
 */

import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.NODE_ENV ??
      'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: 0.2,
    // Session Replay disabled by default — opt in per-incident only,
    // since the CRM dashboard handles lead PII and outreach drafts.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}
