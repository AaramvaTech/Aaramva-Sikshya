-- 0019_bill_catalog.sql — BILL-1 (catalog)
-- New billing catalog: fee_heads, bill_fee_structures / bill_fee_structure_items
-- (BUGS-3: bill_-prefixed — the old fee_structures/fee_structure_items stay
-- exactly as they are, still read/written by FeeStructureService/InvoiceService;
-- these get renamed to the bare names only at the Phase 4 cutover, after the
-- old tables are dropped), discount_reasons, transport_routes, tax_rates
-- (ships EMPTY per R6 — no seed rows), late_fee_rules.
--
-- Purely additive: no existing table is touched.

CREATE TABLE IF NOT EXISTS fee_heads (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(100)  NOT NULL,
  code             VARCHAR(30)   NOT NULL UNIQUE,
  recurrence       VARCHAR(20)   NOT NULL
                     CHECK (recurrence IN ('MONTHLY','QUARTERLY','TERM','ANNUAL','ONE_TIME','ON_DEMAND')),
  is_taxable       BOOLEAN       NOT NULL DEFAULT false,
  is_refundable    BOOLEAN       NOT NULL DEFAULT false,
  proration_policy VARCHAR(10)   NOT NULL DEFAULT 'NONE'
                     CHECK (proration_policy IN ('NONE','MONTHLY')),
  gl_account_code  TEXT,
  display_order    INT           NOT NULL DEFAULT 0,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- BUGS-3: new definition, deliberately NOT named fee_structures (collision
-- with the live old table). UNIQUE constraint is what the old table couldn't
-- express: more than one structure per class+year, distinguished by name.
--
-- UNIQUE NULLS NOT DISTINCT (Postgres 15+): a plain UNIQUE constraint treats
-- every NULL section_id as distinct from every other NULL, so two whole-class
-- (section_id NULL) rows with the identical name would NOT be caught by a
-- literal reading of the spec's "UNIQUE(academic_year_id, class_id,
-- section_id, name)". NULLS NOT DISTINCT closes that gap so "same name, both
-- whole-class-scoped" is correctly rejected as a duplicate too.
CREATE TABLE IF NOT EXISTS bill_fee_structures (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID          NOT NULL REFERENCES academic_years(id),
  class_id         UUID          NOT NULL REFERENCES classes(id),
  section_id       UUID          REFERENCES sections(id),
  name             TEXT          NOT NULL,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  created_by       UUID          NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE NULLS NOT DISTINCT (academic_year_id, class_id, section_id, name)
);

CREATE TABLE IF NOT EXISTS bill_fee_structure_items (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id    UUID          NOT NULL REFERENCES bill_fee_structures(id) ON DELETE CASCADE,
  fee_head_id         UUID          NOT NULL REFERENCES fee_heads(id),
  amount              NUMERIC(12,2) NOT NULL,
  -- Per-item override of fee_heads.recurrence; same enum, NULL = inherit.
  recurrence_override VARCHAR(20)
                        CHECK (recurrence_override IS NULL OR
                               recurrence_override IN ('MONTHLY','QUARTERLY','TERM','ANNUAL','ONE_TIME','ON_DEMAND')),
  effective_from      DATE          NOT NULL,
  effective_to        DATE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_fee_structure_items_structure
  ON bill_fee_structure_items(fee_structure_id);

CREATE TABLE IF NOT EXISTS discount_reasons (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100)  NOT NULL,
  code            VARCHAR(30)   NOT NULL UNIQUE,
  gl_account_code TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS transport_routes (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100)  NOT NULL,
  code           VARCHAR(30)   NOT NULL UNIQUE,
  monthly_amount NUMERIC(12,2) NOT NULL,
  is_active      BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

-- Ships EMPTY (R6): no seed rows. No tax row prints unless a rate exists for
-- the invoice date. updated_at/deleted_at added beyond the spec's terse DDL
-- listing to match the Endpoints section's explicit PATCH + soft-delete
-- contract for /finance/tax-rates (same shape as the other 4 catalog tables).
CREATE TABLE IF NOT EXISTS tax_rates (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100)  NOT NULL,
  rate           NUMERIC(5,3)  NOT NULL,
  applies_to     VARCHAR(20)   NOT NULL DEFAULT 'ALL'
                   CHECK (applies_to IN ('ALL','TAXABLE_HEADS')),
  effective_from DATE          NOT NULL,
  effective_to   DATE,
  created_by     UUID          NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

-- deleted_at added beyond the spec's terse DDL listing, same reasoning as
-- tax_rates above — the Endpoints section promises DELETE + deletedAt.
CREATE TABLE IF NOT EXISTS late_fee_rules (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          VARCHAR(10)   NOT NULL CHECK (scope IN ('GLOBAL','FEE_HEAD')),
  fee_head_id    UUID          REFERENCES fee_heads(id),
  type           VARCHAR(10)   NOT NULL CHECK (type IN ('FLAT','PER_DAY','PERCENT')),
  value          NUMERIC(12,2) NOT NULL,
  grace_days     INT           NOT NULL DEFAULT 0,
  cap_amount     NUMERIC(12,2),
  is_enabled     BOOLEAN       NOT NULL DEFAULT false,
  effective_from DATE          NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);
