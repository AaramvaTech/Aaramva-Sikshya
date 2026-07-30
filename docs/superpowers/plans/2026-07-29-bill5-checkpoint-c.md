# BILL-5 Checkpoint C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-point eSewa/Khalti from the old `invoices` table to `bill_invoices` (BILL-5-SPEC.md §7 Checkpoint C) — the sole deliberate touch of the R10-frozen gateway rail, per Srijan's pre-flight ruling (`docs/api-contracts/BILL-5-checkpoint-c-preflight.md`): additive only, old `payments`/`payment_transactions` contract fully preserved, old gateway code path left fully intact (no retirement — that belongs to a future separate cutover), `PAY-UI-REPOINT` logged as an explicit follow-up (not this checkpoint's job).

**Architecture:** Extract `BillPaymentService.recordPaymentInTx` (a resolved-params primitive, not re-validating business rules — mirrors `LedgerService.postEntry`/`postEntryInTx` and `reverse`/`reverseInTx`, now a *third* instance of this exact split in this codebase). `EsewaService`/`KhaltiService` reuse the *unchanged* conditional-claim idempotency mechanism (`transaction_uuid UNIQUE` + `status IN ('INITIATED','EXPIRED')`), composing their claim into `LedgerService.withStudentLock` so the claim and the new `recordPaymentInTx` call share one transaction — same shape the old rail already has, just swapping which table gets credited. `payment_transactions` gains two nullable sibling columns (`bill_invoice_id`, `bill_payment_id`) alongside the existing `invoice_id`/`payment_id`, gated by a one-of-two CHECK — the exact TRANSPORT-ITEM pattern already established in this codebase.

**Tech Stack:** Same as A/B — NestJS, raw SQL via `TenantPrismaService`, `Money`, class-validator DTOs, Jest.

## Global Constraints

- **Checkpoint C is the LAST checkpoint in BILL-5-SPEC.md.** No Checkpoint D exists.
- **Additive only.** `payment.service.ts`, the old `invoices`/`payments` tables, `FinanceController`'s manual cash-recording, `payment-gateways.controller.ts` — all untouched. Confirmed by reading every file first (see the pre-flight doc).
- **The idempotency mechanism does not change.** `transaction_uuid UNIQUE` + the conditional claim UPDATE is already proven (PAY-1/PAY-2 double-callback tests exist today) — reused verbatim, just composed into a different lock/record call.
- **MANUAL, capped at current outstanding, not a blind full-amount target.** A gateway credit can arrive minutes after initiation; if the invoice's outstanding shrank in the meantime (e.g., a cash payment landed on it first), targeting the full original amount would incorrectly throw inside `recordPaymentInTx`'s MANUAL over-allocation guard. Found by reasoning through the race, not assumed: cap the MANUAL target at `min(claimedAmount, currentOutstanding)` (a fresh re-check, inside the lock, immediately before recording), and if `currentOutstanding <= 0` (invoice already fully settled by another channel), fall back to `ADVANCE_ONLY` for the full claimed amount instead of a zero/negative MANUAL target — honoring B5-7 ("overpayment becomes advance credit, never rejected").
- **eSewa's live sandbox proof proceeds now** (`ESEWA_PRODUCT_CODE`/`ESEWA_SECRET_KEY` already live in `.env`, confirmed). **Khalti's live sandbox proof is independent and may be deferred** — `KHALTI_SECRET_KEY` is currently empty; Srijan is handling the `test-admin.khalti.com` signup separately. Khalti's *code* still gets built and unit-tested fully in this checkpoint (symmetric diff, no reason to leave it half-done) — only the *live click-through* waits on his signup.
- Same live-proof discipline as A/B: live HTTP + raw Postgres `SELECT`, scaffolding cleaned up, password shims restored and 401-proven.
- Never call `ScheduleWakeup` or any self-scheduling primitive (standing rule, `CLAUDE.md`).
- Every deviation/design decision logged in `BILL-BUGS.md`, newest-first — including the MANUAL-capping race-condition finding above.

---

## File Structure

**Create:**
- `apps/api/migrations/tenant/0026_payment_transactions_bill_invoices.sql` — nullable `invoice_id`, new `bill_invoice_id`/`bill_payment_id`, one-of-two CHECK.

**Modify:**
- `apps/api/src/modules/finance/bill-payment.service.ts` — extract `recordPaymentInTx(tx, params, receivedById)` from `recordPayment` (resolved-params shape, not the raw DTO — the gateway caller has no `CreateBillPaymentDto` to build, it has already-resolved values).
- `apps/api/src/modules/finance/esewa/esewa.service.ts` — `initiate()` queries `bill_invoices`; `creditOnce()` composes into `LedgerService.withStudentLock` + `BillPaymentService.recordPaymentInTx` with the outstanding-capping logic; `getReceipt()` joins `bill_invoices`; constructor swaps `PaymentService` for `BillPaymentService` + `LedgerService`.
- `apps/api/src/modules/finance/khalti/khalti.service.ts` — identical shape of changes.
- `apps/api/src/modules/finance/dto/esewa.dto.ts`, `dto/khalti.dto.ts` — doc-comment only (no field rename, per Srijan's ruling): `invoiceId` now means a `bill_invoices.id`.
- Test files: `__tests__/bill-payment.service.spec.ts` (new `recordPaymentInTx` cases, existing `recordPayment` cases must pass unchanged), new `__tests__/esewa.service.spec.ts` cases (existing ones must pass unchanged — confirm baseline first), same for `khalti.service.spec.ts`.
- `BILL-BUGS.md`.

**NOT modified (confirmed, listed so nothing is a surprise):** `payment.service.ts`, `esewa-public.controller.ts`, `khalti-public.controller.ts`, `esewa.controller.ts`, `khalti.controller.ts`, `payment-gateways.controller.ts`, `FinanceController`.

---

## Task 1: Migration `0026_payment_transactions_bill_invoices.sql`

**Files:**
- Create: `apps/api/migrations/tenant/0026_payment_transactions_bill_invoices.sql`

**Interfaces:**
- Produces: `payment_transactions.invoice_id` becomes nullable; new nullable `bill_invoice_id UUID REFERENCES bill_invoices(id)`, `bill_payment_id UUID REFERENCES bill_payments(id)`; `CHECK` ensuring exactly one of `invoice_id`/`bill_invoice_id` is set.

- [ ] **Step 1: Write the migration**

```sql
-- 0026_payment_transactions_bill_invoices.sql — BILL-5 Checkpoint C
-- Per BILL-5-SPEC.md §7/§8 and Srijan's pre-flight ruling
-- (docs/api-contracts/BILL-5-checkpoint-c-preflight.md). Purely additive:
-- payment_transactions' existing columns, meaning, and constraints are
-- fully preserved for every historical row (invoice_id stays populated for
-- them, unchanged). Only NEW gateway-initiated rows (after this migration)
-- set bill_invoice_id instead — mirrors the exact one-of-two-kinds CHECK
-- pattern already used for bill_invoice_items.fee_head_id/
-- transport_route_id (TRANSPORT-ITEM).

ALTER TABLE payment_transactions
  ALTER COLUMN invoice_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS bill_invoice_id UUID REFERENCES bill_invoices(id),
  ADD COLUMN IF NOT EXISTS bill_payment_id UUID REFERENCES bill_payments(id);

ALTER TABLE payment_transactions
  ADD CONSTRAINT chk_payment_transactions_one_invoice_kind
  CHECK ((invoice_id IS NOT NULL)::int + (bill_invoice_id IS NOT NULL)::int = 1);
```

- [ ] **Step 2: Confirm LF-pinned, dry-run, canary-apply to demo, verify every existing row still satisfies the new CHECK, roll to all**

```
git check-attr text eol -- apps/api/migrations/tenant/0026_payment_transactions_bill_invoices.sql   # expect eol: lf
cd apps/api
npm run migrate:tenants -- --tenant demo --dry-run
npm run migrate:tenants -- --tenant demo
npm run migrate:tenants -- --status
npm run migrate:tenants
npm run migrate:tenants -- --status
```

Live verify on `demo` via `psql`: every existing `payment_transactions` row (there are some from the original PAY-1/PAY-2 live proofs) still has `invoice_id IS NOT NULL AND bill_invoice_id IS NULL` — the CHECK's own `= 1` sum proves this automatically (the migration would have failed to apply if any historical row violated it, since `ADD CONSTRAINT` validates existing rows by default).

- [ ] **Step 3: Commit**

```bash
git add apps/api/migrations/tenant/0026_payment_transactions_bill_invoices.sql
git commit -m "feat(api): BILL-5 Checkpoint C — payment_transactions bill_invoices/bill_payments columns"
```

---

## Task 2: `BillPaymentService.recordPaymentInTx` extraction (TDD, existing `recordPayment` tests must pass unchanged)

**Files:**
- Modify: `apps/api/src/modules/finance/bill-payment.service.ts`
- Modify: `apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts`

**Interfaces:**
- Produces: 
```typescript
export interface RecordPaymentInTxParams {
  studentId: string;
  academicYearId: string;
  amount: Money;
  method: BillPaymentMethod;
  allocationMode: BillPaymentAllocationMode;
  targets?: { billInvoiceId: string; amount: string }[];
  receivedDate?: string;
  reference?: string;
  chequeBank?: string;
  chequeDate?: string;
  notes?: string;
}
```
`BillPaymentService.recordPaymentInTx(tx: TenantTx, params: RecordPaymentInTxParams, receivedById: string): Promise<BillPaymentResponseDto>` — does NOT re-validate the CASH/CHEQUE-only method restriction (the gateway path passes `ESEWA`/`KHALTI` directly) or cheque-field requirements (the gateway never sets `method: CHEQUE`) — those stay exclusively in `recordPayment()`'s pre-lock validation, matching how `reverseInTx`/`postEntryInTx` trust their caller. `EsewaService`/`KhaltiService` (Tasks 3-4) call `recordPaymentInTx` directly.

- [ ] **Step 1: Write the failing test — `recordPaymentInTx` is directly callable with a pre-resolved param object, no DTO needed**

Read the current `recordPayment` body first (it's the exact text quoted in this plan's own research) to confirm nothing shifted since. Add to `bill-payment.service.spec.ts`:

```typescript
describe('recordPaymentInTx — callable directly with resolved params, bypassing recordPayment\'s own validation', () => {
  it('records an ESEWA payment (a method recordPayment() itself would reject) when called directly', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'invoice-1', outstanding: '5000.00' }]) // fetchInvoicesByIds (MANUAL target)
      .mockResolvedValueOnce([{ value: BigInt(9) }])
      .mockResolvedValueOnce([{ id: 'payment-esewa-1' }])
      .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-esewa-1', bill_invoice_id: 'invoice-1', amount: '5000.00', created_at: new Date() }])
      .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-esewa-1', method: 'ESEWA', amount: '5000.00' }]);
    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-esewa-1' } as any);

    const result = await service.recordPaymentInTx(mockTx as any, {
      studentId: 'student-1', academicYearId: 'year-1', amount: Money.fromDb('5000.00'),
      method: BillPaymentMethod.ESEWA, allocationMode: BillPaymentAllocationMode.MANUAL,
      targets: [{ billInvoiceId: 'invoice-1', amount: '5000.00' }],
      reference: 'esewa-ref-123',
    }, 'system');

    expect(result.method).toBe('ESEWA');
    expect(result.status).toBe('CLEARED');
    expect(ledgerService.withStudentLock).not.toHaveBeenCalled(); // no lock acquired by recordPaymentInTx itself
  });
});
```

Import `Money` in the test file if not already imported.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest bill-payment.service.spec.ts -t recordPaymentInTx`
Expected: FAIL — `service.recordPaymentInTx is not a function`.

- [ ] **Step 3: Extract the method**

In `bill-payment.service.ts`, add the exported interface above the class, then split `recordPayment`:

```typescript
export interface RecordPaymentInTxParams {
  studentId: string;
  academicYearId: string;
  amount: Money;
  method: BillPaymentMethod;
  allocationMode: BillPaymentAllocationMode;
  targets?: { billInvoiceId: string; amount: string }[];
  receivedDate?: string;
  reference?: string;
  chequeBank?: string;
  chequeDate?: string;
  notes?: string;
}
```

```typescript
  async recordPayment(dto: CreateBillPaymentDto, receivedById: string): Promise<BillPaymentResponseDto> {
    const studentRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`, dto.studentId,
    );
    if (!studentRows[0]) throw new NotFoundException(`Student ${dto.studentId} not found`);

    const yearRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM academic_years WHERE id = $1::uuid`, dto.academicYearId,
    );
    if (!yearRows[0]) throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);

    if (dto.method !== BillPaymentMethod.CASH && dto.method !== BillPaymentMethod.CHEQUE) {
      throw new BadRequestException(
        `Method ${dto.method} is not yet supported via this endpoint — CASH and CHEQUE only`,
      );
    }
    if (dto.method === BillPaymentMethod.CHEQUE && (!dto.chequeBank || !dto.chequeDate || !dto.reference)) {
      throw new BadRequestException('CHEQUE payments require reference (cheque number), chequeBank, and chequeDate');
    }

    const amount = toMoney(dto.amount);
    if (amount.compare(Money.zero()) <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (dto.allocationMode === BillPaymentAllocationMode.MANUAL && (!dto.targets || dto.targets.length === 0)) {
      throw new BadRequestException('MANUAL allocation requires at least one target invoice');
    }

    return this.ledgerService.withStudentLock(dto.studentId, (tx) => this.recordPaymentInTx(tx, {
      studentId: dto.studentId,
      academicYearId: dto.academicYearId,
      amount,
      method: dto.method,
      allocationMode: dto.allocationMode,
      targets: dto.targets,
      receivedDate: dto.receivedDate,
      reference: dto.reference,
      chequeBank: dto.chequeBank,
      chequeDate: dto.chequeDate,
      notes: dto.notes,
    }, receivedById));
  }

  /**
   * Participates in an ALREADY-OPEN, ALREADY-LOCKED transaction — mirrors
   * LedgerService's postEntry/postEntryInTx and reverse/reverseInTx split
   * (this is the third instance of that exact pattern in this codebase).
   * Deliberately does NOT re-validate the CASH/CHEQUE-only restriction or
   * cheque-field requirements — those are recordPayment()'s own HTTP-facing
   * business rules; a caller composing this directly (EsewaService/
   * KhaltiService, Checkpoint C) passes method ESEWA/KHALTI, which
   * recordPayment() itself would reject. The caller is trusted, exactly
   * like postEntryInTx/reverseInTx trust theirs.
   */
  async recordPaymentInTx(
    tx: TenantTx, params: RecordPaymentInTxParams, receivedById: string,
  ): Promise<BillPaymentResponseDto> {
    const receivedDate = params.receivedDate ?? todayAdInNepal();
    const bs = bsOf(receivedDate);
    const { invoiceNumberingReset } = await this.financeSettingsService.getInvoiceNumberingReset();
    const todayBs = adToBs(new Date(todayAdInNepal()));
    const fiscalYear = fiscalYearBs(todayBs.year, todayBs.month);
    const { slug } = this.tenantContext.getOrThrow();
    const amount = params.amount;

    let allocations: AllocationPlanItem[];

    if (params.allocationMode === BillPaymentAllocationMode.ADVANCE_ONLY) {
      allocations = [];
    } else if (params.allocationMode === BillPaymentAllocationMode.AUTO_FIFO) {
      const candidates = await this.fetchUnpaidInvoicesOldestFirst(tx, params.studentId);
      const plan = planAutoFifoAllocation(amount, candidates);
      allocations = plan.allocations;
    } else {
      const ids = params.targets!.map((t) => t.billInvoiceId);
      const invoiceMap = await this.fetchInvoicesByIds(tx, params.studentId, ids);
      let sum = Money.zero();
      allocations = [];
      for (const target of params.targets!) {
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
    }

    const seqKey = buildReceiptSequenceKey(slug, invoiceNumberingReset, fiscalYear);
    const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
      `INSERT INTO sequences (key, value) VALUES ($1, 1)
       ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
       RETURNING value`,
      seqKey,
    );
    const receiptNumber = buildReceiptNumber(invoiceNumberingReset, todayBs.year, fiscalYear, seqRow.value);
    const status = params.method === BillPaymentMethod.CHEQUE ? 'PENDING' : 'CLEARED';

    const [payment] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO bill_payments
         (receipt_number, student_id, academic_year_id, amount, method, status,
          received_date, received_bs_year, received_bs_month, received_bs_day,
          reference, cheque_bank, cheque_date, allocation_mode, notes, received_by)
       VALUES ($1, $2::uuid, $3::uuid, $4::numeric, $5, $6,
               $7::date, $8, $9, $10,
               $11, $12, $13::date, $14, $15, $16::uuid)
       RETURNING id`,
      receiptNumber, params.studentId, params.academicYearId, amount.toDb(), params.method, status,
      receivedDate, bs.year, bs.month, bs.day,
      params.reference ?? null, params.chequeBank ?? null, params.chequeDate ?? null,
      params.allocationMode, params.notes ?? null, receivedById,
    );

    for (const alloc of allocations) {
      await tx.$executeRawUnsafe(
        `INSERT INTO bill_payment_allocations (bill_payment_id, bill_invoice_id, amount)
         VALUES ($1::uuid, $2::uuid, $3::numeric)`,
        payment.id, alloc.billInvoiceId, alloc.amount.toDb(),
      );
    }

    if (status === 'CLEARED') {
      for (const alloc of allocations) {
        await this.recomputeInvoiceStatus(tx, alloc.billInvoiceId);
      }

      const entryType = allocations.length > 0 ? 'PAYMENT' : 'DEPOSIT';
      const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
        studentId: params.studentId,
        academicYearId: params.academicYearId,
        entryType,
        debit: '0',
        credit: amount.toDb(),
        narration: `${entryType === 'PAYMENT' ? 'Payment' : 'Deposit'} ${receiptNumber}`,
        refDocType: 'bill_payment',
        refDocId: payment.id,
        createdById: receivedById,
      });

      await tx.$executeRawUnsafe(
        `UPDATE bill_payments SET ledger_entry_id = $1::uuid, cleared_at = NOW(), cleared_by = $3::uuid WHERE id = $2::uuid`,
        ledgerEntry.id, payment.id, receivedById,
      );
    }

    const allocRows = await tx.$queryRawUnsafe<BillPaymentAllocationRow[]>(
      `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`,
      payment.id,
    );
    const [paymentRow] = await tx.$queryRawUnsafe<BillPaymentRow[]>(
      `SELECT * FROM bill_payments WHERE id = $1::uuid`,
      payment.id,
    );

    return toBillPaymentResponse(paymentRow, allocRows);
  }
```

This is a mechanical extraction — read the CURRENT file (post-Checkpoint-B) first and diff carefully; the body inside the old `withStudentLock` callback moves verbatim into `recordPaymentInTx`, only replacing every `dto.X` with `params.X` and removing the now-redundant `amount = toMoney(dto.amount)` (params.amount is already a `Money`).

- [ ] **Step 4: Run to verify it passes; run the full `bill-payment.service.spec.ts` + finance suite for regressions**

```
npx jest bill-payment.service.spec.ts
npx jest src/modules/finance
```
Expected: every Checkpoint A/B test passes unchanged (the extraction is behavior-preserving — `recordPayment` still does the exact same validation, still opens the exact same lock, still produces the exact same DB writes), plus the new `recordPaymentInTx` test passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/bill-payment.service.ts apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint C — extract BillPaymentService.recordPaymentInTx (composable for gateway credit)"
```

---

## Task 3: Re-point `EsewaService` (TDD, existing tests must pass unchanged)

**Files:**
- Modify: `apps/api/src/modules/finance/esewa/esewa.service.ts`
- Modify: `apps/api/src/modules/finance/__tests__/esewa.service.spec.ts` (read it first to learn its exact current mock shape before writing new cases — do not guess the shape)

**Interfaces:**
- Consumes: `BillPaymentService.recordPaymentInTx` (Task 2), `LedgerService.withStudentLock`, `BillInvoiceRow`/`toBillInvoiceResponse`-style row shape from `entities/bill-invoice.entity.ts` (read-only reuse, no changes to that file).
- Produces: `EsewaService.initiate`/`verify`/`getStatus`/`buildPayPage`/`handleCallback`/`getReceipt` — same public signatures, same `EsewaVerifyResult` shape, now backed by `bill_invoices`/`bill_payments`.

- [ ] **Step 0: Establish baseline**

Run: `npx jest esewa.service.spec.ts` — record the passing count before touching the file.

- [ ] **Step 1: Write failing tests for the re-pointed behavior**

Read the existing spec file's mock setup first (constructor providers, `PaymentTransactionRow` fixture shape) so the new tests match its established conventions rather than inventing a different style. Add cases for: `initiate()` queries `bill_invoices` (not `invoices`) and computes outstanding via the CLEARED-only allocation formula; `initiate()` inserts `bill_invoice_id` (not `invoice_id`) into `payment_transactions`; `creditOnce()` (via `verify()`, status `COMPLETE`) calls `billPaymentService.recordPaymentInTx` with `allocationMode: MANUAL` targeting exactly the claimed invoice, under `ledgerService.withStudentLock`; the double-callback case still returns `ALREADY_VERIFIED` with zero additional writes (the existing test for this should already cover the claim's own idempotency — confirm it still passes rather than re-writing it); the outstanding-shrank-since-initiate case falls back to a capped `MANUAL` target or `ADVANCE_ONLY` (per Global Constraints) rather than throwing.

- [ ] **Step 2: Run to verify new tests fail, existing tests still pass**

- [ ] **Step 3: Implement**

Constructor: replace `PaymentService` with `BillPaymentService` + `LedgerService` (the latter may already be absent from this file's imports — check).

`initiate()`: replace the `invoices` SELECT with:
```sql
SELECT bi.*,
       bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
FROM bill_invoices bi
LEFT JOIN bill_payment_allocations bpa
  ON bpa.bill_invoice_id = bi.id
  AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
WHERE bi.id = $1::uuid AND bi.deleted_at IS NULL
GROUP BY bi.id
```
(same EXISTS-gated CLEARED-only join as `BillPaymentService.recomputeInvoiceStatus`/`fetchInvoicesByIds` — duplicated here deliberately rather than shared cross-service, matching this codebase's established convention of small per-service SQL over a shared query-runner abstraction, and avoiding any risk of nested-transaction issues from calling a `TenantPrismaService`-backed method from inside `EsewaService`'s own transaction later). `outstanding` replaces `invoice.balance`; the `payment_transactions` INSERT's column list changes `invoice_id` → `bill_invoice_id`.

`creditOnce()`:
```typescript
private async creditOnce(txn: PaymentTransactionRow, check: EsewaStatusCheckResponse): Promise<EsewaVerifyResult> {
  const [invoiceRow] = await this.tenantPrisma.query<{ student_id: string; academic_year_id: string }>(
    `SELECT student_id, academic_year_id FROM bill_invoices WHERE id = $1::uuid`,
    txn.bill_invoice_id,
  );
  // invoiceRow is guaranteed by the FK — bill_invoice_id was validated at initiate() time.

  const payment = await this.ledgerService.withStudentLock(invoiceRow.student_id, async (tx) => {
    const [claimed] = await tx.$queryRawUnsafe<PaymentTransactionRow[]>(
      `UPDATE payment_transactions
       SET status = 'VERIFIED', gateway_ref = $2, failure_reason = NULL,
           verified_at = NOW(), updated_at = NOW()
       WHERE transaction_uuid = $1 AND status IN ('INITIATED', 'EXPIRED')
       RETURNING *`,
      txn.transaction_uuid,
      check.ref_id ?? null,
    );
    if (!claimed) return null; // lost the race — someone else settled it

    // Race guard: the invoice's outstanding may have shrunk since initiate()
    // (e.g. a cash payment landed on it first). Cap the MANUAL target at
    // whatever's left; anything beyond that becomes advance credit (B5-7),
    // never a rejection of a gateway-confirmed payment.
    const [{ outstanding }] = await tx.$queryRawUnsafe<{ outstanding: string }[]>(
      `SELECT bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
       FROM bill_invoices bi
       LEFT JOIN bill_payment_allocations bpa
         ON bpa.bill_invoice_id = bi.id
         AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
       WHERE bi.id = $1::uuid
       GROUP BY bi.id`,
      claimed.bill_invoice_id,
    );
    const claimedAmount = toMoney(claimed.amount);
    const currentOutstanding = toMoney(outstanding);
    const targetAmount = currentOutstanding.compare(Money.zero()) > 0
      ? (claimedAmount.compare(currentOutstanding) <= 0 ? claimedAmount : currentOutstanding)
      : Money.zero();

    const paymentRow = await this.billPaymentService.recordPaymentInTx(tx, {
      studentId: invoiceRow.student_id,
      academicYearId: invoiceRow.academic_year_id,
      amount: claimedAmount,
      method: BillPaymentMethod.ESEWA,
      allocationMode: targetAmount.isZero() ? BillPaymentAllocationMode.ADVANCE_ONLY : BillPaymentAllocationMode.MANUAL,
      targets: targetAmount.isZero() ? undefined : [{ billInvoiceId: claimed.bill_invoice_id!, amount: targetAmount.toDb() }],
      reference: check.ref_id ?? claimed.transaction_uuid,
      notes: `eSewa online payment (transaction ${claimed.transaction_uuid})`,
    }, claimed.initiated_by);

    await tx.$executeRawUnsafe(
      `UPDATE payment_transactions SET bill_payment_id = $1::uuid WHERE id = $2::uuid`,
      paymentRow.id, claimed.id,
    );
    return paymentRow;
  });

  // ...rest unchanged (fresh = loadTransaction, emitPaymentReceived call site
  // needs checking — BillPaymentService has no emitPaymentReceived equivalent
  // yet; confirm whether one is needed here or whether Checkpoint A/B simply
  // never built a payment.received-style event for bill_payments — if none
  // exists, this call is correctly omitted, not silently dropped).
}
```

Update `PaymentTransactionRow` (in `esewa.service.ts`, shared with `khalti.service.ts` via import) to add `bill_invoice_id: string | null` and `bill_payment_id: string | null`.

`getReceipt()`: change the JOIN from `invoices i` to `bill_invoices bi`, `i.invoice_number` → `bi.invoice_number`.

- [ ] **Step 4: Run to verify all pass**

- [ ] **Step 5: Full finance suite + tsc**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/finance/esewa/esewa.service.ts apps/api/src/modules/finance/__tests__/esewa.service.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint C — re-point EsewaService to bill_invoices/bill_payments"
```

---

## Task 4: Re-point `KhaltiService` (symmetric to Task 3, TDD)

**Files:**
- Modify: `apps/api/src/modules/finance/khalti/khalti.service.ts`
- Modify: `apps/api/src/modules/finance/__tests__/khalti.service.spec.ts`

Identical shape to Task 3 — `initiate()`, `creditOnce()` (same outstanding-capping logic, `method: BillPaymentMethod.KHALTI`), `getReceipt()` (keep its existing `AND pt.gateway = 'KHALTI'` filter, join `bill_invoices`). Read the current file fully before editing (already read once during pre-flight — re-confirm nothing shifted). Same steps 0-6 as Task 3, same baseline-first discipline.

- [ ] **Step 0-6:** (mirror Task 3 exactly, substituting Khalti's own current code shape — its `creditOnce` uses `lookup.total_amount` in paisa via `parseGatewayPaisa`, not eSewa's `parseEsewaAmount`; preserve that difference, only the invoice-table/payment-table targeting changes.)

- [ ] **Commit:**

```bash
git add apps/api/src/modules/finance/khalti/khalti.service.ts apps/api/src/modules/finance/__tests__/khalti.service.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint C — re-point KhaltiService to bill_invoices/bill_payments"
```

---

## Task 5: DTO doc-comments + full suite + `BILL-BUGS.md`

**Files:**
- Modify: `apps/api/src/modules/finance/dto/esewa.dto.ts`, `dto/khalti.dto.ts` (doc-comment only, per Srijan's ruling — no field rename)
- Modify: `BILL-BUGS.md`

- [ ] **Step 1:** Update both DTOs' doc comments: `invoiceId` now refers to a `bill_invoices.id`, not the old `invoices.id`. No code change.

- [ ] **Step 2:** Full suite + `tsc --noEmit`, record exact counts.

- [ ] **Step 3:** Log in `BILL-BUGS.md`: the `recordPaymentInTx` extraction (third instance of the pattern), the MANUAL-capping race-condition finding and its `ADVANCE_ONLY` fallback (the real design decision in this checkpoint), the DTO field-name ruling, confirmation that `payment.service.ts` and every other old-rail file is untouched, full test counts.

- [ ] **Step 4:** Commit.

---

## Task 6: Live proof — eSewa sandbox (Srijan's click-through)

**Files:** None — live verification, same tenant precedent (`demo`), same discipline as A/B.

- [ ] **Step 1:** Set up a real `bill_invoice` on `demo` (fresh fee head + structure + assignment + bill_run + post, same pattern as every prior checkpoint's live-proof setup).
- [ ] **Step 2:** I call `POST /finance/payments/esewa/initiate` with that `bill_invoice.id`, hand Srijan the `paymentPageUrl`.
- [ ] **Step 3:** Srijan completes the eSewa sandbox login + payment at that URL.
- [ ] **Step 4:** Raw `SELECT` proof: exactly one `bill_payments` row (method `ESEWA`, status `CLEARED`), exactly one ledger entry (`PAYMENT`, credit = the paid amount), `payment_transactions.bill_payment_id` set, the invoice's status correctly recomputed.
- [ ] **Step 5:** Double-callback idempotency: replay the success callback (I can drive this server-side once Srijan confirms the first landed) — expect `ALREADY_VERIFIED`, zero additional `bill_payments`/ledger rows.
- [ ] **Step 6:** Cleanup — same as every prior checkpoint (scaffolding deleted with read-backs; the payment/invoice/ledger entries themselves stay as permanent proof data).

---

## Task 7: Live proof — Khalti sandbox (deferred until Srijan's `test-admin.khalti.com` signup is done)

**Files:** None.

- [ ] Same shape as Task 6, using `POST /finance/payments/khalti/initiate` and the Khalti test payer credentials (`9800000000` / MPIN `1111` / OTP `987654`). **Only proceeds once `KHALTI_SECRET_KEY` is set and the boot log confirms `Khalti gateway enabled`.** If not ready when Tasks 1-6 complete, Checkpoint C's report states this explicitly as pending — not silently skipped, not blocking the rest of the checkpoint from being reported as otherwise done.

---

## Self-Review Notes

**Spec coverage against BILL-5-SPEC.md §7 Checkpoint C:**
- "move eSewa/Khalti from `invoices` to `bill_invoices`" → Tasks 3-4. ✓
- "old `payments` table and `payment_transactions` contract are preserved" → Task 1's additive-only migration, confirmed non-modified file list. ✓
- "gateway payment produces exactly one `bill_payments` row + one ledger entry, idempotent on the gateway txn id" → Task 2 (`recordPaymentInTx` reuses Checkpoint A's one-entry guarantee), Tasks 3-4 (reuse the existing unchanged conditional-claim idempotency). ✓
- "PAY-1/PAY-2 sandbox proofs happen here" → Tasks 6-7, explicitly Srijan's own action. ✓
- Explicitly out of scope, correctly not touched: `apps/mobile`/`apps/web` (logged as `PAY-UI-REPOINT`), old gateway code retirement (Srijan's ruling: leave fully intact).

**Placeholder scan:** no TBD/TODO. Task 4's steps reference Task 3's shape rather than repeating the full code block verbatim — this is a deliberate exception (not a placeholder), since Khalti's diff is a near-exact mirror of eSewa's and repeating ~150 lines of near-identical code would violate DRY within the plan document itself without adding clarity; the *differences* (paisa handling, `gateway = 'KHALTI'` filter) are called out explicitly.

**Type consistency:** `RecordPaymentInTxParams` (Task 2) used identically by both `EsewaService` (Task 3) and `KhaltiService` (Task 4). `recordPaymentInTx`'s signature matches every call site.
