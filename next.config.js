/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    CRM_PASSWORD: process.env.CRM_PASSWORD,
    DATABASE_URL: process.env.DATABASE_URL,
  },
}

module.exports = nextConfig
