# BILL-5 Checkpoint A — Payment Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build BILL-5 Checkpoint A only (`docs/api-contracts/BILL-5-SPEC.md` §7) — the `bill_payments`/`bill_payment_allocations` tables and the record-payment + allocation engine (CLEARED cash payments, AUTO_FIFO and MANUAL allocation, ADVANCE_ONLY deposits, gapless receipt numbers via the R13 machinery), proven live with the 8,500→5,000→3,500 invariant and a FIFO-across-three-invoices scenario.

**Architecture:** Additive tables + a new `BillPaymentService`/`BillPaymentController` pair in the existing `apps/api/src/modules/finance/` module, following the exact BILL-4 (`BillInvoiceService`/`BillRunPostRunnerService`) conventions already in the codebase: raw SQL via `TenantPrismaService`/`$queryRawUnsafe`, `Money` for all arithmetic, `LedgerService.withStudentLock` + `postEntryInTx` for the one-entry-per-payment invariant under the per-student advisory lock, and the R13 `sequences` table for gapless receipt numbers (mirroring `buildInvoiceNumber`'s FIX-RESET-COLLISION-safe format from day one). Allocation math (AUTO_FIFO walk) is isolated in a pure, Nest-free util for direct unit testing, matching `bill-run.util.ts`'s precedent.

**Tech Stack:** NestJS, raw SQL (`$queryRawUnsafe`/`$executeRawUnsafe`) via `TenantPrismaService`, `Money` (`apps/api/src/common/money/money.ts`), `class-validator`/`class-transformer` DTOs, Jest.

## Global Constraints

- Checkpoint A ONLY: no cheque lifecycle (PENDING/CLEARED/BOUNCED transitions), no payment void, no advance-auto-apply-on-invoice-post (BILL-4 post-runner is NOT touched), no eSewa/Khalti re-pointing. R10 (old `payments`/`invoices`/gateway rail) stays fully frozen.
- Method scope this checkpoint: **CASH only**. The DTO/migration still declare the full B5-6 method enum (permanent wire contract), but the service rejects non-CASH with a clear 400 — this is a checkpoint boundary, not a bug.
- Every CLEARED payment/deposit writes **exactly one** ledger entry (`PAYMENT` if any allocation exists, `DEPOSIT` if none), inside `LedgerService.withStudentLock`, composed via `postEntryInTx` into the SAME transaction as the `bill_payments` insert and its allocations (no separate top-level transaction).
- All money arithmetic via `Money` / `toMoney()`; all money DTO fields via `@IsMoneyString()`. Never a JS `number` in an arithmetic path.
- Migration is canary-first: apply to `demo`, verify via `--status`, then roll to all tenants (which includes `scratch` and every other tenant row in `public.tenants` — confirm via `--status` after).
- Raw SQL only (no Prisma models for tenant tables) — matches every existing finance service.
- MANUAL allocation mode requires `PRINCIPAL_AND_ABOVE` (`[Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL]`) — narrower than the endpoint's base `ACCOUNTANT_AND_ABOVE` gate. This is Srijan's ruling on B5-3's "behind a permission," made explicit here since the codebase has no finer-grained permission system than role tiers (confirmed: zero `Permission`/`permission` hits anywhere in `apps/api/src/modules/finance`).
- Every functional deviation or scope-narrowing decision gets logged in `BILL-BUGS.md`, newest-first, matching the existing FIX-RESET-COLLISION/TRANSPORT-ITEM entry format — raised, not silently decided.
- Live proof discipline: every write path gets live HTTP + raw Postgres `SELECT` read-back, never mocked-test-only. Scaffolding (tenant, invoices, payments) created for the live proof gets cleaned up with read-backs, any password shim restored and 401-proven, matching every prior BILL-* checkpoint's documented practice.

---

## File Structure

**Create:**
- `apps/api/migrations/tenant/0024_bill_payments.sql` — `bill_payments` + `bill_payment_allocations` tables; widens `student_ledger_entries.entry_type`'s CHECK to add `'DEPOSIT'` (a real gap found in BILL-3's original CHECK — not in BILL-5-SPEC's own §8 cross-phase touch register, logged in BILL-BUGS.md).
- `apps/api/src/modules/finance/bill-payment.util.ts` — `buildReceiptSequenceKey`, `buildReceiptNumber`. Pure, mirrors `bill-post.util.ts`'s invoice-numbering functions exactly (same FIX-RESET-COLLISION-safe shape, different doctype prefix).
- `apps/api/src/modules/finance/bill-payment-allocation.util.ts` — `planAutoFifoAllocation`. Pure, the one genuinely complex algorithm this checkpoint owns — isolated for direct unit testing without DB/Nest mocking, matching `bill-run.util.ts`'s precedent.
- `apps/api/src/modules/finance/entities/bill-payment.entity.ts` — `BillPaymentRow`, `BillPaymentAllocationRow`, response DTOs, `toBillPaymentResponse`/`toBillPaymentAllocationResponse` mappers. Mirrors `entities/bill-invoice.entity.ts` exactly (own local `toIso`/`toDateOnly` copies, per that file's own documented convention).
- `apps/api/src/modules/finance/dto/bill-payment.dto.ts` — `CreateBillPaymentDto`, `ManualAllocationTargetDto`, `BillPaymentQueryDto`, `BillPaymentMethod`/`BillPaymentAllocationMode` enums.
- `apps/api/src/modules/finance/bill-payment.service.ts` — `BillPaymentService`: `recordPayment`, `findAll`, `findOne`.
- `apps/api/src/modules/finance/bill-payment.controller.ts` — `BillPaymentController`: `POST /finance/bill/payments`, `GET /finance/bill/payments`, `GET /finance/bill/payments/:id`.
- `apps/api/src/modules/finance/__tests__/bill-payment-allocation.util.spec.ts`
- `apps/api/src/modules/finance/__tests__/bill-payment.util.spec.ts`
- `apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts`

**Modify:**
- `apps/api/src/modules/finance/finance.module.ts` — register `BillPaymentService` in `providers`, `BillPaymentController` in `controllers`.
- `BILL-BUGS.md` — log the DEPOSIT CHECK-widen finding, the MANUAL-permission ruling, the CASH-only checkpoint scope, and the deferred statement/advance-balance endpoints — newest-first, matching existing entry format.

---

## Task 1: Migration `0024_bill_payments.sql`

**Files:**
- Create: `apps/api/migrations/tenant/0024_bill_payments.sql`

**Interfaces:**
- Produces: tables `bill_payments` (columns: `id, receipt_number, student_id, academic_year_id, amount, method, status, received_date, received_bs_year, received_bs_month, received_bs_day, reference, cheque_bank, cheque_date, allocation_mode, ledger_entry_id, gateway_txn_ref, notes, received_by, created_at, updated_at, deleted_at`) and `bill_payment_allocations` (`id, bill_payment_id, bill_invoice_id, amount, created_at`). Widens `student_ledger_entries.entry_type` CHECK to include `'DEPOSIT'`. Every later task's raw SQL depends on these exact column names.

- [ ] **Step 1: Write the migration file**

```sql
-- 0024_bill_payments.sql — BILL-5 Checkpoint A (payment engine core)
-- Per BILL-5-SPEC.md §2. Purely additive: no existing bill_* table is
-- altered or dropped. One necessary widen: student_ledger_entries.entry_type
-- (0021_bill_ledger.sql) only anticipated OPENING_BALANCE, INVOICE, PAYMENT,
-- REFUND, CREDIT_NOTE, FINE, WRITE_OFF, ADJUSTMENT — B5-9 requires a DEPOSIT
-- entry type for pure-advance payments (no invoice touched). Not listed in
-- BILL-5-SPEC's own §8 cross-phase touch register — found while implementing,
-- logged in BILL-BUGS.md. Widened via a catalog-driven DO block (not a
-- hardcoded constraint name) since the original CHECK was inline on the
-- column, so Postgres auto-named it rather than it being explicitly given a
-- name in 0021.

CREATE TABLE IF NOT EXISTS bill_payments (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number     TEXT          NOT NULL UNIQUE,
  student_id         UUID          NOT NULL REFERENCES students(id),
  academic_year_id   UUID          NOT NULL REFERENCES academic_years(id),
  amount             NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method             VARCHAR(15)   NOT NULL CHECK (method IN
                        ('CASH','CHEQUE','BANK_TRANSFER','ESEWA','KHALTI')),
  status             VARCHAR(10)   NOT NULL DEFAULT 'CLEARED'
                        CHECK (status IN ('CLEARED','PENDING','BOUNCED','VOIDED')),
  received_date      DATE          NOT NULL,
  received_bs_year   INT,
  received_bs_month  INT,
  received_bs_day    INT,
  reference          TEXT,
  cheque_bank        TEXT,
  cheque_date        DATE,
  allocation_mode    VARCHAR(15)   NOT NULL CHECK (allocation_mode IN
                        ('AUTO_FIFO','MANUAL','ADVANCE_ONLY')),
  ledger_entry_id    UUID,
  gateway_txn_ref    TEXT,
  notes              TEXT,
  received_by        UUID          NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_student ON bill_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_status ON bill_payments (status);
CREATE INDEX IF NOT EXISTS idx_bill_payments_received_date ON bill_payments (received_date);

CREATE TABLE IF NOT EXISTS bill_payment_allocations (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_payment_id  UUID          NOT NULL REFERENCES bill_payments(id) ON DELETE CASCADE,
  bill_invoice_id  UUID          NOT NULL REFERENCES bill_invoices(id),
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bpa_payment ON bill_payment_allocations (bill_payment_id);
CREATE INDEX IF NOT EXISTS idx_bpa_invoice ON bill_payment_allocations (bill_invoice_id);

-- One payment never allocates twice to the same invoice — a second top-up
-- against the same invoice is a second bill_payment, not a second row here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bpa_payment_invoice
  ON bill_payment_allocations (bill_payment_id, bill_invoice_id);

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'student_ledger_entries'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%entry_type%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE student_ledger_entries DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE student_ledger_entries
    ADD CONSTRAINT student_ledger_entries_entry_type_check
    CHECK (entry_type IN ('OPENING_BALANCE','INVOICE','PAYMENT','DEPOSIT',
                           'REFUND','CREDIT_NOTE','FINE','WRITE_OFF','ADJUSTMENT'));
END $$;
```

- [ ] **Step 2: Confirm the file is LF-pinned**

Run: `git check-attr text eol -- apps/api/migrations/tenant/0024_bill_payments.sql`
Expected: `eol: lf` (inherited from the root `.gitattributes` MIG-3 pin — confirms no CRLF smudge before it ever gets checksummed).

- [ ] **Step 3: Dry-run against demo**

Run: `cd apps/api && npm run migrate:tenants -- --tenant demo --dry-run`
Expected: `0024_bill_payments.sql` listed as pending; no other pending files. If this hangs or double-prints, remember MIG-1's Windows gotcha — run with `TS_NODE_TRANSPILE_ONLY=1` and don't pipe through `Select-Object -Last`.

- [ ] **Step 4: Canary-apply to demo**

Run: `npm run migrate:tenants -- --tenant demo`
Expected: structured log line `tenant=demo migration=0024_bill_payments.sql status=applied ms=<n>`.

- [ ] **Step 5: Verify live against demo via raw SQL**

Run a raw `psql`/query against `tenant_demo`:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'tenant_demo' AND table_name IN ('bill_payments','bill_payment_allocations');

SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'tenant_demo.student_ledger_entries'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) LIKE '%entry_type%';
```
Expected: both tables exist; the CHECK definition now lists `DEPOSIT` alongside the original 8 values.

- [ ] **Step 6: Roll to all tenants**

Run: `npm run migrate:tenants -- --status` (confirm demo shows `0024` as latest, everyone else does not yet), then `npm run migrate:tenants` (all tenants), then `npm run migrate:tenants -- --status` again.
Expected: every tenant row (including `scratch`) now shows `0024_bill_payments.sql` as latest applied, 0 pending, 0 failed.

- [ ] **Step 7: Commit**

```bash
git add apps/api/migrations/tenant/0024_bill_payments.sql
git commit -m "feat(api): BILL-5 Checkpoint A — bill_payments + bill_payment_allocations migration"
```

---

## Task 2: `bill-payment-allocation.util.ts` — the AUTO_FIFO planner (pure, TDD)

**Files:**
- Create: `apps/api/src/modules/finance/bill-payment-allocation.util.ts`
- Test: `apps/api/src/modules/finance/__tests__/bill-payment-allocation.util.spec.ts`

**Interfaces:**
- Consumes: `Money` from `../../common/money/money` (relative from `__tests__/` down one more level — verify actual relative depth when importing in the test file: `../../../common/money/money`).
- Produces: `UnpaidInvoiceCandidate { billInvoiceId: string; outstanding: Money }`, `AllocationPlanItem { billInvoiceId: string; amount: Money }`, `AllocationPlan { allocations: AllocationPlanItem[]; remainder: Money }`, `planAutoFifoAllocation(amount: Money, candidatesOldestFirst: UnpaidInvoiceCandidate[]): AllocationPlan`. `BillPaymentService` (Task 6) calls this directly with candidates already SQL-ordered oldest-first.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/modules/finance/__tests__/bill-payment-allocation.util.spec.ts
import { Money } from '../../../common/money/money';
import { planAutoFifoAllocation, UnpaidInvoiceCandidate } from '../bill-payment-allocation.util';

function candidate(id: string, outstanding: string): UnpaidInvoiceCandidate {
  return { billInvoiceId: id, outstanding: Money.fromDb(outstanding) };
}

describe('planAutoFifoAllocation', () => {
  it('fully settles a single invoice and leaves zero remainder when the amount matches exactly', () => {
    const plan = planAutoFifoAllocation(Money.fromDb('3000.00'), [candidate('inv-1', '3000.00')]);
    expect(plan.allocations).toEqual([{ billInvoiceId: 'inv-1', amount: Money.fromDb('3000.00') }]);
    expect(plan.remainder.isZero()).toBe(true);
  });

  it('partially settles a single invoice, leftover stays on the invoice (not the remainder)', () => {
    const plan = planAutoFifoAllocation(Money.fromDb('5000.00'), [candidate('inv-1', '8500.00')]);
    expect(plan.allocations).toEqual([{ billInvoiceId: 'inv-1', amount: Money.fromDb('5000.00') }]);
    expect(plan.remainder.isZero()).toBe(true);
  });

  it('walks three invoices oldest-first, partial lands on the boundary invoice, correct leftover', () => {
    const candidates = [candidate('inv-1', '2000.00'), candidate('inv-2', '3000.00'), candidate('inv-3', '1500.00')];
    const plan = planAutoFifoAllocation(Money.fromDb('4500.00'), candidates);
    expect(plan.allocations).toEqual([
      { billInvoiceId: 'inv-1', amount: Money.fromDb('2000.00') },
      { billInvoiceId: 'inv-2', amount: Money.fromDb('2500.00') },
    ]);
    expect(plan.remainder.isZero()).toBe(true);
  });

  it('overpayment beyond all outstanding invoices becomes the remainder (advance credit)', () => {
    const candidates = [candidate('inv-1', '2000.00'), candidate('inv-2', '3000.00')];
    const plan = planAutoFifoAllocation(Money.fromDb('6000.00'), candidates);
    expect(plan.allocations).toEqual([
      { billInvoiceId: 'inv-1', amount: Money.fromDb('2000.00') },
      { billInvoiceId: 'inv-2', amount: Money.fromDb('3000.00') },
    ]);
    expect(plan.remainder.compare(Money.fromDb('1000.00'))).toBe(0);
  });

  it('empty candidate list makes the entire amount the remainder', () => {
    const plan = planAutoFifoAllocation(Money.fromDb('2000.00'), []);
    expect(plan.allocations).toEqual([]);
    expect(plan.remainder.compare(Money.fromDb('2000.00'))).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest bill-payment-allocation.util.spec.ts`
Expected: FAIL — `Cannot find module '../bill-payment-allocation.util'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/finance/bill-payment-allocation.util.ts
import { Money } from '../../common/money/money';

export interface UnpaidInvoiceCandidate {
  billInvoiceId: string;
  outstanding: Money;
}

export interface AllocationPlanItem {
  billInvoiceId: string;
  amount: Money;
}

export interface AllocationPlan {
  allocations: AllocationPlanItem[];
  remainder: Money;
}

/**
 * B5-3 AUTO_FIFO: walk the given candidates (caller must pass them already
 * ordered oldest-first — this function does no sorting) and allocate the
 * payment amount against each until exhausted or candidates run out. Pure —
 * cannot fail; a payment larger than total outstanding simply leaves a
 * nonzero remainder (advance credit, B5-4).
 */
export function planAutoFifoAllocation(
  amount: Money,
  candidatesOldestFirst: UnpaidInvoiceCandidate[],
): AllocationPlan {
  let remaining = amount;
  const allocations: AllocationPlanItem[] = [];

  for (const candidate of candidatesOldestFirst) {
    if (remaining.isZero()) break;
    const applied = remaining.compare(candidate.outstanding) <= 0 ? remaining : candidate.outstanding;
    allocations.push({ billInvoiceId: candidate.billInvoiceId, amount: applied });
    remaining = remaining.sub(applied);
  }

  return { allocations, remainder: remaining };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest bill-payment-allocation.util.spec.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/bill-payment-allocation.util.ts apps/api/src/modules/finance/__tests__/bill-payment-allocation.util.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint A — AUTO_FIFO allocation planner (pure util)"
```

---

## Task 3: `bill-payment.util.ts` — gapless receipt numbering (pure, TDD)

**Files:**
- Create: `apps/api/src/modules/finance/bill-payment.util.ts`
- Test: `apps/api/src/modules/finance/__tests__/bill-payment.util.spec.ts`

**Interfaces:**
- Consumes: nothing external (pure string builders — no import from `bill-post.util.ts` needed since the two functions are self-contained, matching that file's own self-contained style).
- Produces: `buildReceiptSequenceKey(tenantSlug: string, resetPerFiscalYear: boolean, fiscalYearBsValue: number): string`, `buildReceiptNumber(resetPerFiscalYear: boolean, bsYear: number, fiscalYearBsValue: number, seqValue: bigint | number): string`. `BillPaymentService` (Task 6) calls both; `fiscalYearBs` itself is imported directly from `./bill-post.util` in the service, not re-exported here.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/modules/finance/__tests__/bill-payment.util.spec.ts
import { buildReceiptSequenceKey, buildReceiptNumber } from '../bill-payment.util';

describe('buildReceiptSequenceKey', () => {
  it('CONTINUOUS mode keys on a stable literal, not the bs year', () => {
    expect(buildReceiptSequenceKey('demo', false, 2083)).toBe('receipt:demo:CONTINUOUS');
    expect(buildReceiptSequenceKey('demo', false, 2084)).toBe('receipt:demo:CONTINUOUS');
  });

  it('RESET mode keys on the fiscal year', () => {
    expect(buildReceiptSequenceKey('demo', true, 2083)).toBe('receipt:demo:2083');
  });

  it('never shares a namespace with the invoice sequence', () => {
    expect(buildReceiptSequenceKey('demo', false, 2083)).not.toContain('bill_invoice');
  });
});

describe('buildReceiptNumber', () => {
  it('CONTINUOUS mode: RCPT-<bsYear>-NNNNNN, 6-digit zero-padded', () => {
    expect(buildReceiptNumber(false, 2083, 2083, 1)).toBe('RCPT-2083-000001');
    expect(buildReceiptNumber(false, 2083, 2083, 42)).toBe('RCPT-2083-000042');
  });

  it('RESET mode: RCPT-R<fiscalYear>-NNNNNN — structurally cannot collide with CONTINUOUS (FIX-RESET-COLLISION lesson applied from day one)', () => {
    const resetNumber = buildReceiptNumber(true, 2083, 2083, 1);
    const continuousNumber = buildReceiptNumber(false, 2083, 2083, 1);
    expect(resetNumber).toBe('RCPT-R2083-000001');
    expect(resetNumber).not.toBe(continuousNumber);
    expect(resetNumber.charAt(5)).toBe('R');
    expect(continuousNumber.charAt(5)).not.toBe('R');
  });

  it('accepts bigint seq values from the sequences table', () => {
    expect(buildReceiptNumber(false, 2083, 2083, BigInt(7))).toBe('RCPT-2083-000007');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest bill-payment.util.spec.ts`
Expected: FAIL — `Cannot find module '../bill-payment.util'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/finance/bill-payment.util.ts

/**
 * B5-8: gapless receipt numbering via the SAME R13 sequence machinery as
 * invoice numbers (bill-post.util.ts's buildInvoiceSequenceKey/
 * buildInvoiceNumber) — own doctype "receipt" so the two series never share
 * a counter (mirrors that file's own comment on why bill_invoice is its own
 * namespace, not sharing invoice.service.ts's flat "invoice_seq" key).
 *
 * Applies the FIX-RESET-COLLISION lesson (BILL-BUGS.md) from day one instead
 * of discovering the identical collision fresh for receipts later: the
 * visible string itself disambiguates which sequence key produced it, not
 * just the underlying counter value.
 */
export function buildReceiptSequenceKey(
  tenantSlug: string,
  resetPerFiscalYear: boolean,
  fiscalYearBsValue: number,
): string {
  return resetPerFiscalYear
    ? `receipt:${tenantSlug}:${fiscalYearBsValue}`
    : `receipt:${tenantSlug}:CONTINUOUS`;
}

/**
 * CONTINUOUS: RCPT-<bsYear>-NNNNNN. RESET: RCPT-R<fiscalYear>-NNNNNN — the
 * literal "R" right after "RCPT-" can never appear in that position in a
 * CONTINUOUS string (always a digit there), so the two modes are
 * structurally incapable of colliding regardless of either counter's value.
 */
export function buildReceiptNumber(
  resetPerFiscalYear: boolean,
  bsYear: number,
  fiscalYearBsValue: number,
  seqValue: bigint | number,
): string {
  const padded = seqValue.toString().padStart(6, '0');
  return resetPerFiscalYear ? `RCPT-R${fiscalYearBsValue}-${padded}` : `RCPT-${bsYear}-${padded}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest bill-payment.util.spec.ts`
Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/bill-payment.util.ts apps/api/src/modules/finance/__tests__/bill-payment.util.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint A — gapless receipt numbering (R13, own doctype)"
```

---

## Task 4: `entities/bill-payment.entity.ts` — row types, response DTOs, mappers

**Files:**
- Create: `apps/api/src/modules/finance/entities/bill-payment.entity.ts`

**Interfaces:**
- Consumes: `toMoney` from `./finance.entity`.
- Produces: `BillPaymentRow`, `BillPaymentAllocationRow`, `BillPaymentResponseDto`, `BillPaymentAllocationResponseDto`, `toBillPaymentResponse(row: BillPaymentRow, allocations?: BillPaymentAllocationRow[]): BillPaymentResponseDto`, `toBillPaymentAllocationResponse(row: BillPaymentAllocationRow): BillPaymentAllocationResponseDto`. `BillPaymentService` (Task 6) and its spec (also Task 6) both depend on these exact names/shapes.

No dedicated test file — mirrors `entities/bill-invoice.entity.ts`, which has none either; mappers are exercised indirectly through `BillPaymentService`'s own spec (Task 6).

- [ ] **Step 1: Write the file**

```typescript
// apps/api/src/modules/finance/entities/bill-payment.entity.ts
import { toMoney } from './finance.entity';

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface BillPaymentRow {
  id: string;
  receipt_number: string;
  student_id: string;
  academic_year_id: string;
  amount: string | number;
  method: string;
  status: string;
  received_date: Date | string;
  received_bs_year: number | null;
  received_bs_month: number | null;
  received_bs_day: number | null;
  reference: string | null;
  cheque_bank: string | null;
  cheque_date: Date | string | null;
  allocation_mode: string;
  ledger_entry_id: string | null;
  gateway_txn_ref: string | null;
  notes: string | null;
  received_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BillPaymentAllocationRow {
  id: string;
  bill_payment_id: string;
  bill_invoice_id: string;
  amount: string | number;
  created_at: Date | string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BillPaymentAllocationResponseDto {
  id: string;
  billInvoiceId: string;
  amount: number;
  createdAt: string;
}

export interface BillPaymentResponseDto {
  id: string;
  receiptNumber: string;
  studentId: string;
  academicYearId: string;
  amount: number;
  method: string;
  status: string;
  receivedDate: string;
  receivedBs: { year: number; month: number; day: number } | null;
  reference: string | null;
  chequeBank: string | null;
  chequeDate: string | null;
  allocationMode: string;
  ledgerEntryId: string | null;
  gatewayTxnRef: string | null;
  notes: string | null;
  receivedBy: string;
  createdAt: string;
  allocations?: BillPaymentAllocationResponseDto[];
  /** Sum of this payment's allocations — only present when allocations were loaded. */
  allocatedAmount?: number;
  /** amount - allocatedAmount — the invariant-proof field: allocations + advanceAmount = amount. */
  advanceAmount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Local toIso/toDateOnly copies — matches this codebase's established
// "one private copy per file" convention (see bill-invoice.entity.ts's own note).

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toBillPaymentAllocationResponse(row: BillPaymentAllocationRow): BillPaymentAllocationResponseDto {
  return {
    id: row.id,
    billInvoiceId: row.bill_invoice_id,
    amount: toMoney(row.amount).toNumber(),
    createdAt: toIso(row.created_at),
  };
}

export function toBillPaymentResponse(
  row: BillPaymentRow,
  allocations?: BillPaymentAllocationRow[],
): BillPaymentResponseDto {
  const amount = toMoney(row.amount);
  const allocatedAmount = allocations
    ? allocations.reduce((acc, a) => acc.add(toMoney(a.amount)), toMoney(0))
    : undefined;

  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    studentId: row.student_id,
    academicYearId: row.academic_year_id,
    amount: amount.toNumber(),
    method: row.method,
    status: row.status,
    receivedDate: toDateOnly(row.received_date),
    receivedBs: row.received_bs_year != null && row.received_bs_month != null && row.received_bs_day != null
      ? { year: row.received_bs_year, month: row.received_bs_month, day: row.received_bs_day }
      : null,
    reference: row.reference,
    chequeBank: row.cheque_bank,
    chequeDate: row.cheque_date ? toDateOnly(row.cheque_date) : null,
    allocationMode: row.allocation_mode,
    ledgerEntryId: row.ledger_entry_id,
    gatewayTxnRef: row.gateway_txn_ref,
    notes: row.notes,
    receivedBy: row.received_by,
    createdAt: toIso(row.created_at),
    allocations: allocations?.map(toBillPaymentAllocationResponse),
    ...(allocatedAmount !== undefined
      ? { allocatedAmount: allocatedAmount.toNumber(), advanceAmount: amount.sub(allocatedAmount).toNumber() }
      : {}),
  };
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit`
Expected: no new errors attributable to this file (other pre-existing errors, if any, are unrelated — confirm by checking the file list in the output doesn't include `bill-payment.entity.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/finance/entities/bill-payment.entity.ts
git commit -m "feat(api): BILL-5 Checkpoint A — bill_payments row types, response DTO, mappers"
```

---

## Task 5: `dto/bill-payment.dto.ts` — request DTOs

**Files:**
- Create: `apps/api/src/modules/finance/dto/bill-payment.dto.ts`

**Interfaces:**
- Consumes: `IsMoneyString` from `../../../common/money/is-money-string.validator`.
- Produces: `BillPaymentMethod` enum (`CASH|CHEQUE|BANK_TRANSFER|ESEWA|KHALTI`), `BillPaymentAllocationMode` enum (`AUTO_FIFO|MANUAL|ADVANCE_ONLY`), `ManualAllocationTargetDto { billInvoiceId: string; amount: string }`, `CreateBillPaymentDto { studentId, academicYearId, amount, method, allocationMode, targets?, receivedDate?, reference?, notes? }`, `BillPaymentQueryDto { page?, limit?, studentId?, method?, status?, dateFrom?, dateTo? }`. `BillPaymentController` (Task 7) and `BillPaymentService` (Task 6) both import these.

No dedicated test file — matches convention (no other `dto/*.spec.ts` exists in this module; DTOs are exercised via the live proof + `BillPaymentService`'s spec constructing DTO-shaped objects directly).

- [ ] **Step 1: Write the file**

```typescript
// apps/api/src/modules/finance/dto/bill-payment.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString,
  IsUUID, Max, Min, ValidateNested,
} from 'class-validator';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export enum BillPaymentMethod {
  CASH = 'CASH',
  CHEQUE = 'CHEQUE',
  BANK_TRANSFER = 'BANK_TRANSFER',
  ESEWA = 'ESEWA',
  KHALTI = 'KHALTI',
}

export enum BillPaymentAllocationMode {
  AUTO_FIFO = 'AUTO_FIFO',
  MANUAL = 'MANUAL',
  ADVANCE_ONLY = 'ADVANCE_ONLY',
}

const PAYMENT_STATUSES = ['CLEARED', 'PENDING', 'BOUNCED', 'VOIDED'] as const;

export class ManualAllocationTargetDto {
  @IsUUID() billInvoiceId: string;
  @IsMoneyString() amount: string;
}

/**
 * targets' "required only when allocationMode is MANUAL" is checked in
 * BillPaymentService, not here — matches this codebase's established
 * convention (see CreateBillRunDto's identical comment on classId in
 * bill-run.dto.ts: "this codebase doesn't have a bespoke validator for that
 * shape yet").
 */
export class CreateBillPaymentDto {
  @IsUUID() studentId: string;

  @IsUUID() academicYearId: string;

  @IsMoneyString() amount: string;

  @IsEnum(BillPaymentMethod) method: BillPaymentMethod;

  @IsEnum(BillPaymentAllocationMode) allocationMode: BillPaymentAllocationMode;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualAllocationTargetDto)
  targets?: ManualAllocationTargetDto[];

  /** Defaults to today (Nepal AD) — see BillPaymentService. */
  @IsOptional() @IsDateString() receivedDate?: string;

  @IsOptional() @IsString() reference?: string;

  @IsOptional() @IsString() notes?: string;
}

export class BillPaymentQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @IsEnum(BillPaymentMethod) method?: BillPaymentMethod;
  @IsOptional() @IsEnum(PAYMENT_STATUSES) status?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/finance/dto/bill-payment.dto.ts
git commit -m "feat(api): BILL-5 Checkpoint A — bill payment request DTOs"
```

---

## Task 6: `bill-payment.service.ts` — record + allocate (the core, TDD)

**Files:**
- Create: `apps/api/src/modules/finance/bill-payment.service.ts`
- Test: `apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService` (`.query`, `.execute`), `TenantContextService` (`.getOrThrow()` → `{ slug }`), `LedgerService` (`.withStudentLock`, `.postEntryInTx`), `FinanceSettingsService` (`.getInvoiceNumberingReset()`), `fiscalYearBs` from `./bill-post.util`, `buildReceiptSequenceKey`/`buildReceiptNumber` from `./bill-payment.util` (Task 3), `planAutoFifoAllocation` from `./bill-payment-allocation.util` (Task 2), `toMoney`/`Money`, `bsOf` from `./ledger.util`, `todayAdInNepal` from `../common/utils/date.util`, `adToBs` from `bs-calendar`, DTOs from `./dto/bill-payment.dto` (Task 5), entities from `./entities/bill-payment.entity` (Task 4).
- Produces: `BillPaymentService.recordPayment(dto: CreateBillPaymentDto, receivedById: string): Promise<BillPaymentResponseDto>`, `.findAll(query: BillPaymentQueryDto): Promise<{data, meta}>`, `.findOne(id: string, callerId?: string, callerRole?: Role): Promise<BillPaymentResponseDto>`. `BillPaymentController` (Task 7) depends on these three exact method signatures.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillPaymentService } from '../bill-payment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { LedgerService } from '../ledger.service';
import { FinanceSettingsService } from '../finance-settings.service';
import { Role } from '../../common/enums/role.enum';
import { BillPaymentAllocationMode, BillPaymentMethod, CreateBillPaymentDto } from '../dto/bill-payment.dto';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const mockPaymentRow = {
  id: 'payment-1',
  receipt_number: 'RCPT-2083-000001',
  student_id: 'student-1',
  academic_year_id: 'year-1',
  amount: '5000.00',
  method: 'CASH',
  status: 'CLEARED',
  received_date: new Date('2026-07-29'),
  received_bs_year: 2083, received_bs_month: 4, received_bs_day: 14,
  reference: null, cheque_bank: null, cheque_date: null,
  allocation_mode: 'AUTO_FIFO',
  ledger_entry_id: 'ledger-entry-1',
  gateway_txn_ref: null, notes: null,
  received_by: 'user-1',
  created_at: new Date('2026-07-29'), updated_at: new Date('2026-07-29'), deleted_at: null,
};

function baseDto(overrides: Partial<CreateBillPaymentDto> = {}): CreateBillPaymentDto {
  return {
    studentId: 'student-1',
    academicYearId: 'year-1',
    amount: '5000.00',
    method: BillPaymentMethod.CASH,
    allocationMode: BillPaymentAllocationMode.AUTO_FIFO,
    ...overrides,
  } as CreateBillPaymentDto;
}

describe('BillPaymentService', () => {
  let service: BillPaymentService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let ledgerService: jest.Mocked<LedgerService>;
  let financeSettingsService: jest.Mocked<FinanceSettingsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillPaymentService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo', schemaName: 'tenant_demo' }) } },
        {
          provide: LedgerService,
          useValue: {
            withStudentLock: jest.fn().mockImplementation((_studentId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            postEntryInTx: jest.fn(),
          },
        },
        { provide: FinanceSettingsService, useValue: { getInvoiceNumberingReset: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillPaymentService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    ledgerService = module.get(LedgerService) as jest.Mocked<LedgerService>;
    financeSettingsService = module.get(FinanceSettingsService) as jest.Mocked<FinanceSettingsService>;
    jest.clearAllMocks();
    financeSettingsService.getInvoiceNumberingReset.mockResolvedValue({ invoiceNumberingReset: false });
  });

  function mockExistenceChecks() {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'student-1' }]) // student exists
      .mockResolvedValueOnce([{ id: 'year-1' }]);   // academic year exists
  }

  describe('recordPayment — validation', () => {
    it('404s when the student does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.recordPayment(baseDto(), 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('404s when the academic year does not exist', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([]);
      await expect(service.recordPayment(baseDto(), 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects non-CASH methods this checkpoint', async () => {
      mockExistenceChecks();
      await expect(
        service.recordPayment(baseDto({ method: BillPaymentMethod.BANK_TRANSFER }), 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a zero amount', async () => {
      mockExistenceChecks();
      await expect(service.recordPayment(baseDto({ amount: '0.00' }), 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects MANUAL mode with no targets', async () => {
      mockExistenceChecks();
      await expect(
        service.recordPayment(baseDto({ allocationMode: BillPaymentAllocationMode.MANUAL }), 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordPayment — the 8,500 -> 5,000 -> 3,500 invariant (AUTO_FIFO, single invoice)', () => {
    it('allocates the full amount to the one unpaid invoice, one PAYMENT ledger entry, zero remainder', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', outstanding: '8500.00' }]) // unpaid invoices, oldest-first
        .mockResolvedValueOnce([{ value: BigInt(1) }]) // sequence upsert
        .mockResolvedValueOnce([{ id: 'payment-1' }]) // bill_payments insert RETURNING id
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-1', bill_invoice_id: 'invoice-1', amount: '5000.00', created_at: new Date() }]) // allocations re-select
        .mockResolvedValueOnce([{ ...mockPaymentRow, amount: '5000.00' }]); // payment re-select

      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-1' } as any);

      const result = await service.recordPayment(baseDto({ amount: '5000.00' }), 'user-1');

      expect(ledgerService.withStudentLock).toHaveBeenCalledWith('student-1', expect.any(Function));
      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        studentId: 'student-1', academicYearId: 'year-1', entryType: 'PAYMENT', debit: '0', credit: '5000.00',
      }));
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations'),
        'payment-1', 'invoice-1', '5000.00',
      );
      expect(result.amount).toBe(5000);
      expect(result.allocatedAmount).toBe(5000);
      expect(result.advanceAmount).toBe(0);
    });
  });

  describe('recordPayment — FIFO across three invoices', () => {
    it('settles the two oldest fully, partial on the boundary invoice, leaves the newest untouched', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([
          { id: 'invoice-1', outstanding: '2000.00' },
          { id: 'invoice-2', outstanding: '3000.00' },
          { id: 'invoice-3', outstanding: '1500.00' },
        ])
        .mockResolvedValueOnce([{ value: BigInt(2) }])
        .mockResolvedValueOnce([{ id: 'payment-2' }])
        .mockResolvedValueOnce([
          { id: 'alloc-1', bill_payment_id: 'payment-2', bill_invoice_id: 'invoice-1', amount: '2000.00', created_at: new Date() },
          { id: 'alloc-2', bill_payment_id: 'payment-2', bill_invoice_id: 'invoice-2', amount: '2500.00', created_at: new Date() },
        ])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-2', amount: '4500.00' }]);

      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-2' } as any);

      const result = await service.recordPayment(baseDto({ amount: '4500.00' }), 'user-1');

      expect(result.allocations).toHaveLength(2);
      expect(result.allocatedAmount).toBe(4500);
      expect(result.advanceAmount).toBe(0);
      // invoice-3 never touched
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations'),
        'payment-2', 'invoice-3', expect.anything(),
      );
    });
  });

  describe('recordPayment — ADVANCE_ONLY', () => {
    it('creates zero allocations and a DEPOSIT ledger entry', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ value: BigInt(3) }]) // sequence upsert (no unpaid-invoice query for ADVANCE_ONLY)
        .mockResolvedValueOnce([{ id: 'payment-3' }])
        .mockResolvedValueOnce([]) // allocations re-select: empty
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-3', allocation_mode: 'ADVANCE_ONLY', amount: '2000.00' }]);

      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-3' } as any);

      const result = await service.recordPayment(
        baseDto({ amount: '2000.00', allocationMode: BillPaymentAllocationMode.ADVANCE_ONLY }), 'user-1',
      );

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({ entryType: 'DEPOSIT', credit: '2000.00' }));
      expect(result.allocations).toEqual([]);
      expect(result.advanceAmount).toBe(2000);
    });
  });

  describe('recordPayment — MANUAL over-allocation rejected', () => {
    it('rejects a target amount exceeding that invoice outstanding balance', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'invoice-1', outstanding: '1000.00' }]);

      await expect(
        service.recordPayment(
          baseDto({
            amount: '5000.00',
            allocationMode: BillPaymentAllocationMode.MANUAL,
            targets: [{ billInvoiceId: 'invoice-1', amount: '2000.00' }],
          }),
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the sum of targets exceeds the payment amount', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'invoice-1', outstanding: '3000.00' },
        { id: 'invoice-2', outstanding: '3000.00' },
      ]);

      await expect(
        service.recordPayment(
          baseDto({
            amount: '1000.00',
            allocationMode: BillPaymentAllocationMode.MANUAL,
            targets: [
              { billInvoiceId: 'invoice-1', amount: '600.00' },
              { billInvoiceId: 'invoice-2', amount: '600.00' },
            ],
          }),
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne — PARENT object-scoping', () => {
    it('403s a PARENT who does not own the payment student', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockPaymentRow])
        .mockResolvedValueOnce([]); // guardians lookup: no match
      await expect(service.findOne('payment-1', 'parent-1', Role.PARENT)).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest bill-payment.service.spec.ts`
Expected: FAIL — `Cannot find module '../bill-payment.service'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/finance/bill-payment.service.ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { adToBs } from 'bs-calendar';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { LedgerService } from './ledger.service';
import { FinanceSettingsService } from './finance-settings.service';
import { Money } from '../../common/money/money';
import { toMoney } from './entities/finance.entity';
import { bsOf } from './ledger.util';
import { todayAdInNepal } from '../common/utils/date.util';
import { fiscalYearBs } from './bill-post.util';
import { buildReceiptNumber, buildReceiptSequenceKey } from './bill-payment.util';
import { AllocationPlanItem, planAutoFifoAllocation, UnpaidInvoiceCandidate } from './bill-payment-allocation.util';
import { BillPaymentAllocationMode, BillPaymentMethod, BillPaymentQueryDto, CreateBillPaymentDto } from './dto/bill-payment.dto';
import {
  BillPaymentAllocationRow, BillPaymentResponseDto, BillPaymentRow, toBillPaymentResponse,
} from './entities/bill-payment.entity';
import { Role } from '../common/enums/role.enum';

/**
 * BILL-5-SPEC.md §3/§7 Checkpoint A — record a payment and run the
 * allocation engine, all inside ONE per-student locked transaction
 * (LedgerService.withStudentLock), so the bill_payments insert, its
 * allocations, the bill_invoices status recompute, and the single
 * PAYMENT/DEPOSIT ledger entry are one atomic unit. Mirrors
 * BillRunPostRunnerService.postLine's structure exactly.
 *
 * CASH-only this checkpoint (BANK_TRANSFER is architecturally identical —
 * also born CLEARED per spec §4 — but Checkpoint A's own wording says "CASH
 * payment", so it's deliberately deferred; trivial to add later). CHEQUE/
 * ESEWA/KHALTI need their own checkpoints (B and C).
 */
@Injectable()
export class BillPaymentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly ledgerService: LedgerService,
    private readonly financeSettingsService: FinanceSettingsService,
  ) {}

  async recordPayment(dto: CreateBillPaymentDto, receivedById: string): Promise<BillPaymentResponseDto> {
    const studentRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`, dto.studentId,
    );
    if (!studentRows[0]) throw new NotFoundException(`Student ${dto.studentId} not found`);

    const yearRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM academic_years WHERE id = $1::uuid`, dto.academicYearId,
    );
    if (!yearRows[0]) throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);

    if (dto.method !== BillPaymentMethod.CASH) {
      throw new BadRequestException(
        `Method ${dto.method} is not yet supported — BILL-5 Checkpoint A records CASH payments only`,
      );
    }

    const amount = toMoney(dto.amount);
    if (amount.compare(Money.zero()) <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (dto.allocationMode === BillPaymentAllocationMode.MANUAL && (!dto.targets || dto.targets.length === 0)) {
      throw new BadRequestException('MANUAL allocation requires at least one target invoice');
    }

    const receivedDate = dto.receivedDate ?? todayAdInNepal();
    const bs = bsOf(receivedDate);
    const { invoiceNumberingReset } = await this.financeSettingsService.getInvoiceNumberingReset();
    const todayBs = adToBs(new Date(todayAdInNepal()));
    const fiscalYear = fiscalYearBs(todayBs.year, todayBs.month);
    const { slug } = this.tenantContext.getOrThrow();

    return this.ledgerService.withStudentLock(dto.studentId, async (tx) => {
      let allocations: AllocationPlanItem[];
      let remainder: Money;

      if (dto.allocationMode === BillPaymentAllocationMode.ADVANCE_ONLY) {
        allocations = [];
        remainder = amount;
      } else if (dto.allocationMode === BillPaymentAllocationMode.AUTO_FIFO) {
        const candidates = await this.fetchUnpaidInvoicesOldestFirst(tx, dto.studentId);
        const plan = planAutoFifoAllocation(amount, candidates);
        allocations = plan.allocations;
        remainder = plan.remainder;
      } else {
        const ids = dto.targets!.map((t) => t.billInvoiceId);
        const invoiceMap = await this.fetchInvoicesByIds(tx, dto.studentId, ids);
        let sum = Money.zero();
        allocations = [];
        for (const target of dto.targets!) {
          const invoice = invoiceMap.get(target.billInvoiceId);
          if (!invoice) {
            throw new NotFoundException(`Invoice ${target.billInvoiceId} not found for this student`);
          }
          const targetAmount = toMoney(target.amount);
          if (targetAmount.compare(invoice.outstanding) > 0) {
            throw new BadRequestException(
              `Allocation of ${targetAmount.toDb()} exceeds invoice ${target.billInvoiceId}'s outstanding balance of ${invoice.outstanding.toDb()}`,
            );
          }
          sum = sum.add(targetAmount);
          allocations.push({ billInvoiceId: target.billInvoiceId, amount: targetAmount });
        }
        if (sum.compare(amount) > 0) {
          throw new BadRequestException(`Total allocation ${sum.toDb()} exceeds payment amount ${amount.toDb()}`);
        }
        remainder = amount.sub(sum);
      }

      const seqKey = buildReceiptSequenceKey(slug, invoiceNumberingReset, fiscalYear);
      const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
        `INSERT INTO sequences (key, value) VALUES ($1, 1)
         ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
         RETURNING value`,
        seqKey,
      );
      const receiptNumber = buildReceiptNumber(invoiceNumberingReset, todayBs.year, fiscalYear, seqRow.value);

      const [payment] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO bill_payments
           (receipt_number, student_id, academic_year_id, amount, method, status,
            received_date, received_bs_year, received_bs_month, received_bs_day,
            reference, allocation_mode, notes, received_by)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, 'CLEARED',
                 $6::date, $7, $8, $9,
                 $10, $11, $12, $13::uuid)
         RETURNING id`,
        receiptNumber, dto.studentId, dto.academicYearId, amount.toDb(), dto.method,
        receivedDate, bs.year, bs.month, bs.day,
        dto.reference ?? null, dto.allocationMode, dto.notes ?? null, receivedById,
      );

      for (const alloc of allocations) {
        await tx.$executeRawUnsafe(
          `INSERT INTO bill_payment_allocations (bill_payment_id, bill_invoice_id, amount)
           VALUES ($1::uuid, $2::uuid, $3)`,
          payment.id, alloc.billInvoiceId, alloc.amount.toDb(),
        );
        await tx.$executeRawUnsafe(
          `UPDATE bill_invoices SET
             status = CASE
               WHEN total_receivable <= (
                 SELECT COALESCE(SUM(amount), 0) FROM bill_payment_allocations WHERE bill_invoice_id = $1::uuid
               ) THEN 'SETTLED'
               ELSE 'PARTIALLY_PAID'
             END,
             updated_at = NOW()
           WHERE id = $1::uuid`,
          alloc.billInvoiceId,
        );
      }

      const entryType = allocations.length > 0 ? 'PAYMENT' : 'DEPOSIT';
      const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
        studentId: dto.studentId,
        academicYearId: dto.academicYearId,
        entryType,
        debit: '0',
        credit: amount.toDb(),
        narration: `${entryType === 'PAYMENT' ? 'Payment' : 'Deposit'} ${receiptNumber}`,
        refDocType: 'bill_payment',
        refDocId: payment.id,
        createdById: receivedById,
      });

      await tx.$executeRawUnsafe(
        `UPDATE bill_payments SET ledger_entry_id = $1::uuid WHERE id = $2::uuid`,
        ledgerEntry.id, payment.id,
      );

      const allocRows = await tx.$queryRawUnsafe<BillPaymentAllocationRow[]>(
        `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`,
        payment.id,
      );
      const [paymentRow] = await tx.$queryRawUnsafe<BillPaymentRow[]>(
        `SELECT * FROM bill_payments WHERE id = $1::uuid`,
        payment.id,
      );

      return toBillPaymentResponse(paymentRow, allocRows);
    });
  }

  async findAll(query: BillPaymentQueryDto): Promise<{
    data: BillPaymentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['bp.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;
    if (query.studentId) { conditions.push(`bp.student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.method) { conditions.push(`bp.method = $${idx++}`); params.push(query.method); }
    if (query.status) { conditions.push(`bp.status = $${idx++}`); params.push(query.status); }
    if (query.dateFrom) { conditions.push(`bp.received_date >= $${idx++}::date`); params.push(query.dateFrom); }
    if (query.dateTo) { conditions.push(`bp.received_date <= $${idx++}::date`); params.push(query.dateTo); }

    params.push(limit, offset);
    const rows = await this.tenantPrisma.query<BillPaymentRow>(
      `SELECT bp.*, COUNT(*) OVER() AS total_count
       FROM bill_payments bp
       WHERE ${conditions.join(' AND ')}
       ORDER BY bp.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map((r) => toBillPaymentResponse(r)), meta: { page, limit, total } };
  }

  async findOne(id: string, callerId?: string, callerRole?: Role): Promise<BillPaymentResponseDto> {
    const rows = await this.tenantPrisma.query<BillPaymentRow>(
      `SELECT * FROM bill_payments WHERE id = $1::uuid AND deleted_at IS NULL`, id,
    );
    if (!rows[0]) throw new NotFoundException(`Payment ${id} not found`);

    if (callerRole === Role.PARENT && callerId) {
      await this.assertGuardianOwnsStudent(rows[0].student_id, callerId);
    }

    const allocations = await this.tenantPrisma.query<BillPaymentAllocationRow>(
      `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`, id,
    );
    return toBillPaymentResponse(rows[0], allocations);
  }

  private async fetchUnpaidInvoicesOldestFirst(tx: TenantTx, studentId: string): Promise<UnpaidInvoiceCandidate[]> {
    const rows = await tx.$queryRawUnsafe<{ id: string; outstanding: string }[]>(
      `SELECT bi.id,
              bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
       FROM bill_invoices bi
       LEFT JOIN bill_payment_allocations bpa ON bpa.bill_invoice_id = bi.id
       WHERE bi.student_id = $1::uuid AND bi.deleted_at IS NULL
         AND bi.status IN ('POSTED', 'PARTIALLY_PAID')
       GROUP BY bi.id, bi.total_receivable, bi.issue_date, bi.created_at
       HAVING bi.total_receivable - COALESCE(SUM(bpa.amount), 0) > 0
       ORDER BY bi.issue_date ASC, bi.created_at ASC`,
      studentId,
    );
    return rows.map((r) => ({ billInvoiceId: r.id, outstanding: toMoney(r.outstanding) }));
  }

  private async fetchInvoicesByIds(
    tx: TenantTx, studentId: string, ids: string[],
  ): Promise<Map<string, UnpaidInvoiceCandidate>> {
    const rows = await tx.$queryRawUnsafe<{ id: string; outstanding: string }[]>(
      `SELECT bi.id,
              bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
       FROM bill_invoices bi
       LEFT JOIN bill_payment_allocations bpa ON bpa.bill_invoice_id = bi.id
       WHERE bi.student_id = $1::uuid AND bi.deleted_at IS NULL
         AND bi.status != 'VOIDED' AND bi.id = ANY($2::uuid[])
       GROUP BY bi.id`,
      studentId, ids,
    );
    return new Map(rows.map((r) => [r.id, { billInvoiceId: r.id, outstanding: toMoney(r.outstanding) }]));
  }

  private async assertGuardianOwnsStudent(studentId: string, callerId: string): Promise<void> {
    const children = await this.tenantPrisma.query<{ student_id: string }>(
      `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
      callerId,
    );
    if (!children.some((c) => c.student_id === studentId)) {
      throw new ForbiddenException('Access denied');
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest bill-payment.service.spec.ts`
Expected: PASS, all cases. If the AUTO_FIFO/FIFO-across-three mocks fail on call ordering, check the exact `$queryRawUnsafe` call sequence against the implementation (unpaid-invoices query → sequence upsert → payment insert → allocations re-select → payment re-select) and adjust the `mockResolvedValueOnce` chain to match, not the implementation.

- [ ] **Step 5: Run the full existing finance suite to confirm no regression**

Run: `npx jest apps/api/src/modules/finance`
Expected: all pre-existing finance suites still pass (untouched files — `bill-run-post-runner.service.ts`, `ledger.service.ts`, etc. — are not modified by this task).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/finance/bill-payment.service.ts apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint A — BillPaymentService (record + allocate, CASH/AUTO_FIFO/MANUAL/ADVANCE_ONLY)"
```

---

## Task 7: `bill-payment.controller.ts` + module wiring

**Files:**
- Create: `apps/api/src/modules/finance/bill-payment.controller.ts`
- Modify: `apps/api/src/modules/finance/finance.module.ts`

**Interfaces:**
- Consumes: `BillPaymentService` (Task 6), `CreateBillPaymentDto`/`BillPaymentQueryDto`/`BillPaymentAllocationMode` (Task 5), `JwtAuthGuard`/`RolesGuard`/`Roles`/`CurrentUser`/`Role`/`AuthUser` (existing common infra, same imports as `bill-invoice.controller.ts`).
- Produces: `POST /finance/bill/payments`, `GET /finance/bill/payments`, `GET /finance/bill/payments/:id`, registered in `FinanceModule`.

- [ ] **Step 1: Write the controller**

```typescript
// apps/api/src/modules/finance/bill-payment.controller.ts
import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { BillPaymentService } from './bill-payment.service';
import { BillPaymentAllocationMode, BillPaymentQueryDto, CreateBillPaymentDto } from './dto/bill-payment.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/**
 * BILL-5-SPEC.md §5. B5-3's MANUAL-allocation "behind a permission" is
 * enforced HERE, not via @Roles() on the route (the base ACCOUNTANT_AND_ABOVE
 * gate already covers the whole endpoint; MANUAL depends on the request
 * BODY, which a declarative role guard can't discriminate on) — a plain
 * ACCOUNTANT posting AUTO_FIFO/ADVANCE_ONLY is fine, but MANUAL requires
 * PRINCIPAL_AND_ABOVE.
 */
const MANUAL_ALLOCATION_ROLES = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillPaymentController {
  constructor(private readonly billPaymentService: BillPaymentService) {}

  @Post('bill/payments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  recordPayment(@Body() dto: CreateBillPaymentDto, @CurrentUser() user: AuthUser) {
    if (dto.allocationMode === BillPaymentAllocationMode.MANUAL && !MANUAL_ALLOCATION_ROLES.includes(user.role)) {
      throw new ForbiddenException('MANUAL allocation requires PRINCIPAL role or above');
    }
    return this.billPaymentService.recordPayment(dto, user.userId);
  }

  @Get('bill/payments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  findAll(@Query() query: BillPaymentQueryDto) {
    return this.billPaymentService.findAll(query);
  }

  @Get('bill/payments/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.billPaymentService.findOne(id, user.userId, user.role);
  }
}
```

- [ ] **Step 2: Wire into `finance.module.ts`**

In `apps/api/src/modules/finance/finance.module.ts`, add imports and register:

```typescript
import { BillPaymentService } from './bill-payment.service';
import { BillPaymentController } from './bill-payment.controller';
```

Add `BillPaymentController` to the `controllers` array (after `BillInvoiceController`) and `BillPaymentService` to the `providers` array (after `BillInvoiceService`).

- [ ] **Step 3: Type-check and boot-verify**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: clean.

Run: `npm run start:dev` (or however local dev server is started), confirm no NestJS DI resolution errors on boot (missing provider, circular dependency) — check the startup log for `BillPaymentController`/`BillPaymentService` route-mapped lines (`Mapped {/api/v1/finance/bill/payments, POST}` etc.).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/finance/bill-payment.controller.ts apps/api/src/modules/finance/finance.module.ts
git commit -m "feat(api): BILL-5 Checkpoint A — bill payment endpoints (POST record, GET list/detail)"
```

---

## Task 8: Full suite run + BILL-BUGS.md deviation log

**Files:**
- Modify: `BILL-BUGS.md`

**Interfaces:** None — documentation task.

- [ ] **Step 1: Run the full API test suite**

Run: `cd apps/api && npm test`
Expected: all suites pass, including every new file from Tasks 2/3/6 and every pre-existing suite untouched. Record the exact `Tests: X passed, Y total` / `Test Suites: A passed, B total` line for the Checkpoint A report.

- [ ] **Step 2: Full type-check**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: clean (0 errors).

- [ ] **Step 3: Log deviations in `BILL-BUGS.md`**

Prepend a new newest-first entry (after the `---` following the header, before the existing `TRANSPORT-ITEM` entry), matching the established format:

```markdown
## BILL-5 Checkpoint A — payment engine core (2026-07-29, branch `feat/bill-5-payments`)

**Cross-phase touch NOT listed in BILL-5-SPEC.md §8, found while implementing:** `student_ledger_entries.entry_type`'s CHECK constraint (`0021_bill_ledger.sql`) only allowed `OPENING_BALANCE, INVOICE, PAYMENT, REFUND, CREDIT_NOTE, FINE, WRITE_OFF, ADJUSTMENT` — no `DEPOSIT`, even though B5-9 explicitly requires a `DEPOSIT` entry type for pure-advance (`ADVANCE_ONLY`) payments. Widened in `0024_bill_payments.sql` via a catalog-driven `DO` block (the original CHECK was inline/auto-named, not given an explicit constraint name, so the fix looks it up via `pg_constraint` rather than guessing the generated name).

**B5-3 "behind a permission" ruling (Srijan, asked directly — no existing finer-grained permission system exists in this codebase, confirmed by grep):** MANUAL allocation requires `PRINCIPAL_AND_ABOVE`, narrower than the endpoint's base `ACCOUNTANT_AND_ABOVE` gate. A plain `ACCOUNTANT` (cashier) may record `AUTO_FIFO`/`ADVANCE_ONLY` payments but not override which invoice gets paid. Enforced in `BillPaymentController.recordPayment` (not via `@Roles()`, since the check depends on the request body's `allocationMode`, not the route).

**Checkpoint A method scope: CASH only.** `BillPaymentMethod`/the migration's CHECK declare the full B5-6 enum (`CASH, CHEQUE, BANK_TRANSFER, ESEWA, KHALTI`) as the permanent wire contract, but `BillPaymentService.recordPayment` rejects anything but `CASH` with a 400 this checkpoint. `BANK_TRANSFER` is architecturally identical to `CASH` (also born `CLEARED` immediately per spec §4) and would need zero new logic to enable — deliberately deferred anyway since Checkpoint A's own spec wording says "a CLEARED cash payment," not "cash and bank-transfer." Trivial to lift whenever wanted.

**Checkpoint A endpoint scope: `GET /finance/students/:studentId/statement` and `GET /finance/students/:studentId/advance-balance` (BILL-5-SPEC.md §5) were NOT built this checkpoint** — neither appears in Checkpoint A's own §7 description, and the existing `GET /finance/students/:studentId/balance` (`LedgerService.getBalance`, already returns `{balance, sign: 'OWES'|'ADVANCE'|'ZERO'}`) already covers what Checkpoint A's own live-proof tests need (spec test 6: "advance-balance rises"). Flagged for confirmation, not silently dropped from the phase — both remain in scope for a later checkpoint if still wanted as dedicated routes.

**Full suite: <FILL IN FROM STEP 1> tests, <FILL IN> suites** (was 911 after the FIX-RESET-COLLISION/TRANSPORT-ITEM cleanup pass). `tsc -p tsconfig.build.json --noEmit` clean.

**Live proof:** see Tasks 9-10 below / the Checkpoint A report.
```

- [ ] **Step 4: Commit**

```bash
git add BILL-BUGS.md
git commit -m "docs(api): BILL-5 Checkpoint A — deviations log (DEPOSIT CHECK widen, MANUAL permission ruling, CASH-only scope)"
```

---

## Task 9: Live proof — the 8,500 → 5,000 → 3,500 invariant

**Files:** None created/modified — this is a live verification task against the running dev server + `scratch` (or `demo`) tenant Postgres schema, not code.

- [ ] **Step 1: Start the dev server**

Run: `cd apps/api && npm run start:dev` (confirm clean boot, no orphaned prior process on the port — `netstat`/`tasklist` check first, per the TRANSPORT-ITEM checkpoint's documented gotcha).

- [ ] **Step 2: Set up live-proof data on `scratch`**

Via the real HTTP API (not direct SQL inserts) against the `scratch` tenant: pick or create one student with NO existing unpaid `bill_invoices`. Post ONE `bill_run` → post it, producing a single `bill_invoice` with `total_receivable = 8500.00` (either use an existing fee structure that resolves to exactly 8500, or construct one — e.g. a fresh fee head of 8500/mo — read-first, matching the six-point discipline).

Raw `SELECT` read-back: confirm exactly one `bill_invoices` row for this student, `status='POSTED'`, `total_receivable='8500.00'`, and `SELECT balance FROM student_account_balances WHERE student_id=...` shows `8500.00`.

- [ ] **Step 3: Record the CASH payment via live HTTP**

`POST /api/v1/finance/bill/payments` (as an ACCOUNTANT-or-above authenticated caller) with:
```json
{
  "studentId": "<the student's id>",
  "academicYearId": "<the invoice's academic_year_id>",
  "amount": "5000.00",
  "method": "CASH",
  "allocationMode": "AUTO_FIFO"
}
```
Expected HTTP response: `success: true`, `data.amount: 5000`, `data.allocations` has exactly one entry (`billInvoiceId` = the invoice, `amount: 5000`), `data.allocatedAmount: 5000`, `data.advanceAmount: 0`, `data.receiptNumber` matches `RCPT-<bsYear>-NNNNNN`.

- [ ] **Step 4: Raw Postgres read-back — the invariant**

```sql
-- exactly one PAYMENT ledger entry for this payment
SELECT entry_type, debit, credit, ref_doc_type, ref_doc_id FROM student_ledger_entries
WHERE ref_doc_type = 'bill_payment' AND ref_doc_id = '<payment id>';
-- expect: exactly 1 row, entry_type='PAYMENT', debit=0.00, credit=5000.00

-- allocations + remainder = amount
SELECT amount FROM bill_payment_allocations WHERE bill_payment_id = '<payment id>';
-- expect: exactly 1 row, amount=5000.00 (and response's advanceAmount was 0 — 5000 + 0 = 5000)

-- balance moved by exactly 5000
SELECT balance FROM student_account_balances WHERE student_id = '<student id>';
-- expect: 3500.00 (was 8500.00)

SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM student_ledger_entries WHERE student_id = '<student id>';
-- expect: 3500.00 — matches the cached balance (no drift)

-- the invoice moved to PARTIALLY_PAID (5000 < 8500)
SELECT status FROM bill_invoices WHERE id = '<invoice id>';
-- expect: PARTIALLY_PAID
```

- [ ] **Step 5: Record findings verbatim**

Copy the raw terminal/psql output (not paraphrased) into the Checkpoint A report — matching every prior BILL-* checkpoint's "Live proof" section format in `BILL-BUGS.md`/prior PR descriptions.

---

## Task 10: Live proof — FIFO across three invoices

**Files:** None — live verification.

- [ ] **Step 1: Set up three unpaid invoices for one student**

On `scratch`, pick a DIFFERENT student (or the same one after Task 9's invoice is fully SETTLED — cleaner to use a fresh student to avoid interaction with Task 9's PARTIALLY_PAID invoice). Via three separate `bill_run`s posted for three different BS months (or three students... no — must be the SAME student, three different billing periods), produce three `bill_invoices` with `total_receivable` = 2000.00, 3000.00, 1500.00 respectively, oldest `issue_date` first.

Raw `SELECT` read-back: confirm 3 `bill_invoices` rows for this student, all `status='POSTED'`, ordered by `issue_date` matching the 2000/3000/1500 sequence.

- [ ] **Step 2: Record the CASH payment via live HTTP**

`POST /api/v1/finance/bill/payments`:
```json
{
  "studentId": "<student id>",
  "academicYearId": "<academic year id>",
  "amount": "4500.00",
  "method": "CASH",
  "allocationMode": "AUTO_FIFO"
}
```
Expected: `data.allocations` has exactly TWO entries — the oldest invoice fully allocated 2000.00, the second-oldest partially allocated 2500.00; the third (newest) invoice does not appear. `data.allocatedAmount: 4500`, `data.advanceAmount: 0`.

- [ ] **Step 3: Raw Postgres read-back**

```sql
SELECT bill_invoice_id, amount FROM bill_payment_allocations WHERE bill_payment_id = '<payment id>' ORDER BY created_at;
-- expect: 2 rows — (invoice-1, 2000.00), (invoice-2, 2500.00)

SELECT id, status, total_receivable FROM bill_invoices WHERE student_id = '<student id>' ORDER BY issue_date;
-- expect: invoice-1 SETTLED (2000 allocated == 2000 total), invoice-2 PARTIALLY_PAID (2500 allocated < 3000 total), invoice-3 POSTED (untouched, 0 allocated)

SELECT entry_type, debit, credit FROM student_ledger_entries WHERE ref_doc_type = 'bill_payment' AND ref_doc_id = '<payment id>';
-- expect: exactly 1 row, PAYMENT, credit=4500.00

SELECT balance FROM student_account_balances WHERE student_id = '<student id>';
-- expect: (2000+3000+1500) - 4500 = 2000.00
```

- [ ] **Step 4: Record findings verbatim**

Same as Task 9 Step 5.

---

## Task 11: Live proof — MANUAL allocation, permission gate, and ADVANCE_ONLY (lighter pass)

**Files:** None — live verification. Included per the standing "every change proven with live HTTP + raw SELECT, mocked tests never accepted as proof for money/ledger code" rule — the unit tests in Task 6 cover these paths, but every write path this checkpoint built gets at least one live confirmation, not just the two headline invariants the checkpoint explicitly requires.

- [ ] **Step 1: MANUAL allocation — permission denied**

As a plain `ACCOUNTANT`-role user, `POST /finance/bill/payments` with `allocationMode: "MANUAL"` and any `targets`. Expected: `403 Forbidden`.

- [ ] **Step 2: MANUAL allocation — permitted, targets a newer invoice over an older one**

As a `PRINCIPAL`-or-above user, using a student with two unpaid invoices (older + newer), `POST` with `allocationMode: "MANUAL"`, `targets: [{ billInvoiceId: <newer invoice>, amount: "<its total>" }]`. Expected: 200, the OLDER invoice is untouched (still `POSTED`, 0 allocated) — proving MANUAL genuinely overrides FIFO ordering, not just a relabeled AUTO_FIFO.

Raw `SELECT`: confirm the older invoice's `bill_payment_allocations` count is 0, the newer invoice's is 1.

- [ ] **Step 3: ADVANCE_ONLY deposit**

`POST /finance/bill/payments` with `allocationMode: "ADVANCE_ONLY"`, no `targets`, against a student with zero unpaid invoices (or ignoring any). Expected: 200, `data.allocations: []`, `data.advanceAmount` = the full amount.

Raw `SELECT`:
```sql
SELECT entry_type, debit, credit FROM student_ledger_entries WHERE ref_doc_type = 'bill_payment' AND ref_doc_id = '<payment id>';
-- expect: entry_type='DEPOSIT'

SELECT sign, balance FROM ... -- via GET /finance/students/:studentId/balance
-- expect: sign='ADVANCE', balance negative (or the endpoint's own ADVANCE-sign convention)
```

- [ ] **Step 4: Cross-tenant + IDOR spot-check**

`GET /finance/bill/payments/:id` for a payment on `scratch`, authenticated against a DIFFERENT tenant (or a `PARENT` who is not the payment student's guardian). Expected: 403/404 per existing `assertGuardianOwnsStudent`/tenant-isolation behavior (same mechanism as `BillInvoiceService`, unchanged).

- [ ] **Step 5: Clean up all live-proof scaffolding**

Per every prior BILL-* checkpoint's documented practice: delete/soft-delete every crafted student-fee-structure assignment, fee head, bill run, invoice, payment created purely for this proof (if they're not meant to be permanent — cross-check with Srijan whether Checkpoint A's proof data on `scratch` should stay or be cleaned, since `scratch` may be intended as reusable throwaway ground, unlike `demo`). Restore any password shim used to authenticate as different roles, with a 401 read-back proving the restore took effect. Record exact counts before/after cleanup (read-back pattern, e.g. "guardians count read-back 1→0").

- [ ] **Step 6: Record findings verbatim**

Same format as Tasks 9-10.

---

## Self-Review Notes (for the plan author, not a task)

**Spec coverage check against BILL-5-SPEC.md §7 Checkpoint A:**
- "Migration canary-first" → Task 1. ✓
- "Recording a CLEARED cash payment with AUTO_FIFO and MANUAL allocation" → Task 6 (service), Tasks 9-11 (live proof). ✓
- "advance deposit" (ADVANCE_ONLY) → Task 6, Task 11. ✓
- "Live proof: the 5,000→3,500 invariant... plus a FIFO-across-three-invoices proof" → Tasks 9-10, exactly as specified by the user's stop condition. ✓
- B5-8 gapless receipt numbers via R13 → Task 3. ✓
- B5-9 exactly one ledger entry per payment, same transaction, under the lock → Task 6's `recordPayment`, entirely inside `withStudentLock`. ✓
- B5-1 additive tables, not a rewrite of `payments` → Task 1, `payments`/`invoices`/R10 rail untouched anywhere in this plan. ✓
- Explicitly OUT of scope and NOT built anywhere in this plan: cheque lifecycle (B5-5), void (B5-11), advance-auto-apply-on-post (B5-4's post-runner touch), eSewa/Khalti re-pointing (B5-10) — matches the user's explicit instruction.

**Placeholder scan:** no TBD/TODO, no "add appropriate error handling," no "similar to Task N" — every task has literal, complete code.

**Type consistency check:** `AllocationPlanItem` (Task 2) used identically in Task 6's service (`AllocationPlanItem[]` for the `allocations` local variable). `BillPaymentRow`/`BillPaymentAllocationRow`/`BillPaymentResponseDto`/`toBillPaymentResponse` (Task 4) used identically in Task 6. `CreateBillPaymentDto`/`BillPaymentQueryDto`/`BillPaymentMethod`/`BillPaymentAllocationMode`/`ManualAllocationTargetDto` (Task 5) used identically in Tasks 6-7. `BillPaymentService.recordPayment/findAll/findOne` signatures (Task 6) match exactly what Task 7's controller calls.
