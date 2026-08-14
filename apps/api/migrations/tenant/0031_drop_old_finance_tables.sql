-- 0031_drop_old_finance_tables.sql — BILLING-CUTOVER Phase 4 (hard retirement)
-- Drops old Finance's fee/invoice/payment tables, now fully superseded by the
-- Billing rail (bill_fee_structures/bill_fee_structure_items/bill_invoices/
-- bill_invoice_items/bill_payments/bill_payment_allocations, all untouched
-- here). Per the discovery doc's premise, every school currently on Billing/
-- Finance is dummy/test data — no data migration, no backfill, no
-- reconciliation. Confirmed via a full dependency check (grep across the
-- entire backend + frontend, plus every FK in the tenant schema) that
-- nothing on the Billing code path reads these tables; the two live callers
-- found (dashboard.service.ts, the parent/admin student-profile pages) were
-- rewired onto Billing endpoints in the same change that ships this
-- migration — see BILLING-CUTOVER-phase-4-hard-retirement.md.
--
-- (1) payment_transactions.invoice_id/payment_id are PAY-1-era columns
-- (0005_payment_transactions.sql), made optional by 0026 once eSewa/Khalti
-- moved to bill_invoice_id/bill_payment_id (BILL-5 Checkpoint C) — no
-- current code path writes them. A handful of pre-BILL-5 rows still have
-- invoice_id set (dead 2026-07 test transactions, INITIATED/EXPIRED,
-- confirmed live before writing this migration); dropping the columns loses
-- only that legacy back-reference on those specific historical rows, not
-- the rows themselves. DROP COLUMN also drops the column's own FK and the
-- one-of-two-kinds CHECK constraint (0026) that referenced it — both would
-- otherwise block dropping `invoices`/`payments` below.
ALTER TABLE payment_transactions
  DROP COLUMN IF EXISTS invoice_id,
  DROP COLUMN IF EXISTS payment_id;

-- (2) Drop children before parents (FK order confirmed live against
-- information_schema before writing this file): invoice_items and payments
-- reference invoices; student_fee_assignments references
-- fee_structure_items; fee_structure_items references fee_structures and
-- fee_categories.
DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS student_fee_assignments;
DROP TABLE IF EXISTS fee_structure_items;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS fee_structures;
DROP TABLE IF EXISTS fee_categories;
