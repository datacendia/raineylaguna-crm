-- Add structured social-profile columns to crm_leads.
-- Populated by scripts/enrich-contact.ts (Facebook / LinkedIn / TikTok)
-- alongside the existing instagram_url and email columns.
-- Idempotent: safe to run repeatedly.

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS facebook_url TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS tiktok_url TEXT;
