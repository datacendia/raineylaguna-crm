-- Phase 2.1 — TOTP 2FA on admin login.
--
-- Adds an optional per-user TOTP secret. The secret is stored as soon
-- as the operator starts enrolment (via POST /api/auth/totp/setup);
-- enrolment is "live" only after the operator confirms the first code
-- and we set `totp_enrolled_at`. Login enforces TOTP iff
-- `totp_enrolled_at IS NOT NULL`.
--
-- Idempotent: safe to re-run.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_enrolled_at TIMESTAMP WITH TIME ZONE;
