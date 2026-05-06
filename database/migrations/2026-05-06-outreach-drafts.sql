-- 2026-05-06-outreach-drafts.sql
-- Adds crm_outreach_drafts: AI-generated personalized outreach messages per
-- lead. Operators review and send (or edit) before they go out — drafts are
-- not auto-sent. ROADMAP item 12.

CREATE TABLE IF NOT EXISTS crm_outreach_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL DEFAULT 'WhatsApp',
  body TEXT NOT NULL,
  model VARCHAR(64),
  prompt_version VARCHAR(32),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | discarded
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acted_at TIMESTAMP WITH TIME ZONE,
  acted_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_crm_outreach_drafts_lead_id
  ON crm_outreach_drafts(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_drafts_status
  ON crm_outreach_drafts(status);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_drafts_lead_pending
  ON crm_outreach_drafts(lead_id, generated_at DESC)
  WHERE status = 'pending';
