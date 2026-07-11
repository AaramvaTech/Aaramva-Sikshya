-- 0005_payment_transactions.sql — PAY-1 T1
-- Online gateway payment attempts (eSewa ePay v2 first; Khalti is PAY-2).
-- One row per initiation; transaction_uuid is what the gateway signs and what
-- the status-check API is queried by, so it is UNIQUE — replayed callbacks and
-- double-clicks land on the same row. The INITIATED→VERIFIED transition is a
-- conditional UPDATE (status = 'INITIATED' guard) in the same DB transaction
-- that records the payment, so an invoice can never be double-credited.
-- amount is the server-computed outstanding balance at initiation time; the
-- gateway-confirmed amount must equal it to the paisa before verification.
-- raw_payload accumulates the redirect + status-check responses for disputes.
-- No deleted_at BY DESIGN: this is a financial audit trail — rows are never
-- deleted or soft-deleted by application code.
CREATE TABLE IF NOT EXISTS {{schema}}.payment_transactions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID          NOT NULL REFERENCES invoices(id),
  gateway          VARCHAR(20)   NOT NULL,
  transaction_uuid VARCHAR(64)   NOT NULL UNIQUE,
  amount           NUMERIC(10,2) NOT NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'INITIATED',
  gateway_ref      VARCHAR(100),
  failure_reason   TEXT,
  raw_payload      JSONB         NOT NULL DEFAULT '{}'::jsonb,
  payment_id       UUID          REFERENCES payments(id),
  initiated_by     UUID          NOT NULL REFERENCES users(id),
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice
  ON {{schema}}.payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status
  ON {{schema}}.payment_transactions(status);
