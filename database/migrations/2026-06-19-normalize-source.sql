-- 2026-06-19-normalize-source.sql
-- Backfill crm_leads.source into the canonical lead-source vocabulary defined
-- in src/lib/lead-source.ts (ROADMAP #13), so the dashboard's Source filter,
-- CSV export, and any future source grouping all read the same buckets.
--
-- Idempotent: every canonical value maps to itself, so re-running is a no-op.
-- NULL / empty sources are left untouched (the dashboard treats them as
-- 'other' at read time via normalizeSource). Keep this mapping in step with
-- normalizeSource() in src/lib/lead-source.ts.

UPDATE crm_leads SET source = CASE
  WHEN source ILIKE '%audit%'                                   THEN 'audit'
  WHEN source ILIKE '%whatsapp%' OR lower(source) = 'wa'        THEN 'whatsapp'
  WHEN source ILIKE '%contact%'                                 THEN 'contact-form'
  WHEN source ILIKE '%proto%'                                   THEN 'proto'
  WHEN source ILIKE '%places%' OR source ILIKE '%discover%'
       OR source ILIKE '%google%'                               THEN 'discovery'
  WHEN source ILIKE '%import%' OR source ILIKE '%csv%'
       OR source ILIKE '%bulk%'                                 THEN 'import'
  WHEN source ILIKE '%referr%'                                  THEN 'referral'
  WHEN source ILIKE '%event%'                                   THEN 'event'
  ELSE 'other'
END
WHERE source IS NOT NULL AND source <> '';
