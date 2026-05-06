-- 2026-05-06-snooze-next-action.sql
-- Adds next_action + snoozed_until to crm_leads. ROADMAP item 4.
--
-- next_action:    short imperative the operator should do next
--                 ("Send audit video", "Follow up after Loom").
-- snoozed_until:  hide from default leads list until this date. Anything
--                 NULL or in the past = active. Operator can flip back early.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS next_action   TEXT,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMP WITH TIME ZONE;

-- Index used by the default leads list (active = snoozed_until IS NULL OR <= NOW())
-- and by the digest "snooze ended today" query.
CREATE INDEX IF NOT EXISTS idx_crm_leads_snoozed_until
  ON crm_leads(snoozed_until)
  WHERE snoozed_until IS NOT NULL;
