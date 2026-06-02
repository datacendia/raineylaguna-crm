-- On-demand AI pitch demos per lead.
--
-- Each row is one generated, self-contained HTML artifact (a branded demo /
-- mockup) tailored to a lead's `potential` (service type). Versioned: a new
-- generation inserts a new row; the digest / view page reads the latest by
-- created_at. Cascades on lead delete.

CREATE TABLE IF NOT EXISTS crm_lead_pitches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  potential TEXT,
  service_key TEXT,
  service_url TEXT,
  html TEXT NOT NULL,
  model TEXT,
  prompt_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Latest-pitch-per-lead lookups (digest cell + view page).
CREATE INDEX IF NOT EXISTS idx_lead_pitches_lead_created
  ON crm_lead_pitches (lead_id, created_at DESC);
