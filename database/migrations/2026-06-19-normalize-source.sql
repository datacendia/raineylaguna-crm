-- 2026-06-19-normalize-source.sql
-- Backfill crm_leads.source into the canonical lead-source vocabulary defined
-- in src/lib/lead-source.ts (ROADMAP #13), so the dashboard's Source filter,
-- CSV export, and any future source grouping all read the same buckets.
--
-- ── Two corrections made 2026-07-25 ──────────────────────────────────────────
--
-- 1. Unrecognised values are now LEFT ALONE instead of being rewritten to
--    'other'. The original `ELSE 'other'` was a no-op for the nine sources that
--    existed the day this was written — and the header said so — but it
--    silently destroyed any source added to the vocabulary afterwards, on every
--    run. Flattening them buys nothing: normalizeSource() in lead-source.ts
--    already returns 'other' for anything it doesn't recognise AT READ TIME, so
--    the dashboard buckets unknown sources correctly whether or not the stored
--    value was overwritten. Keeping the raw value means a new source shows up
--    as a visible straggler you can write a rule for, instead of vanishing.
--
-- 2. Only rows that actually change are written. The original updated every
--    non-empty row unconditionally, firing the updated_at trigger across the
--    whole table — and the Monday digest reads updated_at to decide "wins this
--    week", so a migrate run made every lead look freshly touched.
--
-- Genuinely idempotent now, for any future vocabulary: canonical values map to
-- themselves, unknowns are preserved, and the IS DISTINCT FROM guard means a
-- second run writes zero rows. Keep the mapping in step with normalizeSource().

UPDATE crm_leads AS l
   SET source = v.canonical
  FROM (
    SELECT id,
           CASE
             WHEN source ILIKE '%audit%'                                   THEN 'audit'
             WHEN source ILIKE '%whatsapp%' OR lower(source) = 'wa'        THEN 'whatsapp'
             WHEN source ILIKE '%contact%'                                 THEN 'contact-form'
             WHEN source ILIKE '%proto%'                                   THEN 'proto'
             WHEN source ILIKE '%places%' OR source ILIKE '%discover%'
                  OR source ILIKE '%google%'                               THEN 'discovery'
             WHEN source ILIKE '%import%' OR source ILIKE '%csv%'
                  OR source ILIKE '%bulk%'                                 THEN 'import'
             WHEN source ILIKE '%referr%'                                  THEN 'referral'
             WHEN source ILIKE '%event%'                                   THEN 'event'
             -- Unknown vocabulary: preserve it. normalizeSource() buckets it
             -- as 'other' on read; there is no reason to lose the original.
             ELSE source
           END AS canonical
      FROM crm_leads
     WHERE source IS NOT NULL AND source <> ''
  ) AS v
 WHERE l.id = v.id
   AND l.source IS DISTINCT FROM v.canonical;
