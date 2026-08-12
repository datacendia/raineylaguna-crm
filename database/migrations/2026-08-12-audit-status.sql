-- 2026-08-12-audit-status.sql
-- Separate "we measured this site and it is bad" from "we failed to measure it".
--
-- digital_health_score is documented as a 0-100 measurement, but computeHealth
-- returns three literals for the cases where nothing was measured at all:
--
--   social_only      -> 15   (2,929 rows, all exactly 15)
--   site_unreachable -> 10   (1,498 rows, all exactly 10)
--   no PageSpeed     -> 50   (1,772 rows, the "heuristics only" placeholder)
--
-- That is 6,199 of 12,515 audited leads — half — whose score is a constant
-- standing in for an absent observation. The priority model then reads those
-- constants as if they were measurements, and because it scores opportunity as
-- (1 - health/100), a crawler timeout scores 27/30 while a genuinely dreadful
-- measured site at 35 scores 20/30. Failure-to-audit outranks measured badness,
-- so the top of the queue is substantially a ranking of crawler failures.
--
-- The fix is to make absence representable instead of encoding it as a number.
-- audit_status says which of those worlds a row is in, and the priority model
-- can then decline to treat an unmeasured site as a maximum-opportunity one.
--
-- digital_health_score is deliberately left in place and unchanged. It is read
-- by the leads list, the digest, the analytics page and the outreach drafter;
-- nulling it here would blank all of them in one deploy. audit_status is
-- additive, and callers move across as they are updated.
--
-- Idempotent: additive, IF NOT EXISTS. The backfill is derived purely from
-- audit_findings already on the row, sets only rows still NULL, and so is safe
-- to re-run.

-- measured     : a real observation (PageSpeed and/or homepage heuristics)
-- unreachable  : the crawler got nothing back — may be a dead site, may be a
--                bot block or rate limit, and the two are indistinguishable
--                from here
-- social_only  : no real website, only a social profile (a genuine finding)
-- no_website   : no website at all (a genuine finding)
-- not_audited  : never attempted
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS audit_status VARCHAR(16);

-- How much of the score rests on real measurement rather than heuristics:
--   'pagespeed'  : Lighthouse categories present
--   'heuristics' : homepage HTML only — no performance or SEO signal at all
--   'none'       : nothing measured
-- 67% of audited rows are heuristics-only, which the single score never showed.
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS audit_confidence VARCHAR(16);

COMMENT ON COLUMN crm_leads.audit_status IS
  'Which world the audit landed in: measured | unreachable | social_only | no_website | not_audited. Absence of a measurement, not a number standing in for one.';
COMMENT ON COLUMN crm_leads.audit_confidence IS
  'Basis of the score: pagespeed | heuristics | none.';

-- Backfill from what each row already recorded in audit_findings. Nothing is
-- inferred: every branch below reads a flag or field the audit itself wrote.
UPDATE crm_leads
SET audit_status = CASE
      WHEN audited_at IS NULL AND audit_findings IS NULL THEN 'not_audited'
      WHEN audit_findings @> '{"hadSite": false}' THEN 'no_website'
      WHEN audit_findings -> 'flags' @> '[{"id": "social_only"}]' THEN 'social_only'
      WHEN audit_findings -> 'flags' @> '[{"id": "site_unreachable"}]' THEN 'unreachable'
      WHEN audit_findings @> '{"reachable": false}' THEN 'unreachable'
      ELSE 'measured'
    END
WHERE audit_status IS NULL;

-- A row counts as pagespeed-backed only if at least one Lighthouse category
-- actually came back non-null.
UPDATE crm_leads
SET audit_confidence = CASE
      WHEN audit_status IN ('not_audited', 'unreachable') THEN 'none'
      WHEN audit_status IN ('no_website', 'social_only') THEN 'none'
      WHEN (audit_findings -> 'scores' ->> 'performance')   IS NOT NULL
        OR (audit_findings -> 'scores' ->> 'seo')           IS NOT NULL
        OR (audit_findings -> 'scores' ->> 'accessibility') IS NOT NULL
        OR (audit_findings -> 'scores' ->> 'bestPractices') IS NOT NULL
        THEN 'pagespeed'
      ELSE 'heuristics'
    END
WHERE audit_confidence IS NULL;

-- ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so guard on the catalogue —
-- otherwise MIGRATE_REPLAY=1 would fail here rather than being a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_leads_audit_status_valid'
  ) THEN
    ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_audit_status_valid
      CHECK (audit_status IS NULL OR audit_status IN
        ('measured', 'unreachable', 'social_only', 'no_website', 'not_audited'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_leads_audit_confidence_valid'
  ) THEN
    ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_audit_confidence_valid
      CHECK (audit_confidence IS NULL OR audit_confidence IN
        ('pagespeed', 'heuristics', 'none'));
  END IF;
END
$$;

-- "Which leads need re-auditing?" and "how much of the base is measured?" are
-- both status scans over 36,809 rows.
CREATE INDEX IF NOT EXISTS idx_crm_leads_audit_status ON crm_leads (audit_status);
-- Staleness sweep: 75% of audits are over 60 days old and nothing re-queues
-- them. This is the index the TTL sweep will read.
CREATE INDEX IF NOT EXISTS idx_crm_leads_audited_at ON crm_leads (audited_at)
  WHERE audited_at IS NOT NULL;
