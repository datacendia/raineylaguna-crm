/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    CRM_PASSWORD: process.env.CRM_PASSWORD,
    DATABASE_URL: process.env.DATABASE_URL,
  },
}

module.exports = nextConfig
