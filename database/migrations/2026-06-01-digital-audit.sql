-- 2026-06-01-digital-audit.sql
-- Digital Presence Audit: quantifies each lead's web presence so outreach can
-- cite concrete, real flaws instead of generic pitches. Populated by
-- scripts/audit-sites.ts (Google PageSpeed Insights + homepage HTML
-- heuristics) and the on-demand /api/leads/[id]/audit route.
--   digital_health_score : 0-100 composite, HIGHER = healthier site
--                          (lower = bigger sales opportunity)
--   audit_findings        : jsonb { score, hadSite, reachable, scores{},
--                          metrics{}, flags[], summary }
--   audited_at            : last time the audit ran for this lead

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS digital_health_score SMALLINT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS audit_findings JSONB;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS audited_at TIMESTAMPTZ;
