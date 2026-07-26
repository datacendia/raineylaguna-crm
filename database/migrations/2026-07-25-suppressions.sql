-- 2026-07-25-suppressions.sql
-- Do-not-contact list.
--
-- Until this existed there was no way to record that someone asked not to be
-- contacted, and no send path checked for one. A prospect replying "BAJA" on
-- WhatsApp or "unsubscribe" by email had no effect: the reply was not parsed,
-- nothing was stored, and the next scheduled send went out regardless.
--
-- Matching is by contact point (email / phone), not by lead, deliberately:
-- the same person can appear on several lead rows (duplicate imports, a chain
-- of branches sharing one mobile), and an opt-out must silence all of them.
-- lead_id is recorded for provenance only.
--
-- Idempotent: additive, IF NOT EXISTS throughout, and the unique indexes make
-- re-suppressing the same contact a no-op rather than an error.

CREATE TABLE IF NOT EXISTS crm_suppressions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Normalised at write time by src/lib/suppression.ts: email lowercased and
  -- trimmed, phone reduced to digits — the same normalisation crm_leads uses,
  -- so a suppression written from a webhook matches a lead stored from intake.
  email       VARCHAR(255),
  phone       VARCHAR(50),
  -- Why they are suppressed: 'opt_out' (they asked), 'bounce' (undeliverable),
  -- 'complaint' (marked as spam), 'manual' (operator judgement).
  reason      VARCHAR(32) NOT NULL DEFAULT 'opt_out',
  -- Where it came from: 'whatsapp', 'email', 'operator', 'api'.
  source      VARCHAR(32) NOT NULL DEFAULT 'operator',
  -- Provenance only — never used for matching.
  lead_id     UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  -- Verbatim inbound text that triggered it, for a compliance audit trail.
  note        TEXT,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- A row that identifies nobody would silently suppress nothing.
  CONSTRAINT crm_suppressions_has_contact
    CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- One active suppression per contact point. Partial so NULLs don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_suppressions_email
  ON crm_suppressions (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_suppressions_phone
  ON crm_suppressions (phone) WHERE phone IS NOT NULL;

-- The hot path is "is this contact suppressed?" immediately before every send,
-- so both lookups must be index-only.
CREATE INDEX IF NOT EXISTS idx_crm_suppressions_created_at
  ON crm_suppressions (created_at DESC);
