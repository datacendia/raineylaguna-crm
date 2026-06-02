/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    CRM_PASSWORD: process.env.CRM_PASSWORD,
    DATABASE_URL: process.env.DATABASE_URL,
    // Surface the deployed commit to /api/health and the client bundle.
    // Railway injects RAILWAY_GIT_COMMIT_SHA at build + runtime for
    // repo-linked services; the health route also reads it at runtime.
    NEXT_PUBLIC_GIT_SHA:
      process.env.NEXT_PUBLIC_GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA,
  },
}

module.exports = nextConfig
