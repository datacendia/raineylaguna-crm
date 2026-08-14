-- 2026-08-13-measurement-maturity.sql
-- Sonda: measurement maturity scoring for each lead.
--
-- Detection runs headless against the existing base, so every lead can carry a
-- score before anyone is contacted. Populated by scripts/audit-sites.ts (which
-- already fetches the homepage HTML — measurement signals are read from that
-- same fetch, no second crawl) and scored by src/lib/measurement.ts.
--
--   maturity_score      : 0-100. Provisional until the questionnaire is answered.
--   maturity_band       : ciego / instalado / midiendo / optimizando
--   maturity_coverage   : 0-1, share of signals we could actually evaluate.
--                         LOW COVERAGE INVALIDATES THE SCORE — a site that
--                         blocks us is not a site without analytics, and this
--                         column is what stops the two being confused.
--   maturity_unreadable : fetch failure reason when the site could not be read.
--                         NULL means we read it. Never treat a row with this
--                         set as a genuine zero.
--   dimension_scores    : jsonb [{ id, points, checked, checkable }]
--   declared_responses  : jsonb, the 8 questionnaire answers (nullable)
--   detection_run_at / report_generated_at : timestamps

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS maturity_score SMALLINT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS maturity_band VARCHAR(16);
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS maturity_coverage REAL;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS maturity_unreadable VARCHAR(16);
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS dimension_scores JSONB;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS declared_responses JSONB;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS detection_run_at TIMESTAMPTZ;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS report_generated_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_maturity_band_chk
    CHECK (maturity_band IS NULL OR maturity_band IN ('ciego','instalado','midiendo','optimizando'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_maturity_score_chk
    CHECK (maturity_score IS NULL OR (maturity_score >= 0 AND maturity_score <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ranking prospects: lowest scorers with real budget signals are the best
-- targets, so the index is ascending on score and excludes anything we could
-- not actually read.
CREATE INDEX IF NOT EXISTS idx_crm_leads_maturity
  ON crm_leads (maturity_score ASC NULLS LAST)
  WHERE maturity_unreadable IS NULL;

-- New pipeline stage between Audited and Proposal.
DO $$ BEGIN
  ALTER TYPE crm_pipeline_stage ADD VALUE IF NOT EXISTS 'Diagnosed' AFTER 'Audited';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- The gap that has nothing to do with Sonda, and everything to do with pricing
-- ---------------------------------------------------------------------------
-- `pipeline_stage` ends at 'Closed' with no won/lost distinction, and no quote
-- amount is recorded anywhere. That means no question about price can currently
-- be answered from data: not "what does this market bear", not "which maturity
-- band converts best", not "is the district-tier model right". Every price in
-- the Sonda spec is a guess for exactly this reason.
--
-- These two columns are what turn the next six months of quoting into evidence.
DO $$ BEGIN
  CREATE TYPE crm_outcome AS ENUM ('won','lost','no_response');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS outcome crm_outcome;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS quote_amount NUMERIC(10,2);
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS quote_currency VARCHAR(3) DEFAULT 'PEN';
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_quote_amount_chk
    CHECK (quote_amount IS NULL OR quote_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN crm_leads.maturity_coverage IS
  'Share of measurement signals actually evaluated (0-1). Low coverage invalidates maturity_score.';
COMMENT ON COLUMN crm_leads.maturity_unreadable IS
  'Fetch failure reason. NON-NULL means the site was never read - the score is not a real zero.';
COMMENT ON COLUMN crm_leads.quote_amount IS
  'Amount quoted, for price-conversion analysis. Without this, pricing stays guesswork.';
