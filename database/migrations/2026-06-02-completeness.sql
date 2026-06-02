-- Completeness pass (2026-06-02).
--
-- Adds: soft-delete, Sereno (vigia) cross-reference, outreach delivery
-- tracking, draft<->event linkage, and a tag-uniqueness guard.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout,
-- so `npm run migrate` is safe to re-run against fresh or existing databases.

-- 1. Soft-delete leads. Nothing hard-deletes a lead anymore; every read
--    filters `deleted_at IS NULL`. Partial index keeps the live-set scans fast.
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_crm_leads_deleted_at
  ON crm_leads(deleted_at) WHERE deleted_at IS NULL;

-- 2. Sereno (vigia) cross-reference. Set true when a lead's email matches a
--    Sereno customer; synced by scripts/sync-sereno-customers.ts.
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS sereno_customer BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS sereno_checked_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_crm_leads_sereno
  ON crm_leads(sereno_customer) WHERE sereno_customer = true;

-- 3. Outreach delivery tracking. Twilio status callbacks + inbound email
--    update these. We deliberately do NOT extend the crm_outreach_status enum
--    (ALTER TYPE ADD VALUE is awkward inside the migrate runner's implicit
--    transaction); instead we keep the coarse status column and record precise
--    provider timestamps alongside it.
ALTER TABLE crm_outreach_events ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE crm_outreach_events ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE crm_outreach_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE crm_outreach_events ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE crm_outreach_events ADD COLUMN IF NOT EXISTS failed_reason TEXT;
ALTER TABLE crm_outreach_events ADD COLUMN IF NOT EXISTS draft_id UUID;
CREATE INDEX IF NOT EXISTS idx_crm_outreach_events_provider_msg
  ON crm_outreach_events(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- 4. Tag uniqueness: at most one (lead, tag) pair. Makes "add tag" idempotent
--    and lets the tags API rely on ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_tags_lead_tag ON crm_tags(lead_id, tag_name);

-- 5. Link a draft to the outreach event it became when sent (bookkeeping so the
--    drafts queue can show "sent as WhatsApp on <date>").
ALTER TABLE crm_outreach_drafts ADD COLUMN IF NOT EXISTS sent_event_id UUID;
