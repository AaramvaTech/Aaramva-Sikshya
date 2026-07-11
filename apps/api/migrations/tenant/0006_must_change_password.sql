-- 0006_must_change_password.sql — POL-1 T4 (MAIL-1 R2 backlog)
-- Force-change-on-first-login for emailed temporary passwords. Provisioning and
-- credential-resend paths set this TRUE whenever the password was GENERATED
-- (never chosen by the user); change-password and reset-password clear it.
-- Login and /auth/me responses surface the flag; the web shell redirects
-- flagged users to the change-password page until it clears. Pre-existing
-- users default to FALSE (temp-vs-chosen is not distinguishable in hindsight).
ALTER TABLE {{schema}}.users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
