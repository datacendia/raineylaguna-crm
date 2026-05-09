# raineylaguna-crm — Bug tracker

Living list of known bugs and tech-debt items. New entries go at the
top. Close by removing or striking through and dating the fix.

---

## raineylaguna-crm-L01 — `next lint` removed in Next 16

**Status:** Open. 2026-05-08.

**Symptom:** `next lint` was removed in Next 16.x. Running it produces
`Invalid project directory provided, no such directory: …/lint`.

**Mitigation:** `package.json` `lint` script currently echoes a
deprecation notice.

**Fix:** Run `npx @next/codemod@canary next-lint-to-eslint-cli .` to
scaffold `eslint.config.mjs`, then flip the script back to `eslint .`.

---

## raineylaguna-crm-C20 — `as any` audit cleanup (LOW)

**Status:** Open. Tracked in `rainey-stack/TESTS.md` C20.

**Symptom:** Several `as any` escape hatches across `src/` mask
latent type errors. Not currently breaking anything; cleanup is
quality-of-life.

**Fix:** Grep `src/` for `as any`, replace each with the correct
narrow type or document the boundary.

---

## raineylaguna-crm-C21 — Raw `process.env` reads outside env loader (LOW)

**Status:** Open. Tracked in `rainey-stack/TESTS.md` C21.

**Symptom:** A handful of files read `process.env.X` directly instead
of going through the zod-validated `serverEnv` proxy. The two patterns
co-exist; pick one.

**Fix:** Grep `src/ scripts/` for `process.env\.`, replace each with
the equivalent `serverEnv.X` (or extend the env schema if the var is
missing).
