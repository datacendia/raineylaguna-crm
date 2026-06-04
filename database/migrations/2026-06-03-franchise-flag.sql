-- Franchise / chain detection.
--
-- Adds is_chain + chain_key and populates them so the dashboard can separate
-- the sellable independents a boutique studio can actually win from corporate
-- storefronts (OXXO, Tambo, Mass, …) whose web presence is decided at HQ, plus
-- obvious placeholder rows. This is what collapses the inflated headline lead
-- count into a real addressable universe.
--
-- Additive and idempotent: ADD COLUMN IF NOT EXISTS, and the UPDATEs re-apply
-- the same deterministic rules on every run (safe as a deploy hook). NOTE: this
-- only ever SETS is_chain = true; if you manually clear a false positive, also
-- fix the rule that caught it (e.g. correct the shared phone) so the next run
-- doesn't re-flag it.

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS is_chain boolean NOT NULL DEFAULT false;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS chain_key text;
CREATE INDEX IF NOT EXISTS idx_crm_leads_is_chain ON crm_leads(is_chain);

-- 1) Shared-contact chains: a phone or email shared by >= 3 leads is almost
--    always a corporate line (OXXO's +51 1 6013636, Tambo's lindcorp.pe inbox,
--    a school chain's single mobile). Flag every member, keyed by the contact.
WITH shared_phone AS (
  SELECT phone
    FROM crm_leads
   WHERE phone IS NOT NULL AND btrim(phone) <> ''
   GROUP BY phone
  HAVING COUNT(*) >= 3
)
UPDATE crm_leads l
   SET is_chain = true,
       chain_key = COALESCE(l.chain_key, 'phone:' || l.phone)
  FROM shared_phone sp
 WHERE l.phone = sp.phone;

WITH shared_email AS (
  SELECT email
    FROM crm_leads
   WHERE email IS NOT NULL AND btrim(email) <> ''
   GROUP BY email
  HAVING COUNT(*) >= 3
)
UPDATE crm_leads l
   SET is_chain = true,
       chain_key = COALESCE(l.chain_key, 'email:' || l.email)
  FROM shared_email se
 WHERE l.email = se.email;

-- 2) Known national chains / franchises by name (case-insensitive). Deliberately
--    conservative — extend as you spot more in the data.
UPDATE crm_leads
   SET is_chain = true,
       chain_key = COALESCE(chain_key, 'brand:' || lower(split_part(btrim(name), ' ', 1)))
 WHERE name ILIKE 'oxxo%'
    OR name ILIKE 'tambo%'
    OR name ILIKE 'mass %' OR name ILIKE 'minimarket mass%'
    OR name ILIKE 'metro %' OR name ILIKE 'plaza vea%' OR name ILIKE 'vivanda%' OR name ILIKE 'wong%'
    OR name ILIKE 'inkafarma%' OR name ILIKE 'mifarma%' OR name ILIKE 'boticas %'
    OR name ILIKE 'bosch car service%'
    OR name ILIKE 'promart%' OR name ILIKE 'sodimac%' OR name ILIKE 'maestro%' OR name ILIKE 'todomoda%'
    OR name ILIKE 'cineplanet%' OR name ILIKE 'cinemark%'
    OR name ILIKE 'kfc%' OR name ILIKE 'bembos%' OR name ILIKE 'popeyes%' OR name ILIKE 'starbucks%'
    OR name ILIKE 'pardos%' OR name ILIKE 'norky%' OR name ILIKE 'dunkin%' OR name ILIKE 'china wok%';

-- 3) Obvious non-leads (placeholders) — flag so they drop out of the addressable
--    count without deleting history. Triage/whitelist as you review.
UPDATE crm_leads
   SET is_chain = true,
       chain_key = COALESCE(chain_key, 'placeholder')
 WHERE btrim(COALESCE(name, '')) = ''
    OR name ~* '^(nada|casa|n/?a|sin nombre)$'
    OR phone IN ('+51 900 000 000', '+51900000000', '+51 999 999 999');
