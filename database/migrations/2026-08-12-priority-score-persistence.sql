-- 2026-08-12-priority-score-persistence.sql
-- Store the priority score instead of recomputing it in the browser.
--
-- Today the score exists only for as long as a page is open: the leads list,
-- the dashboard and the digest each call computePriorityScore() at render time
-- and throw the result away. Three things follow from that, all bad.
--
--   1. It is not reproducible. Nobody can answer "why was this lead Crítico in
--      June?" — the weights may have changed, the lead's own fields certainly
--      have (recency decays daily), and no trace was kept.
--   2. It cannot be validated. The 75/55/35 bands were never checked against
--      an outcome, and never can be while the score of the moment a lead was
--      worked is unrecoverable. Persisting the score is the precondition for
--      ever asking "did the model pick winners?"
--   3. Server and client disagree silently. CRM_PRIORITY_WEIGHTS is a
--      server-only var, so the browser always scores with defaults while the
--      digest and cron score with overrides. Nothing records which was used.
--
-- The version stamp is what makes (1) and (3) answerable: it is a hash of the
-- weights actually in force at compute time, so a score can always be traced
-- to the configuration that produced it, and a weights change is visible as a
-- version change rather than as an unexplained score movement.
--
-- Idempotent: additive, IF NOT EXISTS, no backfill. Every row stays unscored
-- until the scorer writes to it — an invented score would be indistinguishable
-- from a computed one, which is the exact failure this migration exists to end.

-- Final affordability-adjusted score (0-100), as displayed and sorted.
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS priority_score SMALLINT;
-- Crítico | Alto | Medio | Bajo, at the time of scoring.
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS priority_band VARCHAR(16);
-- { recency, website, niche, workability, base, geoFactor } — the component
-- split, so a score can be explained after the fact without re-deriving it
-- from fields that have since moved.
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS priority_breakdown JSONB;
-- Hash of the weights in force when this score was computed. Changes whenever
-- CRM_PRIORITY_WEIGHTS or the defaults change.
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS priority_weights_version VARCHAR(32);
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS priority_scored_at TIMESTAMPTZ;

COMMENT ON COLUMN crm_leads.priority_weights_version IS
  'Hash of the PriorityWeights in force at compute time. A score with a stale version was produced by a configuration that is no longer active.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_leads_priority_score_range'
  ) THEN
    ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_priority_score_range
      CHECK (priority_score IS NULL OR (priority_score >= 0 AND priority_score <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_leads_priority_band_valid'
  ) THEN
    ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_priority_band_valid
      CHECK (priority_band IS NULL OR priority_band IN ('Crítico', 'Alto', 'Medio', 'Bajo'));
  END IF;
END
$$;

-- The queue read is "highest score first", and the rescore sweep needs to find
-- rows scored under a superseded weights version.
CREATE INDEX IF NOT EXISTS idx_crm_leads_priority_score
  ON crm_leads (priority_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_leads_priority_weights_version
  ON crm_leads (priority_weights_version)
  WHERE priority_weights_version IS NOT NULL;
