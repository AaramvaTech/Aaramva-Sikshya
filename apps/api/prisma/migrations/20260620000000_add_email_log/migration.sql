-- email_log: observability for credential/notification emails (public schema, nullable tenant_id).
-- No plaintext passwords or message bodies are stored here.
CREATE TABLE "email_log" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"           UUID,
  "recipient_email"     TEXT NOT NULL,
  "email_type"          TEXT NOT NULL,
  "subject"             TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'PENDING',
  "provider_message_id" TEXT,
  "error"               TEXT,
  "related_user_id"     UUID,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "email_log_tenant_id_idx" ON "email_log" ("tenant_id");
CREATE INDEX "email_log_related_user_id_idx" ON "email_log" ("related_user_id");
