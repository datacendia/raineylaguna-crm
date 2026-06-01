-- CRM Schema for Rainey Laguna
-- Manages 1,000+ SMB leads across Lima's 5 districts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Pipeline stages
DO $$ BEGIN
  CREATE TYPE crm_pipeline_stage AS ENUM (
    'Lead',
    'Contacted',
    'Audited',
    'Proposal',
    'Closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Outreach channels
DO $$ BEGIN
  CREATE TYPE crm_channel AS ENUM (
    'Email',
    'Instagram DM',
    'WhatsApp',
    'LinkedIn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Outreach status
DO $$ BEGIN
  CREATE TYPE crm_outreach_status AS ENUM (
    'Pending',
    'Sent',
    'Opened',
    'Replied',
    'No Response',
    'Not Interested',
    'Interested'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Leads table
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(100),
  district VARCHAR(100) NOT NULL,
  niche VARCHAR(100) NOT NULL,
  category VARCHAR(100),
  instagram_active BOOLEAN DEFAULT true,
  instagram_url TEXT,
  facebook_url TEXT,
  linkedin_url TEXT,
  tiktok_url TEXT,
  google_place_id TEXT,
  website_url VARCHAR(500),
  website_status VARCHAR(50),
  evaluation VARCHAR(100),
  strategic_action TEXT,
  potential TEXT,
  pipeline_stage crm_pipeline_stage DEFAULT 'Lead',
  notes TEXT,
  next_action TEXT,
  snoozed_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Outreach events table
CREATE TABLE IF NOT EXISTS crm_outreach_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  channel crm_channel NOT NULL,
  status crm_outreach_status DEFAULT 'Pending',
  scheduled_for TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tags table
CREATE TABLE IF NOT EXISTS crm_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  tag_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video audits table
CREATE TABLE IF NOT EXISTS crm_video_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  loom_url VARCHAR(500),
  conversion_status VARCHAR(50) DEFAULT 'Pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin users (multi-user auth)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  last_login_at TIMESTAMP WITH TIME ZONE,
  disabled_at TIMESTAMP WITH TIME ZONE,
  totp_secret TEXT,
  totp_enrolled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI-generated outreach drafts (operator reviews/edits before sending)
CREATE TABLE IF NOT EXISTS crm_outreach_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL DEFAULT 'WhatsApp',
  body TEXT NOT NULL,
  model VARCHAR(64),
  prompt_version VARCHAR(32),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acted_at TIMESTAMP WITH TIME ZONE,
  acted_by VARCHAR(255)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_crm_leads_district ON crm_leads(district);
CREATE INDEX IF NOT EXISTS idx_crm_leads_niche ON crm_leads(niche);
CREATE INDEX IF NOT EXISTS idx_crm_leads_email ON crm_leads(email);
CREATE INDEX IF NOT EXISTS idx_crm_leads_phone ON crm_leads(phone);
CREATE INDEX IF NOT EXISTS idx_crm_leads_source ON crm_leads(source);
CREATE INDEX IF NOT EXISTS idx_crm_leads_website_status ON crm_leads(website_status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_pipeline_stage ON crm_leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_crm_leads_evaluation ON crm_leads(evaluation);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_events_lead_id ON crm_outreach_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_events_status ON crm_outreach_events(status);
CREATE INDEX IF NOT EXISTS idx_crm_tags_lead_id ON crm_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_video_audits_lead_id ON crm_video_audits(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_snoozed_until ON crm_leads(snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_outreach_drafts_lead_id ON crm_outreach_drafts(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_drafts_status ON crm_outreach_drafts(status);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE OR REPLACE TRIGGER update_crm_leads_updated_at BEFORE UPDATE ON crm_leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_crm_outreach_events_updated_at BEFORE UPDATE ON crm_outreach_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_crm_video_audits_updated_at BEFORE UPDATE ON crm_video_audits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
