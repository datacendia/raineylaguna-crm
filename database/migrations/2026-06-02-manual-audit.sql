-- 2026-06-02-manual-audit.sql
-- Manual "Website Audit Workbench": a deep, human-driven audit that complements
-- the automated digital_health_score. Stored per lead as a single editable
-- snapshot, populated by /dashboard/leads/[id]/audit-workbench via the
-- /api/leads/[id]/manual-audit route.
--   manual_audit       : jsonb { version, profile, region, presenceOnly,
--                          essentialsOnly, weights{}, engagement{client,url,
--                          auditor,date}, items{ id -> {state,note} },
--                          overall, scored, scope }
--   manual_audit_score : 0-100 weighted overall, recomputed server-side on save
--                          (HIGHER = healthier; null until any line is scored)
--   manual_audited_at  : last time the workbench was saved for this lead

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS manual_audit JSONB;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS manual_audit_score SMALLINT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS manual_audited_at TIMESTAMPTZ;
