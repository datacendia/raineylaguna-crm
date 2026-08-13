-- 2026-08-13-chain-detection-by-district.sql
-- Get Adidas and Bodytech out of the independents queue.
--
-- 2026-06-03-franchise-flag.sql flags a lead when it shares a phone or email
-- with 3+ others, or when its name matches a hand-written list of Peruvian
-- brands. Both miss the case that matters: a large chain's branches usually
-- carry DIFFERENT phone numbers, and a brand list only ever contains names
-- somebody thought to add.
--
-- So is_chain is false on at least 523 obvious chains, and the analytics
-- Opportunity Radar currently leads with Bodytech, Adidas and Marathon Sports
-- — all Crítico 89, all inside "Addressable (independents): 35,328". Adidas
-- appears 42 times, Bodytech 26. None is sellable by a one-person studio.
--
-- The rule here needs no brand list:
--
--     the same normalised name in 3+ DISTINCT city/district pairs is a chain
--
-- One business does not trade under one name in three districts at once.
--
-- The district test is also what stops this eating real independents. The same
-- name confined to ONE district is a duplicate row, not a chain — "Casa" x67
-- and "Tienda Mass" x83 are different problems needing opposite treatment, and
-- flagging a duplicate as a chain would bury a genuine prospect. Duplicates
-- are handled separately by scripts/dedupe-leads.ts.
--
-- Generic single words are excluded outright: "Casa" in three districts is
-- three unrelated businesses.
--
-- Mirrors src/lib/chain-detect.ts, which is unit-tested; keep the two in step.
--
-- Idempotent: only ever SETS is_chain = true from deterministic rules, like
-- the migration it extends. Same caveat as that file — a manually cleared
-- false positive will be re-flagged unless the underlying rule is fixed.

-- The unaccent extension is not guaranteed to be installed, and requiring it
-- would make this migration fail on a database that lacks it. translate()
-- covers the Spanish accented set, which is all this data contains.
CREATE OR REPLACE FUNCTION unaccent_fallback(raw text)
RETURNS text AS $$
  SELECT translate(
    COALESCE(raw, ''),
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  );
$$ LANGUAGE sql IMMUTABLE;

-- Reduce a raw name to its brand: drop branch qualifiers, legal forms,
-- accents and punctuation. Mirrors normaliseBrand() in chain-detect.ts.
CREATE OR REPLACE FUNCTION crm_normalise_brand(raw text)
RETURNS text AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(unaccent_fallback(COALESCE(raw, ''))),
            '\s*([-–—|/(]|\y(sede|sucursal|tienda|local|store|branch|agencia|mall|cc)\y).*$',
            '', 'g'
          ),
          '\y(s\.?a\.?c\.?|s\.?a\.?a\.?|s\.?r\.?l\.?|e\.?i\.?r\.?l\.?|s\.?a\.?|ltda?|inc|llc|corp|company|group|grupo|peru)\y',
          ' ', 'g'
        ),
        '[^a-z0-9\s]', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$ LANGUAGE sql IMMUTABLE;

-- Names too common to group on. Mirrors GENERIC_NAMES in chain-detect.ts.
CREATE OR REPLACE FUNCTION crm_is_generic_brand(brand text)
RETURNS boolean AS $$
  SELECT length(COALESCE(brand, '')) < 3
      OR brand IN (
        'casa','restaurante','restaurant','bodega','minimarket','market','salon',
        'peluqueria','barberia','gimnasio','gym','cafe','cafeteria','bar','hotel',
        'hostal','clinica','farmacia','botica','taller','ferreteria','panaderia',
        'pizzeria','polleria','chifa','cevicheria','spa','lavanderia','estudio',
        'oficina','tienda','negocio','empresa','local','sin nombre'
      );
$$ LANGUAGE sql IMMUTABLE;

-- Rule 1: multi-district brands.
WITH branded AS (
  SELECT id, city, district, crm_normalise_brand(name) AS brand
    FROM crm_leads
   WHERE deleted_at IS NULL
),
multi_district AS (
  SELECT brand
    FROM branded
   WHERE brand <> '' AND NOT crm_is_generic_brand(brand)
   GROUP BY brand
  HAVING COUNT(DISTINCT COALESCE(city, '?') || '/' || COALESCE(district, '?')) >= 3
)
UPDATE crm_leads l
   SET is_chain = true,
       chain_key = COALESCE(l.chain_key, 'brand:' || m.brand)
  FROM branded b
  JOIN multi_district m ON m.brand = b.brand
 WHERE l.id = b.id
   AND l.is_chain = false;

-- Rule 2: global brands that may have only one or two locations here and are
-- still not sellable. Short by design — a list cannot be the primary strategy,
-- which is exactly why the earlier migration missed Adidas.
WITH global_brands(brand) AS (
  VALUES ('adidas'),('nike'),('puma'),('reebok'),('under armour'),('new balance'),
         ('skechers'),('zara'),('forever 21'),('gap'),('uniqlo'),('mango'),
         ('starbucks'),('mcdonalds'),('burger king'),('kfc'),('subway'),
         ('dominos'),('pizza hut'),('papa johns'),('dunkin'),('popeyes'),('wendys'),
         ('home depot'),('ikea'),('walmart'),('costco'),('target'),
         ('bodytech'),('smart fit'),('anytime fitness'),
         ('marathon sports'),('decathlon'),('foot locker'),
         ('apple'),('samsung'),('huawei'),('xiaomi'),
         ('banco de credito'),('bbva'),('scotiabank'),('interbank')
)
UPDATE crm_leads l
   SET is_chain = true,
       chain_key = COALESCE(l.chain_key, 'brand:' || g.brand)
  FROM global_brands g
 WHERE l.deleted_at IS NULL
   AND l.is_chain = false
   -- Exact brand match or brand-prefixed, so "Nikeisha Beauty Salon" and
   -- "Gapinsa Ingenieros" are not caught by 'nike' / 'gap'.
   AND (
     crm_normalise_brand(l.name) = g.brand
     OR crm_normalise_brand(l.name) LIKE g.brand || ' %'
   );

CREATE INDEX IF NOT EXISTS idx_crm_leads_chain_key ON crm_leads (chain_key)
  WHERE chain_key IS NOT NULL;
