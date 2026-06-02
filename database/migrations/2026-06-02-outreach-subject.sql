-- Persist the per-template email subject on each outreach event.
--
-- Why: batch sends moved off the always-on BullMQ worker onto a near-free
-- cron-drain (scripts/outreach-drain.ts) that delivers straight from the
-- crm_outreach_events rows. The worker used to carry the tailored subject in
-- its BullMQ job payload; with the DB-driven drain we must store it on the
-- event itself, otherwise personalised subjects (e.g.
-- "<Lead>: auditoría breve de su sitio web") would be lost and every batch
-- email would fall back to the generic default in src/lib/outreach-send.ts.
--
-- Idempotent: ADD COLUMN / CREATE INDEX IF NOT EXISTS — safe to re-run.

ALTER TABLE crm_outreach_events ADD COLUMN IF NOT EXISTS subject TEXT;

-- The drain repeatedly selects the oldest due, not-yet-attempted Pending
-- event. A partial index keeps that hot-path scan cheap as the events table
-- grows (only un-sent, un-failed rows are indexed).
CREATE INDEX IF NOT EXISTS idx_crm_outreach_events_due
  ON crm_outreach_events (scheduled_for)
  WHERE status = 'Pending' AND failed_reason IS NULL;
