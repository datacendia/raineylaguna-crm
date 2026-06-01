-- 2026-06-01-lead-address.sql
-- Adds crm_leads.address: the business's formatted street address from Google
-- Places (formattedAddress). Discovery (scripts/discover-places.ts) now requests
-- and stores it for new leads; existing rows are filled by
-- scripts/backfill-addresses.ts (Place Details).

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS address TEXT;
