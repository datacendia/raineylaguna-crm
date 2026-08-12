/** @type {import('next').NextConfig} */

/**
 * Security headers.
 *
 * The CRM holds the auth cookie and ~1,000 businesses' contact data, so it
 * should not be less hardened than the public marketing site — which already
 * ships a full set while this app shipped none.
 *
 * The Content-Security-Policy is deliberately NOT here. It carries a
 * per-request nonce, so it is issued from src/proxy.ts instead; see the
 * comment there. Sending a second, static CSP from this file would not add
 * defence — the browser intersects multiple CSP headers, so the static one
 * would cancel the nonce out and re-break hydration.
 *
 * X-Frame-Options already covers framing for every route, including the ones
 * outside the proxy matcher.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  // Keys listed under `env` are inlined into the JavaScript bundle wherever
  // they are referenced, which puts them within reach of the browser.
  // DATABASE_URL and the long-deprecated CRM_PASSWORD were both listed here.
  // Server code reads process.env directly and never needed the mapping, so
  // the only thing it bought was the risk that a single stray
  // `process.env.DATABASE_URL` in a client component would ship database
  // credentials to every visitor. Only genuinely public values belong here.
  env: {
    // Surface the deployed commit to /api/health and the client bundle.
    // Railway injects RAILWAY_GIT_COMMIT_SHA at build + runtime for
    // repo-linked services; the health route also reads it at runtime.
    NEXT_PUBLIC_GIT_SHA:
      process.env.NEXT_PUBLIC_GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

module.exports = nextConfig
