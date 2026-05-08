/**
 * Next.js server + edge instrumentation entrypoint.
 *
 * Initializes Sentry only when SENTRY_DSN is set, so deployments without a
 * DSN ship unchanged. Server-side DSN (SENTRY_DSN) is intentionally
 * separate from the client (NEXT_PUBLIC_SENTRY_DSN) so the public bundle
 * can never accidentally include a server-only DSN.
 *
 * Mirrors vigiaV2/instrumentation.ts. Per rainey-stack/CONVENTIONS.md §13.5.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment:
        process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
      release: process.env.SENTRY_RELEASE,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment:
        process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
      release: process.env.SENTRY_RELEASE,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    })
  }
}

// Note: onRequestError() can also be exported here to forward Next's
// unhandled-error hook into Sentry.captureRequestError. We deferred it
// because the Sentry 10.x captureRequestError signature collides with
// Next 16's `Request` type under strict TS. The default Sentry global
// error handlers still capture every unhandled exception inside route
// handlers, so we lose nothing by omitting this hook.
