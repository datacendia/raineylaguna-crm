-- 2026-08-13-repair-web-flag-ids.sql
-- Remove array subscripts that are masquerading as audit signals.
--
-- /api/leads/public built flag ids as `web_${i}` — the finding's INDEX in the
-- payload. So web_0 .. web_13 were written into crm_leads.audit_findings as
-- though they were flag types, and because the analytics "Top opportunity
-- signals" panel groups by flag id, the operator has been shown a signal
-- called "web_0". That is a subscript presented as a business insight.
--
-- The id is now derived from the finding's own title (intakeFlagId in that
-- route), mapped onto the same vocabulary computeHealth uses so CRM-run and
-- site-run audits finally aggregate together.
--
-- This repairs the rows already written. The label was always correct — only
-- the id was junk — so the label is what the repair reads, applying the same
-- mapping the route now applies at write time. Anything unrecognised becomes
-- `intake_<slug>` rather than being deleted: the finding was real even though
-- its id was not, and dropping it would quietly shrink audit histories.
--
-- Idempotent: matches only ids of the exact shape web_<digits>, which the
-- fixed route can no longer produce, so a second run finds nothing.

UPDATE crm_leads
SET audit_findings = jsonb_set(
      audit_findings,
      '{flags}',
      (
        SELECT COALESCE(jsonb_agg(
          CASE
            WHEN flag->>'id' ~ '^web_[0-9]+$' THEN
              jsonb_set(
                flag,
                '{id}',
                to_jsonb(
                  CASE
                    WHEN lower(flag->>'label') ~ 'https|segur'        THEN 'no_https'
                    WHEN lower(flag->>'label') ~ 'mobile|móvil|movil' THEN 'not_mobile'
                    WHEN lower(flag->>'label') ~ 'lcp|lenta|slow'     THEN 'slow_lcp'
                    WHEN lower(flag->>'label') ~ 'performance|rendimiento'
                                                                     THEN 'poor_performance'
                    WHEN lower(flag->>'label') ~ 'seo'                THEN 'weak_seo'
                    WHEN lower(flag->>'label') ~ 'accesibil|accessib' THEN 'weak_accessibility'
                    WHEN lower(flag->>'label') ~ 'analytic|analítica|analitica'
                                                                     THEN 'no_analytics'
                    WHEN lower(flag->>'label') ~ 'structured|estructurad|preview'
                                                                     THEN 'no_structured_data'
                    WHEN lower(flag->>'label') ~ 'copyright|desactualiz|stale'
                                                                     THEN 'stale'
                    ELSE 'intake_' || COALESCE(
                      NULLIF(
                        regexp_replace(
                          regexp_replace(lower(flag->>'label'), '[^a-z0-9]+', '_', 'g'),
                          '^_+|_+$', '', 'g'
                        ),
                        ''
                      ),
                      'unknown'
                    )
                  END
                )
              )
            ELSE flag
          END
          ORDER BY ord
        ), '[]'::jsonb)
        FROM jsonb_array_elements(audit_findings -> 'flags') WITH ORDINALITY AS t(flag, ord)
      )
    )
WHERE audit_findings IS NOT NULL
  AND jsonb_typeof(audit_findings -> 'flags') = 'array'
  -- Only rows that actually carry a subscript id, so this touches nothing else.
  AND EXISTS (
    SELECT 1
      FROM jsonb_array_elements(audit_findings -> 'flags') AS f(flag)
     WHERE f.flag->>'id' ~ '^web_[0-9]+$'
  );
