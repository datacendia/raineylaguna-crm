-- 2026-06-19-multi-city.sql
-- Multi-market support: tag every lead with the city/market it belongs to.
-- All existing rows are Lima, so the column defaults + backfills to 'Lima'.
-- The market registry (src/lib/markets.ts) owns each city's districts,
-- affordability tiers, and discovery bounding box. Idempotent.

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS city VARCHAR(100) NOT NULL DEFAULT 'Lima';
CREATE INDEX IF NOT EXISTS crm_leads_city_idx ON crm_leads (city);
