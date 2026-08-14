-- 2026-08-12-deals-and-outcomes.sql
-- Commercial outcomes: the missing half of the data model.
--
-- Until this existed the CRM could record that a lead was interesting but never
-- that it became a customer, what it was worth, or when it stopped being one.
-- crm_leads holds 39 columns and not one of them is money, contract term, or a
-- cancellation. The consequence is that LTV, churn, retention, ARPA, CAC and
-- win rate were not merely unreported — they were uncomputable, and could not
-- be retrofitted from history either, because no outcome was ever written down.
--
-- Two tables rather than one, deliberately:
--
--   crm_deals        current state of a commercial relationship. One row per
--                    deal, mutated in place as it progresses.
--   crm_deal_events  append-only log of what happened and when. Never updated,
--                    never deleted.
--
-- The split is what makes retention answerable. A cohort curve is a question
-- about the past ("of the deals that started in June, how many were still
-- paying in September?"), and a table that only holds current state cannot
-- answer it — by the time you ask, the row says 'churned' and the month it
-- happened is gone. The event log is the source of truth for anything
-- time-shaped; crm_deals is the fast path for "what is true right now".
--
-- Money is stored in minor units (cents) as BIGINT, never as float or numeric
-- with implied scale. Repeated float arithmetic across a cohort matrix drifts,
-- and currency here is mixed: the base spans Lima, Boston, Glasgow, Los
-- Angeles, Bogotá and Buenos Aires, so every amount carries its own currency
-- and cross-currency aggregation is the model's problem to refuse, not the
-- schema's to silently average.
--
-- Idempotent: additive, IF NOT EXISTS throughout. Adds no defaults that would
-- invent an outcome for an existing lead — every one of the 36,809 rows stays
-- correctly outcome-less until someone records one.

-- ---------------------------------------------------------------------------
-- Deals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_deals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id       UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,

  -- open    : in negotiation, no outcome yet
  -- won     : signed; closed_at set
  -- lost    : did not close; closed_at set
  -- churned : was won, then cancelled; churned_at set
  status        VARCHAR(16) NOT NULL DEFAULT 'open',

  -- One-off contract value (the build fee). NULL means "not yet known", which
  -- is different from 0 ("free"), and the models treat them differently.
  amount_cents  BIGINT,
  -- Recurring component, normalised to a MONTHLY figure regardless of how it
  -- is billed. An annual plan is stored here as its monthly twelfth so that
  -- MRR is a straight sum and never needs a per-row divisor.
  mrr_cents     BIGINT,
  currency      CHAR(3) NOT NULL DEFAULT 'PEN',
  -- How the customer is actually invoiced. Informational: mrr_cents is already
  -- normalised, so no model divides by this.
  billing_period VARCHAR(16) NOT NULL DEFAULT 'one_time',

  -- Contract term. contract_start is the cohort key — the month a paying
  -- relationship began — and is what retention curves are bucketed by.
  contract_start DATE,
  contract_end   DATE,

  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  churned_at    TIMESTAMPTZ,
  churn_reason  TEXT,

  -- Attribution. crm_leads.source records where the row was scraped from,
  -- which is not the same as what caused the sale; 36,141 of 36,809 rows say
  -- 'discovery', so lead source alone can attribute nothing.
  channel       VARCHAR(32),
  -- Cost side, for CAC and payback. Optional: absent means those models report
  -- insufficient data rather than assuming acquisition was free.
  acquisition_cost_cents BIGINT,

  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT crm_deals_status_valid
    CHECK (status IN ('open', 'won', 'lost', 'churned')),
  CONSTRAINT crm_deals_billing_period_valid
    CHECK (billing_period IN ('one_time', 'monthly', 'annual')),
  -- A closed deal that cannot say when it closed makes win-rate-over-time and
  -- sales-cycle length unanswerable, so the schema refuses one.
  CONSTRAINT crm_deals_closed_has_date
    CHECK (status NOT IN ('won', 'lost') OR closed_at IS NOT NULL),
  -- Likewise churn: the date IS the measurement. A churned row without one is
  -- invisible to every retention curve.
  CONSTRAINT crm_deals_churned_has_date
    CHECK (status <> 'churned' OR churned_at IS NOT NULL),
  -- Churn is a transition out of won, so a churned deal must have closed first.
  CONSTRAINT crm_deals_churned_was_closed
    CHECK (status <> 'churned' OR closed_at IS NOT NULL),
  CONSTRAINT crm_deals_amount_non_negative
    CHECK (amount_cents IS NULL OR amount_cents >= 0),
  CONSTRAINT crm_deals_mrr_non_negative
    CHECK (mrr_cents IS NULL OR mrr_cents >= 0),
  CONSTRAINT crm_deals_cost_non_negative
    CHECK (acquisition_cost_cents IS NULL OR acquisition_cost_cents >= 0),
  CONSTRAINT crm_deals_term_ordered
    CHECK (contract_end IS NULL OR contract_start IS NULL OR contract_end >= contract_start)
);

-- Cohort bucketing and "who is live right now" are the two hot reads.
CREATE INDEX IF NOT EXISTS idx_crm_deals_lead_id ON crm_deals (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_status ON crm_deals (status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_contract_start ON crm_deals (contract_start)
  WHERE contract_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_deals_closed_at ON crm_deals (closed_at)
  WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_deals_churned_at ON crm_deals (churned_at)
  WHERE churned_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Deal lifecycle events (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_deal_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id     UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,

  -- opened      : deal created
  -- won         : signed
  -- lost        : did not close
  -- renewed     : term extended at the same value
  -- expanded    : recurring value went up   (mrr_delta_cents > 0)
  -- contracted  : recurring value went down (mrr_delta_cents < 0)
  -- churned     : relationship ended
  -- reactivated : a churned customer came back
  event_type  VARCHAR(24) NOT NULL,

  -- When it happened in the real world, which is not when the row was written.
  -- Backfilled history will have occurred_at far behind created_at, and every
  -- time-shaped model reads occurred_at.
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Signed change to monthly recurring value at this event. Expansion is
  -- positive, contraction negative, churn the negative of the whole MRR.
  -- Summing this column in occurred_at order reconstructs MRR at any past
  -- date — which is what makes net revenue retention computable.
  mrr_delta_cents BIGINT,
  -- One-off value recognised at this event, if any.
  amount_cents    BIGINT,

  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT crm_deal_events_type_valid
    CHECK (event_type IN (
      'opened', 'won', 'lost', 'renewed',
      'expanded', 'contracted', 'churned', 'reactivated'
    )),
  -- An expansion that does not say how much it expanded by is not an
  -- observation, and would silently contribute nothing to an NRR figure that
  -- looks complete.
  CONSTRAINT crm_deal_events_movement_has_delta
    CHECK (event_type NOT IN ('expanded', 'contracted') OR mrr_delta_cents IS NOT NULL),
  CONSTRAINT crm_deal_events_expansion_positive
    CHECK (event_type <> 'expanded' OR mrr_delta_cents > 0),
  CONSTRAINT crm_deal_events_contraction_negative
    CHECK (event_type <> 'contracted' OR mrr_delta_cents < 0)
);

-- Every model walks a deal's events in time order.
CREATE INDEX IF NOT EXISTS idx_crm_deal_events_deal_occurred
  ON crm_deal_events (deal_id, occurred_at);
-- Period rollups (MRR movement for a month) scan by time across all deals.
CREATE INDEX IF NOT EXISTS idx_crm_deal_events_occurred_at
  ON crm_deal_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_crm_deal_events_type
  ON crm_deal_events (event_type);

-- Keep updated_at honest on crm_deals, matching the trigger the base schema
-- installs on crm_leads.
CREATE OR REPLACE FUNCTION set_crm_deals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_deals_updated_at ON crm_deals;
CREATE TRIGGER trg_crm_deals_updated_at
  BEFORE UPDATE ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION set_crm_deals_updated_at();
