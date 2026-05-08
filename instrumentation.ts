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

/**
 * Surface uncaught request errors to Sentry. Next 15+ calls this for every
 * unhandled error in a route handler / middleware.
 *
 * Re-exports Sentry.captureRequestError directly: both functions share the
 * Next-defined signature, so there's no manual type bridge to drift under a
 * SDK upgrade. (The CRM PR #7 typecheck originally tripped because we tried
 * to hand-write the wrapper with a `Request` argument; the re-export side-
 * steps the issue entirely.)
 */
export { captureRequestError as onRequestError } from '@sentry/nextjs'
