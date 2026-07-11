-- 0004_password_reset_tokens.sql — MAIL-1 T3
-- Self-service password reset for tenant users. Tokens are stored HASHED
-- (SHA-256, same discipline as refresh_tokens): a DB leak exposes no usable
-- reset links. 30-minute expiry and single-use are enforced in AuthService
-- via an atomic claim (UPDATE ... WHERE used_at IS NULL RETURNING).
CREATE TABLE IF NOT EXISTS {{schema}}.password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON {{schema}}.password_reset_tokens(user_id);
