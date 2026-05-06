-- Adds the columns that the marketing site (`raineylaguna-next`) has been
-- sending all along but the CRM has been silently dropping. Run once against
-- existing databases:
--
--   SCHEMA_PATH=database/migrations/2026-05-06-public-lead-intake.sql npm run migrate
--
-- Idempotent — safe to rerun.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS email  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_crm_leads_email  ON crm_leads(email);
CREATE INDEX IF NOT EXISTS idx_crm_leads_phone  ON crm_leads(phone);
CREATE INDEX IF NOT EXISTS idx_crm_leads_source ON crm_leads(source);

-- Best-effort: extract phones already buried in `notes` (legacy intake mode).
-- Looks for the first sequence of 9 digits, optionally with +51/51 prefix and
-- separators; copies into the new `phone` column when phone is null.
UPDATE crm_leads
SET phone = (
  SELECT regexp_replace(m[1], '\D', '', 'g')
  FROM regexp_matches(
    notes,
    '(?:\+?51[\s-]?)?(\d[\d\s-]{8,14}\d)',
    'g'
  ) AS m
  LIMIT 1
)
WHERE phone IS NULL
  AND notes IS NOT NULL
  AND notes ~ '\d{9,}';
