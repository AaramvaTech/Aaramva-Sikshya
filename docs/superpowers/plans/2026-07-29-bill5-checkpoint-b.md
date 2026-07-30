# BILL-5 Checkpoint B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build BILL-5 Checkpoint B only (`docs/api-contracts/BILL-5-SPEC.md` §7) — the cheque lifecycle (PENDING/CLEARED/BOUNCED-from-PENDING/BOUNCED-after-CLEARED), advance auto-apply on the next invoice post (a cross-phase touch to BILL-4's `BillRunPostRunnerService`), and payment void with clean reversal — proven live, with BILL-4's own one-INVOICE-entry invariant re-proven alongside the new advance-consumption path.

**Architecture:** Extends Checkpoint A's `BillPaymentService`/`bill_payments` with a status-lifecycle dimension (`PENDING → CLEARED / BOUNCED`, `CLEARED → BOUNCED`, `* → VOIDED`) gated entirely by whether a payment's `bill_payment_allocations` rows currently *count* — introduced here as a single rule: **an allocation only counts toward an invoice's settlement status (and toward future FIFO/MANUAL "outstanding" queries) when its parent `bill_payments.status = 'CLEARED'`.** This one rule makes PENDING (never counted), CLEARED (counted), BOUNCED (stops counting), and VOIDED (stops counting) all fall out of the same SQL join condition — no separate code path per status. Advance auto-apply reuses the identical "walk oldest-first, allocate until exhausted" shape already proven in Checkpoint A, applied in the reverse direction (many old payments' unconsumed remainder → one new invoice) — implemented as its own small pure function rather than reusing Checkpoint A's `planAutoFifoAllocation` directly, to avoid renaming that already-reviewed, already-proven type (`UnpaidInvoiceCandidate.billInvoiceId`) into something that would read as a payment id in this new call site.

**Tech Stack:** Same as Checkpoint A — NestJS, raw SQL via `TenantPrismaService`, `Money`, class-validator DTOs, Jest.

## Global Constraints

- Checkpoint B ONLY: no eSewa/Khalti re-pointing (Checkpoint C). R10 stays frozen.
- Method scope widens by exactly one: **CHEQUE** now supported (`PENDING` born-status, no ledger entry at record time). `BANK_TRANSFER`/`ESEWA`/`KHALTI` remain rejected, unchanged from Checkpoint A.
- **The one cross-phase touch:** `BillRunPostRunnerService.postLine` (BILL-4, already live/proven) gains an advance-consumption step. BILL-4's own invariant — posting adds exactly one `INVOICE` ledger entry, nothing else touches the ledger — MUST still hold after this change. Proven by re-running BILL-4's existing unit tests unchanged, adding new tests for the advance-consumption case, and a live proof showing both a plain post (no advance available) and an advance-consuming post each still produce exactly one `INVOICE` ledger entry.
- **Advance consumption posts NO new ledger entry.** Reasoning (verified against the schema, not assumed): `student_ledger_entries` has `CHECK (debit > 0 OR credit > 0)` and `CHECK (NOT (debit > 0 AND credit > 0))` — every entry is a pure, non-zero debit or credit, never both, never neither. The money being "consumed" was already fully credited to the ledger by its original `DEPOSIT`/`PAYMENT` entry when first received; the new invoice's own `INVOICE` entry already fully captures the new charge. A further credit entry for the "same" money would double-count the reduction (make the balance more negative than correct) — there is no valid entry shape that both satisfies the CHECK constraints and doesn't double-count. Consumption is therefore purely a new `bill_payment_allocations` row linking the old (already-CLEARED) payment to the new invoice — no ledger effect, matching how allocations already work as a pure bookkeeping layer in Checkpoint A. This reasoning is logged in `BILL-BUGS.md` for review, not silently assumed.
- **Invoice-status recompute must become 3-branch** (`SETTLED` / `PARTIALLY_PAID` / `POSTED`), not Checkpoint A's 2-branch (`SETTLED` / `PARTIALLY_PAID`). Checkpoint A's 2-branch version never needed a `POSTED`-reversion case because allocations only ever got added there; Checkpoint B introduces BOUNCED-after-CLEARED and VOID, both of which can drop a previously-counted allocation back to zero, and the invoice must correctly revert to `POSTED` in that case. Centralized into one private helper (`recomputeInvoiceStatus`) used by every call site, including Checkpoint A's original one — a strict correctness fix there (the zero-case never occurred in Checkpoint A's own scenarios, so this is provably non-regressing, confirmed by Checkpoint A's existing tests still passing unchanged).
- MANUAL allocation's `PRINCIPAL_AND_ABOVE` gate (Checkpoint A) is untouched. Void is `OWNER_ONLY` (spec §5, explicit). Cheque-status update is `ACCOUNTANT_AND_ABOVE` (spec §5's default — no narrower gate named for this action, unlike MANUAL).
- Same live-proof discipline as Checkpoint A: every write path gets live HTTP + raw Postgres `SELECT` read-back. Scaffolding cleaned up, password shims restored and 401-proven.
- **Never call `ScheduleWakeup` or any self-scheduling primitive** (standing rule, `CLAUDE.md`). Use `Monitor`/backgrounded `Bash` for any wait; nothing else.
- Every deviation/design decision logged in `BILL-BUGS.md`, newest-first.

---

## File Structure

**Create:**
- `apps/api/migrations/tenant/0025_bill_payment_cheque_void_audit.sql` — 8 nullable audit columns on `bill_payments`: `cleared_at, cleared_by, bounced_at, bounced_by, bounce_reason, voided_at, voided_by, void_reason`.
- `apps/api/src/modules/finance/bill-advance-consumption.util.ts` — `planAdvanceConsumption`, pure. Same FIFO-walk shape as `planAutoFifoAllocation` but with its own correctly-named types (`UnconsumedPaymentCandidate { billPaymentId, remaining }`) — a deliberate small duplication, not a shared/renamed type, to keep zero risk to Checkpoint A's already-reviewed `bill-payment-allocation.util.ts`.
- `apps/api/src/modules/finance/__tests__/bill-advance-consumption.util.spec.ts`
- `apps/api/src/modules/finance/dto/cheque-status.dto.ts` — `UpdateChequeStatusDto`, `VoidPaymentDto`.

**Modify:**
- `apps/api/src/modules/finance/ledger.service.ts` — extract `reverseInTx(tx, entryId, createdById)` from `reverse()`, mirroring the existing `postEntry`/`postEntryInTx` split exactly. `reverse()` becomes a thin wrapper (opens the lock, calls `reverseInTx`); behavior unchanged, existing tests must still pass verbatim.
- `apps/api/src/modules/finance/dto/bill-payment.dto.ts` — add `chequeBank?`, `chequeDate?` to `CreateBillPaymentDto`.
- `apps/api/src/modules/finance/entities/bill-payment.entity.ts` — add the 8 audit fields to `BillPaymentRow`/`BillPaymentResponseDto`/mapper.
- `apps/api/src/modules/finance/bill-payment.service.ts` — centralize `recomputeInvoiceStatus` (3-branch, replaces the inline 2-branch CASE in `recordPayment`); extend `recordPayment` to accept `CHEQUE` (status `PENDING`, no ledger post); add `updateChequeStatus` and `voidPayment`.
- `apps/api/src/modules/finance/bill-payment.controller.ts` — wire `PATCH bill/payments/:id/cheque-status` (`ACCOUNTANT_AND_ABOVE`) and `POST bill/payments/:id/void` (`OWNER_ONLY`).
- `apps/api/src/modules/finance/bill-run-post-runner.service.ts` — advance-consumption step after the invoice + `INVOICE` entry are posted, before marking the `bill_run_lines` row `POSTED`.
- `apps/api/src/modules/finance/finance.module.ts` — no new providers/controllers (all Checkpoint B code lives in already-registered `BillPaymentService`/`BillPaymentController`/`BillRunPostRunnerService`), but double-check after Task 8 that nothing new needs registering.
- Test files: `__tests__/ledger.service.spec.ts`, `__tests__/bill-payment.service.spec.ts`, `__tests__/bill-run-post-runner.service.spec.ts` all gain new cases; existing cases must keep passing unchanged.
- `BILL-BUGS.md`.

---

## Task 1: Migration `0025_bill_payment_cheque_void_audit.sql`

**Files:**
- Create: `apps/api/migrations/tenant/0025_bill_payment_cheque_void_audit.sql`

**Interfaces:**
- Produces: `bill_payments` gains `cleared_at TIMESTAMPTZ, cleared_by UUID REFERENCES users(id), bounced_at TIMESTAMPTZ, bounced_by UUID REFERENCES users(id), bounce_reason TEXT, voided_at TIMESTAMPTZ, voided_by UUID REFERENCES users(id), void_reason TEXT`. Every later task's raw SQL depends on these exact column names.

- [ ] **Step 1: Write the migration file**

```sql
-- 0025_bill_payment_cheque_void_audit.sql — BILL-5 Checkpoint B
-- Per BILL-5-SPEC.md §4/§5/B5-11. Purely additive: 8 nullable audit columns
-- on bill_payments (created 0024). B5-11: cheque status transitions and
-- void are the only allowed post-creation changes to a payment — these
-- columns record who did it, when, and (for bounce/void) why, since
-- bill_payments has no dedicated audit columns beyond received_by/notes.

ALTER TABLE bill_payments
  ADD COLUMN IF NOT EXISTS cleared_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleared_by   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS bounced_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_by   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS void_reason  TEXT;
```

- [ ] **Step 2: Confirm LF-pinned, dry-run, canary-apply to demo, verify, roll to all**

Same sequence as Checkpoint A's Task 1:
```
git check-attr text eol -- apps/api/migrations/tenant/0025_bill_payment_cheque_void_audit.sql   # expect eol: lf
cd apps/api
npm run migrate:tenants -- --tenant demo --dry-run     # expect 0025 pending
npm run migrate:tenants -- --tenant demo               # apply
npm run migrate:tenants -- --status                    # confirm demo advanced
npm run migrate:tenants                                 # roll to all
npm run migrate:tenants -- --status                    # confirm all 8 tenants on 0025
```
Verify live via `psql`: `\d tenant_demo.bill_payments` shows all 8 new columns.

- [ ] **Step 3: Commit**

```bash
git add apps/api/migrations/tenant/0025_bill_payment_cheque_void_audit.sql
git commit -m "feat(api): BILL-5 Checkpoint B — cheque/void audit columns migration"
```

---

## Task 2: `LedgerService` — extract `reverseInTx` (TDD, existing tests must pass unchanged)

**Files:**
- Modify: `apps/api/src/modules/finance/ledger.service.ts`
- Modify: `apps/api/src/modules/finance/__tests__/ledger.service.spec.ts`

**Interfaces:**
- Produces: `LedgerService.reverseInTx(tx: TenantTx, entryId: string, createdById: string): Promise<LedgerEntryResponseDto>` — participates in a caller-provided, already-locked transaction (mirrors `postEntryInTx` relative to `postEntry`). `reverse(entryId, createdById)` becomes: look up the original entry (unchanged), `withStudentLock(original.student_id, tx => this.reverseInTx(tx, entryId, createdById))`. `BillPaymentService.voidPayment` (Task 6) calls `reverseInTx` directly, composed into its own lock.

- [ ] **Step 1: Write the failing test — `reverseInTx` behaves identically to `reverse`'s core logic, callable inside an existing transaction**

Add to `apps/api/src/modules/finance/__tests__/ledger.service.spec.ts` (mirror the existing `describe('reverse', ...)` block's mock setup — check the file first for its exact `TenantTx`/`TenantPrismaService` mock shape before writing, since this test calls `reverseInTx` directly with a hand-built `tx` mock rather than going through `withStudentLock`):

```typescript
describe('reverseInTx', () => {
  it('mirrors the original entry (debit/credit swapped), composed into a caller-owned tx, no separate lock', async () => {
    const mockTx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([]) // "already reversed?" check: none
        .mockResolvedValueOnce([{
          id: 'entry-1', student_id: 'student-1', academic_year_id: 'year-1',
          entry_date: new Date('2026-07-29'), entry_bs_year: 2083, entry_bs_month: 4, entry_bs_day: 13,
          entry_type: 'PAYMENT', debit: '0.00', credit: '5000.00',
          ref_doc_type: 'bill_payment', ref_doc_id: 'payment-1', narration: 'Payment RCPT-1',
          reverses_entry_id: null, created_by: 'user-1', created_at: new Date('2026-07-29'),
        }]),
      $executeRawUnsafe: jest.fn(),
    };

    // reverseInTx needs the ORIGINAL row — unlike reverse() (which SELECTs it
    // via tenantPrisma.query before opening the lock), reverseInTx receives an
    // already-open tx and must look the original up THROUGH it. Adjust the
    // mock call order to match the real implementation once written (this is
    // the RED step — expect this call signature to guide the implementation,
    // not dictate it verbatim).
    const result = await service.reverseInTx(mockTx as any, 'entry-1', 'user-2');

    expect(result.debit).toBe(5000); // mirrored: original credit becomes new debit
    expect(result.credit).toBe(0);
    expect(result.reversesEntryId).toBe('entry-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest ledger.service.spec.ts -t reverseInTx`
Expected: FAIL — `service.reverseInTx is not a function`.

- [ ] **Step 3: Refactor `reverse()` into `reverse()` + `reverseInTx()`**

Read the current `reverse()` method in `ledger.service.ts` first (lines ~186-221 as of Checkpoint A) — it currently: (a) looks up the original entry via `this.tenantPrisma.query` (NOT inside a tx), (b) opens `withStudentLock`, (c) inside the lock, checks "already reversed", builds the mirrored entry, inserts it, bumps balance. Split so step (c)'s body becomes `reverseInTx`, taking the original row's `student_id`/`academic_year_id`/etc. via a FRESH lookup inside the given `tx` (not the pre-lock lookup, since a caller composing this into their own transaction may not have already fetched the original row):

```typescript
/**
 * Participates in an ALREADY-OPEN, ALREADY-LOCKED transaction — mirrors
 * postEntryInTx's relationship to postEntry. Used by BillPaymentService's
 * void path (B5-11) to compose the reversal into the SAME transaction as
 * the bill_payments status flip, rather than reverse()'s own separate
 * top-level transaction. Does NOT acquire the advisory lock itself — the
 * caller must already hold it.
 */
async reverseInTx(tx: TenantTx, entryId: string, createdById: string): Promise<LedgerEntryResponseDto> {
  const originalRows = await tx.$queryRawUnsafe<LedgerEntryRow[]>(
    `SELECT * FROM student_ledger_entries WHERE id = $1::uuid`,
    entryId,
  );
  const original = originalRows[0];
  if (!original) throw new NotFoundException(`Ledger entry ${entryId} not found`);

  const alreadyReversed = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM student_ledger_entries WHERE reverses_entry_id = $1::uuid`,
    entryId,
  );
  if (alreadyReversed.length > 0) {
    throw new ConflictException(`Ledger entry ${entryId} has already been reversed`);
  }

  const mirrorDebit = toMoney(original.credit).toDb();
  const mirrorCredit = toMoney(original.debit).toDb();
  const narration = `Reversal of entry ${entryId}${original.narration ? `: ${original.narration}` : ''}`;

  const entry = await this.insertEntry(tx, {
    studentId: original.student_id,
    academicYearId: original.academic_year_id,
    entryType: original.entry_type,
    debit: mirrorDebit,
    credit: mirrorCredit,
    narration,
    reversesEntryId: entryId,
    createdById,
  });
  const delta = toMoney(mirrorDebit).sub(toMoney(mirrorCredit));
  await this.bumpBalance(tx, original.student_id, original.academic_year_id, delta, entry.id);
  return toLedgerEntryResponse(entry);
}

/**
 * OWNER_ONLY. Mirrors the original with debit/credit swapped... [existing
 * docstring content stays] Now a thin wrapper: opens the per-student lock
 * (looking up student_id first since withStudentLock needs it before the
 * lock is held) and composes reverseInTx.
 */
async reverse(entryId: string, createdById: string): Promise<LedgerEntryResponseDto> {
  const originalRows = await this.tenantPrisma.query<LedgerEntryRow>(
    `SELECT * FROM student_ledger_entries WHERE id = $1::uuid`,
    entryId,
  );
  const original = originalRows[0];
  if (!original) throw new NotFoundException(`Ledger entry ${entryId} not found`);

  return this.withStudentLock(original.student_id, (tx) => this.reverseInTx(tx, entryId, createdById));
}
```

Note `NotFoundException`/`ConflictException` are already imported in this file (used elsewhere) — no new import needed.

- [ ] **Step 4: Run test to verify it passes; run the FULL existing ledger suite to confirm zero regression**

Run: `npx jest ledger.service.spec.ts`
Expected: every pre-existing test in this file (including the original `describe('reverse', ...)` block) still passes unchanged, plus the new `reverseInTx` test passes. If any existing `reverse()` test fails, the refactor changed observable behavior — stop and fix before proceeding; do not adjust the pre-existing test's expectations to match new behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/ledger.service.ts apps/api/src/modules/finance/__tests__/ledger.service.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint B — LedgerService.reverseInTx (composable reversal for void)"
```

---

## Task 3: `bill-advance-consumption.util.ts` — the advance-consumption planner (pure, TDD)

**Files:**
- Create: `apps/api/src/modules/finance/bill-advance-consumption.util.ts`
- Test: `apps/api/src/modules/finance/__tests__/bill-advance-consumption.util.spec.ts`

**Interfaces:**
- Consumes: `Money`.
- Produces: `UnconsumedPaymentCandidate { billPaymentId: string; remaining: Money }`, `AdvanceConsumptionItem { billPaymentId: string; amount: Money }`, `AdvanceConsumptionPlan { consumptions: AdvanceConsumptionItem[]; unconsumed: Money }`, `planAdvanceConsumption(invoiceOutstanding: Money, candidatesOldestFirst: UnconsumedPaymentCandidate[]): AdvanceConsumptionPlan`. `BillRunPostRunnerService` (Task 8) calls this with the new invoice's `total_receivable` as `invoiceOutstanding` and the student's unconsumed CLEARED payments (oldest-first) as candidates.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/modules/finance/__tests__/bill-advance-consumption.util.spec.ts
import { Money } from '../../../common/money/money';
import { planAdvanceConsumption, UnconsumedPaymentCandidate } from '../bill-advance-consumption.util';

function candidate(id: string, remaining: string): UnconsumedPaymentCandidate {
  return { billPaymentId: id, remaining: Money.fromDb(remaining) };
}

describe('planAdvanceConsumption', () => {
  it('consumes one old payment fully when it exactly covers the invoice', () => {
    const plan = planAdvanceConsumption(Money.fromDb('2000.00'), [candidate('pay-1', '2000.00')]);
    expect(plan.consumptions).toEqual([{ billPaymentId: 'pay-1', amount: Money.fromDb('2000.00') }]);
    expect(plan.unconsumed.isZero()).toBe(true);
  });

  it('partially consumes one old payment when it exceeds the invoice', () => {
    const plan = planAdvanceConsumption(Money.fromDb('1500.00'), [candidate('pay-1', '5000.00')]);
    expect(plan.consumptions).toEqual([{ billPaymentId: 'pay-1', amount: Money.fromDb('1500.00') }]);
    expect(plan.unconsumed.isZero()).toBe(true);
  });

  it('walks multiple old payments oldest-first until the invoice is covered', () => {
    const candidates = [candidate('pay-1', '1000.00'), candidate('pay-2', '3000.00')];
    const plan = planAdvanceConsumption(Money.fromDb('2500.00'), candidates);
    expect(plan.consumptions).toEqual([
      { billPaymentId: 'pay-1', amount: Money.fromDb('1000.00') },
      { billPaymentId: 'pay-2', amount: Money.fromDb('1500.00') },
    ]);
    expect(plan.unconsumed.isZero()).toBe(true);
  });

  it('leaves the invoice partially uncovered when total advance is insufficient', () => {
    const plan = planAdvanceConsumption(Money.fromDb('10000.00'), [candidate('pay-1', '2000.00')]);
    expect(plan.consumptions).toEqual([{ billPaymentId: 'pay-1', amount: Money.fromDb('2000.00') }]);
    expect(plan.unconsumed.compare(Money.fromDb('8000.00'))).toBe(0);
  });

  it('no candidates means nothing is consumed, invoice fully unconsumed', () => {
    const plan = planAdvanceConsumption(Money.fromDb('2000.00'), []);
    expect(plan.consumptions).toEqual([]);
    expect(plan.unconsumed.compare(Money.fromDb('2000.00'))).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest bill-advance-consumption.util.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/finance/bill-advance-consumption.util.ts
import { Money } from '../../common/money/money';

export interface UnconsumedPaymentCandidate {
  billPaymentId: string;
  remaining: Money;
}

export interface AdvanceConsumptionItem {
  billPaymentId: string;
  amount: Money;
}

export interface AdvanceConsumptionPlan {
  consumptions: AdvanceConsumptionItem[];
  unconsumed: Money;
}

/**
 * B5-4 advance auto-apply: walk the student's unconsumed CLEARED payments
 * (caller must pass them already ordered oldest-first) and apply as much of
 * each as needed to cover the newly-posted invoice's total_receivable.
 * Deliberately NOT a reuse of planAutoFifoAllocation (bill-payment-
 * allocation.util.ts) despite the identical walk shape — this direction is
 * "many old payments -> one new invoice" rather than "one payment -> many
 * invoices", and renaming that already-reviewed, already-proven type's
 * `billInvoiceId` field to serve double duty here would read as a payment id
 * at this call site. Pure — cannot fail; insufficient advance simply leaves
 * `unconsumed` on the invoice side (the invoice stays PARTIALLY_PAID/POSTED).
 */
export function planAdvanceConsumption(
  invoiceOutstanding: Money,
  candidatesOldestFirst: UnconsumedPaymentCandidate[],
): AdvanceConsumptionPlan {
  let remaining = invoiceOutstanding;
  const consumptions: AdvanceConsumptionItem[] = [];

  for (const candidate of candidatesOldestFirst) {
    if (remaining.isZero()) break;
    const applied = remaining.compare(candidate.remaining) <= 0 ? remaining : candidate.remaining;
    consumptions.push({ billPaymentId: candidate.billPaymentId, amount: applied });
    remaining = remaining.sub(applied);
  }

  return { consumptions, unconsumed: remaining };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest bill-advance-consumption.util.spec.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/bill-advance-consumption.util.ts apps/api/src/modules/finance/__tests__/bill-advance-consumption.util.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint B — advance-consumption planner (pure util)"
```

---

## Task 4: DTOs — `cheque-status.dto.ts` + `CreateBillPaymentDto` cheque fields

**Files:**
- Create: `apps/api/src/modules/finance/dto/cheque-status.dto.ts`
- Modify: `apps/api/src/modules/finance/dto/bill-payment.dto.ts`

**Interfaces:**
- Produces: `UpdateChequeStatusDto { status: 'CLEARED' | 'BOUNCED'; reason?: string }`, `VoidPaymentDto { reason?: string }`. `CreateBillPaymentDto` gains `chequeBank?: string`, `chequeDate?: string`. `BillPaymentController` (Task 7) and `BillPaymentService` (Task 5-6) consume these.

- [ ] **Step 1: Write `cheque-status.dto.ts`**

```typescript
// apps/api/src/modules/finance/dto/cheque-status.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';

const CHEQUE_TRANSITION_STATUSES = ['CLEARED', 'BOUNCED'] as const;
export type ChequeTransitionStatus = (typeof CHEQUE_TRANSITION_STATUSES)[number];

export class UpdateChequeStatusDto {
  @IsEnum(CHEQUE_TRANSITION_STATUSES) status: ChequeTransitionStatus;
  @IsOptional() @IsString() reason?: string;
}

export class VoidPaymentDto {
  @IsOptional() @IsString() reason?: string;
}
```

- [ ] **Step 2: Add cheque fields to `CreateBillPaymentDto`**

In `apps/api/src/modules/finance/dto/bill-payment.dto.ts`, add after the existing `reference`/`notes` fields:

```typescript
  /** CHEQUE-only metadata — required when method is CHEQUE, validated in BillPaymentService (same convention as targets/MANUAL). */
  @IsOptional() @IsString() chequeBank?: string;
  @IsOptional() @IsDateString() chequeDate?: string;
```

- [ ] **Step 3: Type-check**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/finance/dto/cheque-status.dto.ts apps/api/src/modules/finance/dto/bill-payment.dto.ts
git commit -m "feat(api): BILL-5 Checkpoint B — cheque-status/void request DTOs, cheque fields on CreateBillPaymentDto"
```

---

## Task 5: `entities/bill-payment.entity.ts` — audit fields

**Files:**
- Modify: `apps/api/src/modules/finance/entities/bill-payment.entity.ts`

**Interfaces:**
- Produces: `BillPaymentRow` gains `cleared_at, cleared_by, bounced_at, bounced_by, bounce_reason, voided_at, voided_by, void_reason` (all `string | Date | null` for the `_at` fields, `string | null` for `_by`/`_reason`). `BillPaymentResponseDto` gains the camelCase equivalents. `toBillPaymentResponse` maps them.

- [ ] **Step 1: Update the row interface**

Add to `BillPaymentRow` (after `notes: string | null;`):

```typescript
  cleared_at: Date | string | null;
  cleared_by: string | null;
  bounced_at: Date | string | null;
  bounced_by: string | null;
  bounce_reason: string | null;
  voided_at: Date | string | null;
  voided_by: string | null;
  void_reason: string | null;
```

- [ ] **Step 2: Update the response DTO**

Add to `BillPaymentResponseDto` (after `notes: string | null;`):

```typescript
  clearedAt: string | null;
  clearedBy: string | null;
  bouncedAt: string | null;
  bouncedBy: string | null;
  bounceReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
```

- [ ] **Step 3: Update the mapper**

In `toBillPaymentResponse`, add (after `notes: row.notes,`):

```typescript
    clearedAt: row.cleared_at ? toIso(row.cleared_at) : null,
    clearedBy: row.cleared_by,
    bouncedAt: row.bounced_at ? toIso(row.bounced_at) : null,
    bouncedBy: row.bounced_by,
    bounceReason: row.bounce_reason,
    voidedAt: row.voided_at ? toIso(row.voided_at) : null,
    voidedBy: row.voided_by,
    voidReason: row.void_reason,
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: clean (this will surface any call site constructing a `BillPaymentRow`/`BillPaymentResponseDto` object literal that's now missing the new required fields — fix those call sites, don't make the new fields optional).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/entities/bill-payment.entity.ts
git commit -m "feat(api): BILL-5 Checkpoint B — cheque/void audit fields on BillPaymentResponseDto"
```

---

## Task 6: `bill-payment.service.ts` — centralize status recompute, CHEQUE support, cheque-status transition, void (TDD)

**Files:**
- Modify: `apps/api/src/modules/finance/bill-payment.service.ts`
- Modify: `apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts`

**Interfaces:**
- Consumes: `LedgerService.reverseInTx` (Task 2), `planAdvanceConsumption` is NOT used here (that's Task 8 only), `UpdateChequeStatusDto`/`VoidPaymentDto` (Task 4).
- Produces: `BillPaymentService.updateChequeStatus(paymentId: string, dto: UpdateChequeStatusDto, staffId: string): Promise<BillPaymentResponseDto>`, `BillPaymentService.voidPayment(paymentId: string, dto: VoidPaymentDto, staffId: string): Promise<BillPaymentResponseDto>`. `recordPayment` now accepts `method: CHEQUE`. Private `recomputeInvoiceStatus(tx, billInvoiceId)` replaces the inline CASE in `recordPayment`'s allocation loop. `BillPaymentController` (Task 7) depends on the two new public method signatures.

- [ ] **Step 1: Write the failing tests — CHEQUE recording, cheque-status transitions, void**

Add these `describe` blocks to `apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts` (keep every existing block from Checkpoint A unchanged — this task must not touch or weaken them):

```typescript
import { LedgerService } from '../ledger.service'; // already imported — extend the mock below
// ... (existing imports/mockTx/mockPaymentRow/baseDto stay as-is; extend the LedgerService mock to include reverseInTx)
```

In the `beforeEach`'s `LedgerService` mock, add `reverseInTx: jest.fn()` alongside the existing `withStudentLock`/`postEntryInTx`:

```typescript
        {
          provide: LedgerService,
          useValue: {
            withStudentLock: jest.fn().mockImplementation((_studentId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            postEntryInTx: jest.fn(),
            reverseInTx: jest.fn(),
          },
        },
```

Then add:

```typescript
  describe('recordPayment — CHEQUE (PENDING, no ledger entry)', () => {
    it('records a PENDING cheque payment: allocations inserted, status PENDING, no ledger entry, no invoice status change', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', outstanding: '8500.00' }]) // AUTO_FIFO candidates
        .mockResolvedValueOnce([{ value: BigInt(5) }]) // sequence upsert
        .mockResolvedValueOnce([{ id: 'payment-cheque-1' }]) // bill_payments insert
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-cheque-1', bill_invoice_id: 'invoice-1', amount: '5000.00', created_at: new Date() }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cheque-1', method: 'CHEQUE', status: 'PENDING', amount: '5000.00', ledger_entry_id: null }]);

      const result = await service.recordPayment(
        baseDto({
          amount: '5000.00', method: BillPaymentMethod.CHEQUE,
          reference: 'CHQ-001', chequeBank: 'Nepal Bank', chequeDate: '2026-07-29',
        }),
        'user-1',
      );

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payments'),
        expect.anything(), // receipt number
        'student-1', 'year-1', '5000.00', 'CHEQUE', 'PENDING',
        expect.anything(), expect.anything(), expect.anything(), expect.anything(),
        'CHQ-001', 'Nepal Bank', '2026-07-29', 'AUTO_FIFO', null, 'user-1',
      );
      expect(result.status).toBe('PENDING');
      expect(result.ledgerEntryId).toBeNull();
    });

    it('rejects a CHEQUE payment missing chequeBank/chequeDate', async () => {
      mockExistenceChecks();
      await expect(
        service.recordPayment(baseDto({ method: BillPaymentMethod.CHEQUE, reference: 'CHQ-002' }), 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateChequeStatus — PENDING -> CLEARED', () => {
    it('posts the deferred ledger entry now, sets cleared_at/cleared_by, recomputes invoice status', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-cheque-1', method: 'CHEQUE', status: 'PENDING',
        academic_year_id: 'year-1', amount: '5000.00', ledger_entry_id: null,
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'PENDING' }]) // re-check under lock
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }]) // this payment's allocations
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cheque-1', method: 'CHEQUE', status: 'CLEARED' }]); // re-select
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-cleared' } as any);

      const result = await service.updateChequeStatus('payment-cheque-1', { status: 'CLEARED' }, 'owner-1');

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        studentId: 'student-1', academicYearId: 'year-1', debit: '0', credit: '5000.00',
      }));
      expect(result.status).toBe('CLEARED');
    });
  });

  describe('updateChequeStatus — PENDING -> BOUNCED', () => {
    it('flips status, records bounce audit, posts no ledger entry (none ever existed)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-cheque-2', method: 'CHEQUE', status: 'PENDING', ledger_entry_id: null,
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'PENDING' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cheque-2', method: 'CHEQUE', status: 'BOUNCED' }]);

      const result = await service.updateChequeStatus('payment-cheque-2', { status: 'BOUNCED', reason: 'insufficient funds' }, 'owner-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(ledgerService.reverseInTx).not.toHaveBeenCalled();
      expect(result.status).toBe('BOUNCED');
    });
  });

  describe('updateChequeStatus — CLEARED -> BOUNCED (rare, after clearing)', () => {
    it('appends a reversing ledger entry via reverseInTx, does not touch the original entry', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-cheque-3', method: 'CHEQUE', status: 'CLEARED', ledger_entry_id: 'ledger-entry-x',
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'CLEARED' }])
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cheque-3', method: 'CHEQUE', status: 'BOUNCED' }]);
      ledgerService.reverseInTx.mockResolvedValueOnce({ id: 'ledger-entry-reversal' } as any);

      const result = await service.updateChequeStatus('payment-cheque-3', { status: 'BOUNCED', reason: 'bank reversal' }, 'owner-1');

      expect(ledgerService.reverseInTx).toHaveBeenCalledWith(mockTx, 'ledger-entry-x', 'owner-1');
      expect(result.status).toBe('BOUNCED');
    });
  });

  describe('updateChequeStatus — invalid transitions rejected', () => {
    it('rejects a non-CHEQUE payment', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, method: 'CASH' }]);
      await expect(service.updateChequeStatus('payment-1', { status: 'CLEARED' }, 'owner-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects transitioning an already-BOUNCED cheque', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, method: 'CHEQUE', status: 'BOUNCED' }]);
      await expect(service.updateChequeStatus('payment-1', { status: 'CLEARED' }, 'owner-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('voidPayment', () => {
    it('reverses a CLEARED payment via reverseInTx and marks it VOIDED', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-1', status: 'CLEARED', ledger_entry_id: 'ledger-entry-1',
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'CLEARED' }])
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-1', status: 'VOIDED' }]);
      ledgerService.reverseInTx.mockResolvedValueOnce({ id: 'ledger-entry-void-reversal' } as any);

      const result = await service.voidPayment('payment-1', { reason: 'data entry error' }, 'owner-1');

      expect(ledgerService.reverseInTx).toHaveBeenCalledWith(mockTx, 'ledger-entry-1', 'owner-1');
      expect(result.status).toBe('VOIDED');
    });

    it('voids a PENDING payment with no ledger reversal (nothing was ever posted)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-2', status: 'PENDING', ledger_entry_id: null,
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'PENDING' }])
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-2', status: 'VOIDED' }]);

      const result = await service.voidPayment('payment-2', {}, 'owner-1');

      expect(ledgerService.reverseInTx).not.toHaveBeenCalled();
      expect(result.status).toBe('VOIDED');
    });

    it('rejects voiding an already-VOIDED payment', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, status: 'VOIDED' }]);
      await expect(service.voidPayment('payment-1', {}, 'owner-1')).rejects.toThrow(ConflictException);
    });
  });
```

Add `ConflictException` to the test file's `@nestjs/common` import.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest bill-payment.service.spec.ts`
Expected: existing Checkpoint A tests still PASS; all new tests FAIL (`service.updateChequeStatus is not a function`, `service.voidPayment is not a function`, CHEQUE rejected with the Checkpoint-A-era "CASH only" message).

- [ ] **Step 3: Implement — centralize `recomputeInvoiceStatus`, extend `recordPayment` for CHEQUE, add `updateChequeStatus` + `voidPayment`**

In `bill-payment.service.ts`:

1. Add imports: `ConflictException` from `@nestjs/common`; `UpdateChequeStatusDto`, `VoidPaymentDto` from `./dto/cheque-status.dto`.

2. Replace the method-rejection check:
```typescript
    if (dto.method !== BillPaymentMethod.CASH) {
      throw new BadRequestException(
        `Method ${dto.method} is not yet supported — BILL-5 Checkpoint A records CASH payments only`,
      );
    }
```
with:
```typescript
    if (dto.method !== BillPaymentMethod.CASH && dto.method !== BillPaymentMethod.CHEQUE) {
      throw new BadRequestException(
        `Method ${dto.method} is not yet supported — BILL-5 Checkpoint B records CASH and CHEQUE payments only`,
      );
    }
    if (dto.method === BillPaymentMethod.CHEQUE && (!dto.chequeBank || !dto.chequeDate || !dto.reference)) {
      throw new BadRequestException('CHEQUE payments require reference (cheque number), chequeBank, and chequeDate');
    }
```

3. Replace the payment-status literal and INSERT column list. Currently:
```typescript
         VALUES ($1, $2::uuid, $3::uuid, $4::numeric, $5, 'CLEARED',
                 $6::date, $7, $8, $9,
                 $10, $11, $12, $13::uuid)
         RETURNING id`,
        receiptNumber, dto.studentId, dto.academicYearId, amount.toDb(), dto.method,
        receivedDate, bs.year, bs.month, bs.day,
        dto.reference ?? null, dto.allocationMode, dto.notes ?? null, receivedById,
```
becomes (status is now a variable, cheque_bank/cheque_date added):
```typescript
      const status = dto.method === BillPaymentMethod.CHEQUE ? 'PENDING' : 'CLEARED';
      // ... (later, in the INSERT)
         VALUES ($1, $2::uuid, $3::uuid, $4::numeric, $5, $6,
                 $7::date, $8, $9, $10,
                 $11, $12, $13::date, $14, $15, $16::uuid)
         RETURNING id`,
        receiptNumber, dto.studentId, dto.academicYearId, amount.toDb(), dto.method, status,
        receivedDate, bs.year, bs.month, bs.day,
        dto.reference ?? null, dto.chequeBank ?? null, dto.chequeDate ?? null,
        dto.allocationMode, dto.notes ?? null, receivedById,
```
(Update the column list in the `INSERT INTO bill_payments (...)` clause to add `cheque_bank, cheque_date` in matching position — check the exact current column order in the file before editing so the `$n` placeholders line up correctly; this is a mechanical but easy-to-miscount change, verify by re-reading the edited SQL line by line against the column list.)

4. Skip the ledger-entry/allocation-counting steps when `status === 'PENDING'`. The current code always does: insert allocations → per-allocation invoice-status update → post ledger entry → set `ledger_entry_id`. New shape:
```typescript
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
          `UPDATE bill_payments SET ledger_entry_id = $1::uuid, cleared_at = NOW(), cleared_by = $3::uuid WHERE id = $2::uuid`,
          ledgerEntry.id, payment.id, receivedById,
        );
      }
```
(Allocations are ALWAYS inserted regardless of status — per B5-5, the payment's intended allocation is decided at record time even for a PENDING cheque; they simply don't count toward invoice status or future FIFO/MANUAL "outstanding" queries until the parent payment's status is `CLEARED` — see `recomputeInvoiceStatus`'s and `fetchUnpaidInvoicesOldestFirst`'s join condition below.)

5. Add the centralized recompute helper (private method):
```typescript
  /**
   * B5-2/B5-5: an invoice's settlement status is derived from the SUM of
   * its allocations, but ONLY allocations whose parent bill_payments row is
   * currently CLEARED count (PENDING never counted; BOUNCED/VOIDED stop
   * counting the moment they transition away from CLEARED). 3-branch, not
   * Checkpoint A's original 2-branch — Checkpoint A never needed a POSTED-
   * reversion case since allocations there only ever got added; Checkpoint B
   * introduces BOUNCED-after-CLEARED and VOID, both of which can drop a
   * previously-counted allocation back to zero.
   */
  private async recomputeInvoiceStatus(tx: TenantTx, billInvoiceId: string): Promise<void> {
    await tx.$executeRawUnsafe(
      `UPDATE bill_invoices SET
         status = CASE
           WHEN total_receivable <= (
             SELECT COALESCE(SUM(bpa.amount), 0)
             FROM bill_payment_allocations bpa
             JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
             WHERE bpa.bill_invoice_id = $1::uuid
           ) THEN 'SETTLED'
           WHEN (
             SELECT COALESCE(SUM(bpa.amount), 0)
             FROM bill_payment_allocations bpa
             JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
             WHERE bpa.bill_invoice_id = $1::uuid
           ) > 0 THEN 'PARTIALLY_PAID'
           ELSE 'POSTED'
         END,
         updated_at = NOW()
       WHERE id = $1::uuid`,
      billInvoiceId,
    );
  }
```

6. Update `fetchUnpaidInvoicesOldestFirst` and `fetchInvoicesByIds` to only count CLEARED allocations — change:
```sql
LEFT JOIN bill_payment_allocations bpa ON bpa.bill_invoice_id = bi.id
```
to:
```sql
LEFT JOIN bill_payment_allocations bpa
  ON bpa.bill_invoice_id = bi.id
  AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
```
in BOTH methods (this is why a PENDING cheque's own allocation doesn't make its target invoice look "spoken for" to a later AUTO_FIFO payment — it correctly still shows as available outstanding until the cheque clears).

7. Add `updateChequeStatus`:
```typescript
  async updateChequeStatus(
    paymentId: string, dto: UpdateChequeStatusDto, staffId: string,
  ): Promise<BillPaymentResponseDto> {
    const rows = await this.tenantPrisma.query<BillPaymentRow>(
      `SELECT * FROM bill_payments WHERE id = $1::uuid AND deleted_at IS NULL`, paymentId,
    );
    if (!rows[0]) throw new NotFoundException(`Payment ${paymentId} not found`);
    const payment = rows[0];

    if (payment.method !== 'CHEQUE') {
      throw new BadRequestException('Only CHEQUE payments have a cheque-status transition');
    }
    if (payment.status !== 'PENDING' && payment.status !== 'CLEARED') {
      throw new BadRequestException(`Cannot transition a payment from status ${payment.status}`);
    }
    if (payment.status === 'PENDING' && dto.status !== 'CLEARED' && dto.status !== 'BOUNCED') {
      throw new BadRequestException(`Invalid transition PENDING -> ${dto.status}`);
    }
    if (payment.status === 'CLEARED' && dto.status !== 'BOUNCED') {
      throw new BadRequestException(`Invalid transition CLEARED -> ${dto.status}`);
    }

    return this.ledgerService.withStudentLock(payment.student_id, async (tx) => {
      const [current] = await tx.$queryRawUnsafe<{ status: string }[]>(
        `SELECT status FROM bill_payments WHERE id = $1::uuid`, paymentId,
      );
      if (current.status !== payment.status) {
        throw new ConflictException(`Payment status changed concurrently (now ${current.status})`);
      }

      if (payment.status === 'PENDING' && dto.status === 'CLEARED') {
        const allocRows = await tx.$queryRawUnsafe<{ bill_invoice_id: string }[]>(
          `SELECT bill_invoice_id FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid`, paymentId,
        );
        const entryType = allocRows.length > 0 ? 'PAYMENT' : 'DEPOSIT';
        const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
          studentId: payment.student_id,
          academicYearId: payment.academic_year_id,
          entryType,
          debit: '0',
          credit: toMoney(payment.amount).toDb(),
          narration: `${entryType === 'PAYMENT' ? 'Payment' : 'Deposit'} ${payment.receipt_number} (cheque cleared)`,
          refDocType: 'bill_payment',
          refDocId: paymentId,
          createdById: staffId,
        });
        await tx.$executeRawUnsafe(
          `UPDATE bill_payments SET status = 'CLEARED', ledger_entry_id = $2::uuid,
             cleared_at = NOW(), cleared_by = $3::uuid, updated_at = NOW()
           WHERE id = $1::uuid`,
          paymentId, ledgerEntry.id, staffId,
        );
        for (const a of allocRows) {
          await this.recomputeInvoiceStatus(tx, a.bill_invoice_id);
        }
      } else if (payment.status === 'PENDING' && dto.status === 'BOUNCED') {
        await tx.$executeRawUnsafe(
          `UPDATE bill_payments SET status = 'BOUNCED', bounced_at = NOW(), bounced_by = $2::uuid,
             bounce_reason = $3, updated_at = NOW()
           WHERE id = $1::uuid`,
          paymentId, staffId, dto.reason ?? null,
        );
      } else {
        // CLEARED -> BOUNCED: rare, bank reversal after clearing.
        if (payment.ledger_entry_id) {
          await this.ledgerService.reverseInTx(tx, payment.ledger_entry_id, staffId);
        }
        await tx.$executeRawUnsafe(
          `UPDATE bill_payments SET status = 'BOUNCED', bounced_at = NOW(), bounced_by = $2::uuid,
             bounce_reason = $3, updated_at = NOW()
           WHERE id = $1::uuid`,
          paymentId, staffId, dto.reason ?? null,
        );
        const allocRows = await tx.$queryRawUnsafe<{ bill_invoice_id: string }[]>(
          `SELECT bill_invoice_id FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid`, paymentId,
        );
        for (const a of allocRows) {
          await this.recomputeInvoiceStatus(tx, a.bill_invoice_id);
        }
      }

      const [updatedRow] = await tx.$queryRawUnsafe<BillPaymentRow[]>(
        `SELECT * FROM bill_payments WHERE id = $1::uuid`, paymentId,
      );
      const allocations = await tx.$queryRawUnsafe<BillPaymentAllocationRow[]>(
        `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`, paymentId,
      );
      return toBillPaymentResponse(updatedRow, allocations);
    });
  }
```

8. Add `voidPayment`:
```typescript
  async voidPayment(paymentId: string, dto: VoidPaymentDto, staffId: string): Promise<BillPaymentResponseDto> {
    const rows = await this.tenantPrisma.query<BillPaymentRow>(
      `SELECT * FROM bill_payments WHERE id = $1::uuid AND deleted_at IS NULL`, paymentId,
    );
    if (!rows[0]) throw new NotFoundException(`Payment ${paymentId} not found`);
    const payment = rows[0];

    if (payment.status === 'VOIDED') throw new ConflictException('Payment already voided');
    if (payment.status === 'BOUNCED') throw new BadRequestException('Cannot void an already-bounced payment');

    return this.ledgerService.withStudentLock(payment.student_id, async (tx) => {
      const [current] = await tx.$queryRawUnsafe<{ status: string }[]>(
        `SELECT status FROM bill_payments WHERE id = $1::uuid`, paymentId,
      );
      if (current.status === 'VOIDED' || current.status === 'BOUNCED') {
        throw new ConflictException(`Payment status changed concurrently (now ${current.status})`);
      }

      if (current.status === 'CLEARED' && payment.ledger_entry_id) {
        await this.ledgerService.reverseInTx(tx, payment.ledger_entry_id, staffId);
      }

      await tx.$executeRawUnsafe(
        `UPDATE bill_payments SET status = 'VOIDED', voided_at = NOW(), voided_by = $2::uuid,
           void_reason = $3, updated_at = NOW()
         WHERE id = $1::uuid`,
        paymentId, staffId, dto.reason ?? null,
      );

      const allocRows = await tx.$queryRawUnsafe<{ bill_invoice_id: string }[]>(
        `SELECT bill_invoice_id FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid`, paymentId,
      );
      for (const a of allocRows) {
        await this.recomputeInvoiceStatus(tx, a.bill_invoice_id);
      }

      const [updatedRow] = await tx.$queryRawUnsafe<BillPaymentRow[]>(
        `SELECT * FROM bill_payments WHERE id = $1::uuid`, paymentId,
      );
      const allocations = await tx.$queryRawUnsafe<BillPaymentAllocationRow[]>(
        `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`, paymentId,
      );
      return toBillPaymentResponse(updatedRow, allocations);
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest bill-payment.service.spec.ts`
Expected: PASS, all Checkpoint A cases + all new Checkpoint B cases. If a mock call-order assertion fails, check the exact sequence of `$queryRawUnsafe`/`$executeRawUnsafe` calls in the implementation against the mock chain — adjust the mock, not the implementation, unless the implementation itself is wrong.

- [ ] **Step 5: Run the full finance suite for regressions**

Run: `npx jest apps/api/src/modules/finance`
Expected: every suite passes, including `ledger.service.spec.ts` (Task 2) and `bill-payment-allocation.util.spec.ts`/`bill-payment.util.spec.ts` (Checkpoint A, untouched).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/finance/bill-payment.service.ts apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint B — cheque lifecycle (PENDING/CLEARED/BOUNCED) + void, centralized 3-branch invoice-status recompute"
```

---

## Task 7: `bill-payment.controller.ts` — wire cheque-status + void endpoints

**Files:**
- Modify: `apps/api/src/modules/finance/bill-payment.controller.ts`

**Interfaces:**
- Consumes: `UpdateChequeStatusDto`, `VoidPaymentDto` (Task 4), `BillPaymentService.updateChequeStatus`/`.voidPayment` (Task 6).
- Produces: `PATCH /finance/bill/payments/:id/cheque-status`, `POST /finance/bill/payments/:id/void`.

- [ ] **Step 1: Add the two endpoints**

```typescript
import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
// ... existing imports ...
import { UpdateChequeStatusDto, VoidPaymentDto } from './dto/cheque-status.dto';

const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];

// ... inside the class, after findOne ...

  @Patch('bill/payments/:id/cheque-status')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateChequeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChequeStatusDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.billPaymentService.updateChequeStatus(id, dto, userId);
  }

  @Post('bill/payments/:id/void')
  @Roles(...OWNER_ONLY)
  voidPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPaymentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.billPaymentService.voidPayment(id, dto, userId);
  }
```

(Note `Patch` needs adding to the `@nestjs/common` import list — it wasn't there before.)

- [ ] **Step 2: Type-check and boot-verify**

Run: `npx tsc -p tsconfig.build.json --noEmit` — expect clean.
Start the dev server (checking for orphans first per the now-fixed `taskkill` discipline — kill from the TOP-level `npm` PID if anything's already running), confirm the log shows:
```
Mapped {/api/v1/finance/bill/payments/:id/cheque-status, PATCH} route
Mapped {/api/v1/finance/bill/payments/:id/void, POST} route
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/finance/bill-payment.controller.ts
git commit -m "feat(api): BILL-5 Checkpoint B — cheque-status (ACCOUNTANT_AND_ABOVE) + void (OWNER_ONLY) endpoints"
```

---

## Task 8: `bill-run-post-runner.service.ts` — advance auto-apply (the cross-phase touch, TDD)

**Files:**
- Modify: `apps/api/src/modules/finance/bill-run-post-runner.service.ts`
- Modify: `apps/api/src/modules/finance/__tests__/bill-run-post-runner.service.spec.ts`

**Interfaces:**
- Consumes: `planAdvanceConsumption` (Task 3).
- Produces: `postLine` now also consumes available advance credit against the newly-posted invoice, recording it as new `bill_payment_allocations` rows (zero new ledger entries — see Global Constraints). No change to `postLine`'s external signature or `drainCurrentTenant`/`postRun`'s contracts.

- [ ] **Step 1: Write the failing test — BILL-4's invariant re-proven unchanged, PLUS a new advance-consumption case**

First, run the EXISTING suite as a baseline (RED-proof that nothing is broken yet, since this task hasn't touched the file):
```
npx jest bill-run-post-runner.service.spec.ts
```
Expected: all existing tests pass (baseline, before this task's edit).

Then add a new test (mirroring the existing `mockRun`/`mockResolved` fixtures already in the file — read them first, this new test reuses them):

```typescript
  it('posts a DRAFT line for a student holding advance credit: exactly one INVOICE entry (BILL-4 invariant unchanged), advance consumed via a new allocation row, zero new ledger entries for the consumption itself', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]);

    billLineResolverService.resolve.mockResolvedValueOnce(mockResolved as any);

    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ outcome: 'DRAFT', gross: '3000.00', concession: '0.00', tax: '0.00', net: '3000.00' }]) // re-check line
      .mockResolvedValueOnce([{ sum: '-2000.00' }]) // previous balance: student has 2000 advance credit
      .mockResolvedValueOnce([{ value: BigInt(2) }]) // sequence upsert
      .mockResolvedValueOnce([{ id: 'invoice-2' }]) // bill_invoices insert
      .mockResolvedValueOnce([{ id: 'pay-advance-1', remaining: '2000.00' }]); // unconsumed CLEARED payments, oldest-first

    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-2' } as any);

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 1, linesFailed: 0 });
    // BILL-4's own invariant: exactly one postEntryInTx call (the INVOICE entry) — advance consumption posts NONE.
    expect(ledgerService.postEntryInTx).toHaveBeenCalledTimes(1);
    expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({ entryType: 'INVOICE' }));
    // the new allocation row linking the old advance payment to the new invoice
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bill_payment_allocations'),
      'pay-advance-1', 'invoice-2', '2000.00',
    );
  });
```

- [ ] **Step 2: Run to verify the new test fails, existing tests still pass**

Run: `npx jest bill-run-post-runner.service.spec.ts`
Expected: pre-existing tests PASS unchanged; the new test FAILS (no advance-consumption query/insert exists yet — the mock's 5th `$queryRawUnsafe` call is never made, or the test's own call-count assumption is off; either way, it should fail for the right reason — no advance logic exists — not an unrelated error).

- [ ] **Step 3: Implement the advance-consumption step**

Add the import: `import { planAdvanceConsumption } from './bill-advance-consumption.util';`

In `postLine`, after the existing block that does:
```typescript
      await tx.$executeRawUnsafe(
        `UPDATE bill_invoices SET ledger_entry_id = $1::uuid WHERE id = $2::uuid`,
        ledgerEntry.id, invoice.id,
      );
```
and BEFORE the `UPDATE bill_run_lines SET outcome = 'POSTED', ...` line, insert:

```typescript
      // B5-4: advance auto-apply. Consumes existing unconsumed CLEARED
      // payments (oldest-first) against this invoice's total_receivable.
      // Deliberately posts ZERO new ledger entries — the money was already
      // credited by its original DEPOSIT/PAYMENT entry; this is a pure
      // bill_payment_allocations insert. BILL-4's own invariant (exactly one
      // INVOICE entry per post) is untouched by construction: nothing above
      // this comment changed, and this step never calls postEntryInTx.
      const advanceCandidates = await tx.$queryRawUnsafe<{ id: string; remaining: string }[]>(
        `SELECT bp.id, bp.amount - COALESCE(SUM(bpa.amount), 0) AS remaining
         FROM bill_payments bp
         LEFT JOIN bill_payment_allocations bpa ON bpa.bill_payment_id = bp.id
         WHERE bp.student_id = $1::uuid AND bp.status = 'CLEARED' AND bp.deleted_at IS NULL
         GROUP BY bp.id, bp.amount, bp.created_at
         HAVING bp.amount - COALESCE(SUM(bpa.amount), 0) > 0
         ORDER BY bp.created_at ASC`,
        studentId,
      );

      if (advanceCandidates.length > 0) {
        const plan = planAdvanceConsumption(
          totalReceivable,
          advanceCandidates.map((r) => ({ billPaymentId: r.id, remaining: toMoney(r.remaining) })),
        );
        for (const consumption of plan.consumptions) {
          await tx.$executeRawUnsafe(
            `INSERT INTO bill_payment_allocations (bill_payment_id, bill_invoice_id, amount)
             VALUES ($1::uuid, $2::uuid, $3::numeric)`,
            consumption.billPaymentId, invoice.id, consumption.amount.toDb(),
          );
        }
        if (plan.consumptions.length > 0) {
          await tx.$executeRawUnsafe(
            `UPDATE bill_invoices SET
               status = CASE
                 WHEN total_receivable <= (
                   SELECT COALESCE(SUM(bpa.amount), 0) FROM bill_payment_allocations bpa
                   JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
                   WHERE bpa.bill_invoice_id = $1::uuid
                 ) THEN 'SETTLED'
                 WHEN (
                   SELECT COALESCE(SUM(bpa.amount), 0) FROM bill_payment_allocations bpa
                   JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
                   WHERE bpa.bill_invoice_id = $1::uuid
                 ) > 0 THEN 'PARTIALLY_PAID'
                 ELSE 'POSTED'
               END,
               updated_at = NOW()
             WHERE id = $1::uuid`,
            invoice.id,
          );
        }
      }
```

(`totalReceivable` is already a local `Money` in scope from the existing code above this insertion point — confirm its exact variable name by reading the surrounding code before editing; do not introduce a second, differently-scoped variable of the same concept.)

- [ ] **Step 4: Run to verify the new test passes, existing tests unchanged**

Run: `npx jest bill-run-post-runner.service.spec.ts`
Expected: PASS — every pre-existing test (including the original 8,500/5,000/3,000-style invariant test) passes byte-for-byte unchanged, plus the new advance-consumption test passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/bill-run-post-runner.service.ts apps/api/src/modules/finance/__tests__/bill-run-post-runner.service.spec.ts
git commit -m "feat(api): BILL-5 Checkpoint B — advance auto-apply on invoice post (BILL-4 invariant re-proven unchanged)"
```

---

## Task 9: Full suite run + BILL-BUGS.md deviation log

**Files:**
- Modify: `BILL-BUGS.md`

- [ ] **Step 1: Full suite + type-check**

Run: `cd apps/api && npm test` — record exact counts (expect around 933 + ~20-25 new cases across the 4 modified/created spec files).
Run: `npx tsc -p tsconfig.build.json --noEmit` — expect clean.

- [ ] **Step 2: Log Checkpoint B in `BILL-BUGS.md`**

Prepend a newest-first entry covering: the advance-consumption-posts-no-ledger-entry reasoning (Global Constraints section above, verbatim reasoning), the 3-branch invoice-status-recompute fix (and why it's non-regressing for Checkpoint A), the `reverseInTx` extraction, the cheque field validation choice (reference+chequeBank+chequeDate all required when method=CHEQUE — an implementation-filled-in detail, not spec-mandated), and the full test count.

- [ ] **Step 3: Commit**

```bash
git add BILL-BUGS.md
git commit -m "docs(api): BILL-5 Checkpoint B — deviations log (advance-consumption design, 3-branch status recompute, reverseInTx)"
```

---

## Task 10: Live proof — cheque lifecycle (all four transitions)

**Files:** None — live verification against `demo` (per Srijan's Checkpoint A ruling — same tenant, same precedent).

- [ ] **Step 1–4: PENDING (no ledger effect), CLEARED (ledger posts), BOUNCED-from-PENDING (clean flip), BOUNCED-after-CLEARED (reversal)**

For each transition, record via real HTTP, then raw-`SELECT` verify:
1. Record a CHEQUE payment (`method: CHEQUE`, `reference`, `chequeBank`, `chequeDate`) against a fresh unpaid invoice. Expect `status: PENDING`, `ledgerEntryId: null`. Raw SQL: zero `student_ledger_entries` rows for this payment; `student_account_balances`/live-summed balance unchanged from before recording; the target invoice's `status` unchanged (still `POSTED`/`PARTIALLY_PAID`, NOT settled).
2. `PATCH .../cheque-status {status: CLEARED}` on that payment. Expect `status: CLEARED`, `ledgerEntryId` now set. Raw SQL: exactly one `PAYMENT` (or `DEPOSIT`) entry now exists for it; balance dropped by exactly the payment amount; invoice status recomputed correctly.
3. A SECOND fresh cheque, recorded PENDING, then `PATCH .../cheque-status {status: BOUNCED}` directly from PENDING. Expect `status: BOUNCED`. Raw SQL: zero ledger entries ever existed for this payment; balance unaffected throughout.
4. A THIRD fresh cheque, cleared (per step 2's pattern), THEN bounced (`PATCH .../cheque-status {status: BOUNCED}` from CLEARED). Raw SQL: the ORIGINAL `PAYMENT`/`DEPOSIT` entry still exists untouched (append-only); a NEW reversing entry exists (`reverses_entry_id` = the original's id, debit/credit swapped); balance returned to exactly its pre-clearance value; the invoice's status reverted correctly (POSTED/PARTIALLY_PAID, not still SETTLED) — this is the case that specifically exercises the 3-branch `recomputeInvoiceStatus` fix.

---

## Task 11: Live proof — advance auto-apply + BILL-4 invariant re-proof

**Files:** None — live verification.

- [ ] **Step 1: Create advance credit for a fresh student**

`POST /finance/bill/payments` with `allocationMode: ADVANCE_ONLY` for a student with no unpaid invoices. Confirm `sign: ADVANCE` via `GET /finance/students/:id/balance`.

- [ ] **Step 2: Post a NEW invoice for that same student**

Via the existing `bill_run` → post flow (a fresh, never-billed BS period). Expect the new invoice to come back at least partially `PARTIALLY_PAID` or `SETTLED` (depending on advance vs. invoice size), NOT plain `POSTED`.

- [ ] **Step 3: Raw SQL — the two invariants together**

```sql
-- BILL-4's own invariant, re-proven: exactly ONE INVOICE entry for this new invoice's post
SELECT entry_type, debit, credit FROM student_ledger_entries WHERE ref_doc_type='bill_invoice' AND ref_doc_id='<new invoice id>';
-- expect: exactly 1 row, entry_type='INVOICE', debit=<net amount>, credit=0

-- the advance-consumption entry: a NEW allocation row, the OLD advance payment -> the NEW invoice
SELECT bill_payment_id, bill_invoice_id, amount FROM bill_payment_allocations WHERE bill_invoice_id='<new invoice id>';
-- expect: 1 row, bill_payment_id = the advance-only payment from Step 1

-- zero NEW ledger entries beyond the one INVOICE entry — confirms "no double-counting"
SELECT count(*) FROM student_ledger_entries WHERE created_at > '<timestamp just before Step 2>';
-- expect: exactly 1 (the INVOICE entry only)
```

- [ ] **Step 4: Also re-prove a PLAIN post (no advance available) still produces exactly one INVOICE entry**

Post a second, unrelated invoice for a DIFFERENT student with zero advance credit. Confirm exactly one `INVOICE` ledger entry, zero `bill_payment_allocations` rows created (nothing to consume) — the base case is provably untouched by this checkpoint's change.

---

## Task 12: Live proof — void, cleanup

**Files:** None — live verification.

- [ ] **Step 1: Void a CLEARED CASH payment**

`POST .../void {reason: "..."}` on a CLEARED payment from an earlier live test. Raw SQL: a new reversing ledger entry appears (mirrors the original); balance returns to its pre-payment value; the invoice's status reverts appropriately; `receipt_number` unchanged (retained, never reused).

- [ ] **Step 2: Void a PENDING cheque**

Record a fresh PENDING cheque, then void it directly from PENDING. Raw SQL: zero ledger entries ever existed (nothing to reverse); status is `VOIDED`.

- [ ] **Step 3: Attempt to void an already-VOIDED payment**

Expect `409 Conflict`.

- [ ] **Step 4: OWNER_ONLY gate check**

Attempt void as a plain `ACCOUNTANT`. Expect `403`.

- [ ] **Step 5: Cleanup**

Delete/clean any scaffolding (fresh fee heads/structures/assignments used purely to set up this checkpoint's test invoices), matching Checkpoint A's practice. The payments/cheques/voids/ledger entries themselves are permanent proof data, same precedent as every prior checkpoint. Restore any password shim, 401-proven.

---

## Self-Review Notes

**Spec coverage against BILL-5-SPEC.md §7 Checkpoint B:**
- "Cheque PENDING/CLEARED/BOUNCED lifecycle" → Tasks 6, 7, 10. ✓
- "advance auto-applied on a fresh invoice post (proving BILL-4's invariant still holds)" → Tasks 3, 8, 11 — invariant explicitly re-tested (Task 8 Step 1 baseline + new test) and re-proven live (Task 11 Step 4). ✓
- "payment void with clean reversal" → Tasks 2, 6, 7, 12. ✓
- B5-11 (posted payment immutable; cheque transitions are the one allowed change) → enforced by `updateChequeStatus`'s transition-validity checks (Task 6). ✓
- Out of scope, correctly not touched: eSewa/Khalti re-pointing (Checkpoint C only).

**Placeholder scan:** no TBD/TODO; every task has literal, complete code; the one spot flagged for the implementer to "verify by re-reading" (Task 6 Step 3.3's `$n` placeholder count, Task 8 Step 3's variable name) is a genuine mechanical-precision warning, not a placeholder for missing logic.

**Type consistency check:** `UnconsumedPaymentCandidate`/`AdvanceConsumptionItem`/`AdvanceConsumptionPlan` (Task 3) used identically in Task 8. `UpdateChequeStatusDto`/`VoidPaymentDto` (Task 4) used identically in Tasks 6-7. `reverseInTx(tx, entryId, createdById)` (Task 2) signature matches every call site in Task 6. `recomputeInvoiceStatus(tx, billInvoiceId)` (Task 6) signature consistent across `recordPayment`/`updateChequeStatus`/`voidPayment`.
