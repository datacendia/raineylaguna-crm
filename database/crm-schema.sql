-- CRM Schema for Rainey Laguna
-- Manages 1,000+ SMB leads across Lima's 5 districts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Pipeline stages
CREATE TYPE crm_pipeline_stage AS ENUM (
  'Lead',
  'Contacted',
  'Audited',
  'Proposal',
  'Closed'
);

-- Outreach channels
CREATE TYPE crm_channel AS ENUM (
  'Email',
  'Instagram DM',
  'WhatsApp',
  'LinkedIn'
);

-- Outreach status
CREATE TYPE crm_outreach_status AS ENUM (
  'Pending',
  'Sent',
  'Opened',
  'Replied',
  'No Response',
  'Not Interested',
  'Interested'
);

-- Leads table
CREATE TABLE crm_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(100),
  district VARCHAR(100) NOT NULL,
  niche VARCHAR(100) NOT NULL,
  category VARCHAR(100),
  instagram_active BOOLEAN DEFAULT true,
  website_url VARCHAR(500),
  website_status VARCHAR(50),
  evaluation VARCHAR(100),
  strategic_action TEXT,
  potential TEXT,
  pipeline_stage crm_pipeline_stage DEFAULT 'Lead',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Outreach events table
CREATE TABLE crm_outreach_events (
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
CREATE TABLE crm_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  tag_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video audits table
CREATE TABLE crm_video_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  loom_url VARCHAR(500),
  conversion_status VARCHAR(50) DEFAULT 'Pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin users (multi-user auth)
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  last_login_at TIMESTAMP WITH TIME ZONE,
  disabled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_crm_leads_district ON crm_leads(district);
CREATE INDEX idx_crm_leads_niche ON crm_leads(niche);
CREATE INDEX idx_crm_leads_email ON crm_leads(email);
CREATE INDEX idx_crm_leads_phone ON crm_leads(phone);
CREATE INDEX idx_crm_leads_source ON crm_leads(source);
CREATE INDEX idx_crm_leads_website_status ON crm_leads(website_status);
CREATE INDEX idx_crm_leads_pipeline_stage ON crm_leads(pipeline_stage);
CREATE INDEX idx_crm_leads_evaluation ON crm_leads(evaluation);
CREATE INDEX idx_crm_outreach_events_lead_id ON crm_outreach_events(lead_id);
CREATE INDEX idx_crm_outreach_events_status ON crm_outreach_events(status);
CREATE INDEX idx_crm_tags_lead_id ON crm_tags(lead_id);
CREATE INDEX idx_crm_video_audits_lead_id ON crm_video_audits(lead_id);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_crm_leads_updated_at BEFORE UPDATE ON crm_leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_outreach_events_updated_at BEFORE UPDATE ON crm_outreach_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_video_audits_updated_at BEFORE UPDATE ON crm_video_audits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
