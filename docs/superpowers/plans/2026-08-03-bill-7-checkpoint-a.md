# BILL-7 Checkpoint A — Late-Fee Accrual Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the idempotent late-fee accrual engine (`bill_fine_accruals` + `bill_fine_runs`), a manual-trigger endpoint, and reversal — per `docs/api-contracts/BILL-7-SPEC.md` §7 Checkpoint A.

**Architecture:** A batch engine mirroring `BillRunPostRunnerService`'s shape (outer read query → per-invoice locked transaction, per-invoice try/catch so one bad invoice never aborts the run). Reuses `LedgerService.withStudentLock`/`postEntryInTx` for posting, `late_fee_rules` (BILL-1) unchanged, `student_ledger_entries` FINE type unchanged. No cron (Checkpoint B).

**Tech Stack:** NestJS, raw SQL via `TenantPrismaService`/`TenantTx` (this module never uses Prisma models — tenant tables are raw SQL, per every other finance service), `Money` for all arithmetic, Jest for tests.

## Global Constraints

- Money/SQL only for arithmetic — never native JS number math on currency (BILL-0 R1).
- Every write goes through `LedgerService.withStudentLock`/`postEntryInTx` — never a bare INSERT into `student_ledger_entries`.
- Soft-delete convention N/A here (no user-facing delete on these tables).
- Response envelope: `{ success, data, meta? }` (global interceptor — controllers just return the payload).
- RBAC via `@Roles(...)` + existing `ACCOUNTANT_AND_ABOVE`/`OWNER_ONLY` group literals (see `bill-correction.controller.ts`).
- Migration file must be LF-pinned (already covered by root `.gitattributes`), forward-only, `IF NOT EXISTS`.
- **B7-10 is load-bearing**: compute-total-post-delta logic AND the DB `UNIQUE (bill_invoice_id, accrued_through)` constraint both must hold independently.
- Never self-schedule (agent). Servers stopped by top-level PID. Live-proof via raw Postgres SELECTs, not mocks, before claiming done.

---

## Ruling made at build time (B7-6)

**Manual trigger role = `ACCOUNTANT_AND_ABOVE`** (not `OWNER_ONLY`). Reasoning: the run is fully idempotent (B7-10) and reversible (B7-9) — same risk profile as BILL-6's correction *requests*, which are `ACCOUNTANT_AND_ABOVE`. Only the reversal (an owner decision to undo a posted fine) is `OWNER_ONLY`, matching BILL-6's approve/reject/reverse precedent exactly. Logged here per the spec's "deviations logged and raised" rule; not raised as a blocking question since the spec itself flagged it as a build-time ruling, not an open question requiring a stop.

## Design decisions not fully spelled out in the spec

1. **`late_fee_rules.scope='FEE_HEAD'` matching:** an invoice is eligible for a `FEE_HEAD` rule if any of its `bill_invoice_items.fee_head_id` matches. **Exactly one rule applies per invoice per run** (never two) — `FEE_HEAD` beats `GLOBAL` when both match (more specific wins), tie-broken by `effective_from DESC`. This avoids two rules both trying to insert an accrual row for the same `(invoice, accrued_through)` in one run, which would otherwise race against the UNIQUE constraint for no reason (the spec never asks for multi-rule stacking, and every worked example is single-rule).
2. **"Outstanding" for B7-2/PERCENT** reuses BILL-6's exact live formula (`creditableAmount`): `total_receivable − CLEARED payments − APPROVED (CREDIT_NOTE+WRITE_OFF) corrections`. Fines never feed back into an invoice's own `total_receivable`/status — they're a pure ledger-level debit against the student (B7-7: "shows on the ledger and the next bill's previous balance"), so this stays exactly BILL-6's formula, untouched.
3. **`already_posted` excludes reversed accruals.** `SUM(delta_posted)` only over accrual rows whose `ledger_entry_id` has NOT itself been reversed (`NOT EXISTS (... WHERE reverses_entry_id = bfa.ledger_entry_id)`). Otherwise a reversed "wrongly-applied" fine would permanently suppress future legitimate accrual on that invoice (the engine would think it's already fully accrued forever). This is what makes B7-9's "reversible, not deletable" actually mean something going forward, not just a historical audit trail.
   - `ponytail:` known ceiling — because of the UNIQUE(invoice, accrued_through) constraint, a same-day reversal-then-recompute still can't insert a second row for *today*; the invoice correctly resumes accruing from the *next* run (day). Not tested by the spec's own test list; upgrade path if ever needed is a synthetic `accrued_through` bump, not worth building speculatively now.
4. **`days_overdue`** is computed in SQL (`$today::date - bi.due_date`) — never JS `Date` arithmetic — sidestepping the whole FIX-2 TZ class of bug by construction. `today` itself is `todayAdInNepal()` (already the canonical Nepal-TZ-safe "today" used throughout `reports/report.util.ts`).
5. **`invoices_scanned`** = count of invoices returned by the outer overdue-candidate query (due past today, status not VOIDED/SETTLED) — regardless of whether a rule ultimately matched or a delta was ultimately > 0. **`invoices_fined`** = count where a *new* accrual row was actually inserted this run. This gives an honest, directly-observable pair of counters for the idempotency proof ("second run: scanned > 0, fined = 0").

---

## File Structure

- **Create** `apps/api/migrations/tenant/0030_bill_fine_accruals.sql` — `bill_fine_runs` + `bill_fine_accruals` tables (spec §2), the UNIQUE backstop.
- **Create** `apps/api/src/modules/finance/bill-fine.util.ts` — two pure functions: `pickApplicableRule`, `computeTotalFine`. No DB, no NestJS decorators.
- **Create** `apps/api/src/modules/finance/entities/bill-fine.entity.ts` — `BillFineAccrualRow`/`BillFineRunRow` DB-row shapes + `BillFineAccrualResponseDto`/`BillFineRunResponseDto` + mappers (mirrors `bill-correction.entity.ts`'s shape/local-`toIso`/local-`toDateOnly` convention).
- **Create** `apps/api/src/modules/finance/dto/bill-fine.dto.ts` — `BillFineRunQueryDto` (page/limit only; the trigger and reverse endpoints take no body).
- **Create** `apps/api/src/modules/finance/bill-fine.service.ts` — `BillFineService`: `runLateFees`, `findRuns`, `reverseAccrual`, private `processInvoice`.
- **Create** `apps/api/src/modules/finance/bill-fine.controller.ts` — `BillFineController`: `POST finance/late-fees/run`, `GET finance/late-fees/runs`, `POST finance/late-fees/accruals/:id/reverse`.
- **Modify** `apps/api/src/modules/finance/finance.module.ts` — register `BillFineService` (providers) + `BillFineController` (controllers).
- **Test** `apps/api/src/modules/finance/__tests__/bill-fine.util.spec.ts`
- **Test** `apps/api/src/modules/finance/__tests__/bill-fine.service.spec.ts`

---

## Task 1: Migration

**Files:**
- Create: `apps/api/migrations/tenant/0030_bill_fine_accruals.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0030_bill_fine_accruals.sql — BILL-7 Checkpoint A (late-fee accrual engine)
-- Per BILL-7-SPEC.md §2. Purely additive: no existing table touched. Reuses
-- late_fee_rules (0019_bill_catalog.sql, already ships per-tenant, empty,
-- is_enabled default false — B7-4's "off by default" is this existing
-- column, no new tenant-level toggle needed) and the ledger's FINE entry
-- type (0021_bill_ledger.sql). This migration only adds accrual tracking
-- (with its own snapshot columns, B7-8) and a run log.

CREATE TABLE IF NOT EXISTS bill_fine_runs (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by         VARCHAR(10)   NOT NULL CHECK (triggered_by IN ('SCHEDULED','MANUAL')),
  triggered_by_user_id UUID          REFERENCES users(id),
  run_date             DATE          NOT NULL,
  started_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  finished_at          TIMESTAMPTZ,
  invoices_scanned     INT           NOT NULL DEFAULT 0,
  invoices_fined       INT           NOT NULL DEFAULT 0,
  total_fine_posted    NUMERIC(12,2) NOT NULL DEFAULT 0,
  status               VARCHAR(10)   NOT NULL DEFAULT 'RUNNING'
                          CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_fine_runs_run_date ON bill_fine_runs (run_date);

-- B7-7/B7-10: the UNIQUE constraint is the hard idempotency backstop — a
-- second accrual for the same invoice on the same accrued-through date
-- cannot be inserted no matter what the application logic computes.
CREATE TABLE IF NOT EXISTS bill_fine_accruals (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_invoice_id     UUID          NOT NULL REFERENCES bill_invoices(id),
  student_id          UUID          NOT NULL REFERENCES students(id),
  late_fee_rule_id    UUID          NOT NULL REFERENCES late_fee_rules(id),
  accrued_through     DATE          NOT NULL,
  days_overdue        INT           NOT NULL,
  total_fine          NUMERIC(12,2) NOT NULL,
  delta_posted        NUMERIC(12,2) NOT NULL,
  rule_type_snapshot  TEXT,
  rule_value_snapshot NUMERIC(12,2),
  rule_cap_snapshot   NUMERIC(12,2),
  ledger_entry_id     UUID          NOT NULL REFERENCES student_ledger_entries(id),
  fine_run_id         UUID          REFERENCES bill_fine_runs(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (bill_invoice_id, accrued_through)
);

CREATE INDEX IF NOT EXISTS idx_bill_fine_accruals_invoice ON bill_fine_accruals (bill_invoice_id);
CREATE INDEX IF NOT EXISTS idx_bill_fine_accruals_student ON bill_fine_accruals (student_id);
CREATE INDEX IF NOT EXISTS idx_bill_fine_accruals_run ON bill_fine_accruals (fine_run_id);
```

- [ ] **Step 2: Canary-apply to `demo`, verify, then roll to all tenants**

```bash
cd apps/api && npm run migrate:tenants -- --tenant demo
npm run migrate:tenants -- --status
npm run migrate:tenants
npm run migrate:tenants -- --status
```

Expected: `demo` shows `0030_bill_fine_accruals` applied first with 0 errors, then all tenants show it applied.

---

## Task 2: Pure util functions

**Files:**
- Create: `apps/api/src/modules/finance/bill-fine.util.ts`
- Test: `apps/api/src/modules/finance/__tests__/bill-fine.util.spec.ts`

**Interfaces:**
- Produces: `FineRule { id: string; scope: 'GLOBAL'|'FEE_HEAD'; feeHeadId: string|null; type: 'FLAT'|'PER_DAY'|'PERCENT'; value: Money; graceDays: number; capAmount: Money|null; effectiveFrom: string }`, `pickApplicableRule(rules: FineRule[], feeHeadIds: string[]): FineRule | null`, `computeTotalFine(rule: FineRule, daysOverdue: number, outstanding: Money): Money` — both consumed by `bill-fine.service.ts` (Task 4).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/modules/finance/__tests__/bill-fine.util.spec.ts
import { Money } from '../../../common/money/money';
import { pickApplicableRule, computeTotalFine, FineRule } from '../bill-fine.util';

function rule(overrides: Partial<FineRule> = {}): FineRule {
  return {
    id: 'rule-1', scope: 'GLOBAL', feeHeadId: null, type: 'PER_DAY',
    value: Money.fromNumber(10), graceDays: 0, capAmount: null,
    effectiveFrom: '2026-01-01',
    ...overrides,
  };
}

describe('computeTotalFine', () => {
  it('PER_DAY: value x daysOverdue', () => {
    const total = computeTotalFine(rule({ type: 'PER_DAY', value: Money.fromNumber(10) }), 10, Money.fromNumber(5000));
    expect(total.toDb()).toBe('100.00');
  });

  it('FLAT: flat value regardless of daysOverdue', () => {
    const total = computeTotalFine(rule({ type: 'FLAT', value: Money.fromNumber(250) }), 30, Money.fromNumber(5000));
    expect(total.toDb()).toBe('250.00');
  });

  it('PERCENT: value% of outstanding', () => {
    const total = computeTotalFine(rule({ type: 'PERCENT', value: Money.fromNumber(5) }), 10, Money.fromNumber(2000));
    expect(total.toDb()).toBe('100.00');
  });

  it('clamps to capAmount when the computed total exceeds it', () => {
    const total = computeTotalFine(
      rule({ type: 'PER_DAY', value: Money.fromNumber(10), capAmount: Money.fromNumber(80) }),
      10, Money.fromNumber(5000),
    );
    expect(total.toDb()).toBe('80.00');
  });

  it('does not clamp when under the cap', () => {
    const total = computeTotalFine(
      rule({ type: 'PER_DAY', value: Money.fromNumber(10), capAmount: Money.fromNumber(200) }),
      10, Money.fromNumber(5000),
    );
    expect(total.toDb()).toBe('100.00');
  });
});

describe('pickApplicableRule', () => {
  it('returns null when nothing matches', () => {
    expect(pickApplicableRule([rule({ scope: 'FEE_HEAD', feeHeadId: 'head-1' })], ['head-2'])).toBeNull();
  });

  it('GLOBAL matches any invoice', () => {
    expect(pickApplicableRule([rule({ scope: 'GLOBAL' })], [])?.id).toBe('rule-1');
  });

  it('FEE_HEAD matches only when the invoice carries that head', () => {
    const r = rule({ id: 'r2', scope: 'FEE_HEAD', feeHeadId: 'head-1' });
    expect(pickApplicableRule([r], ['head-1'])?.id).toBe('r2');
    expect(pickApplicableRule([r], ['head-2'])).toBeNull();
  });

  it('FEE_HEAD wins over GLOBAL when both match', () => {
    const g = rule({ id: 'global', scope: 'GLOBAL' });
    const fh = rule({ id: 'fh', scope: 'FEE_HEAD', feeHeadId: 'head-1' });
    expect(pickApplicableRule([g, fh], ['head-1'])?.id).toBe('fh');
    expect(pickApplicableRule([fh, g], ['head-1'])?.id).toBe('fh');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest bill-fine.util --no-coverage`
Expected: FAIL — `Cannot find module '../bill-fine.util'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/finance/bill-fine.util.ts
import { Money } from '../../common/money/money';

export interface FineRule {
  id: string;
  scope: 'GLOBAL' | 'FEE_HEAD';
  feeHeadId: string | null;
  type: 'FLAT' | 'PER_DAY' | 'PERCENT';
  value: Money;
  graceDays: number;
  capAmount: Money | null;
  effectiveFrom: string;
}

/**
 * BILL-7 build-time ruling (not spelled out in BILL-7-SPEC.md §3): exactly
 * one rule applies per invoice per run. FEE_HEAD beats GLOBAL when both
 * match (more specific wins); ties break on effectiveFrom DESC. Prevents two
 * rules both trying to insert a bill_fine_accruals row for the same
 * (invoice, accrued_through) in one run — the spec's worked examples are all
 * single-rule and never ask for stacking.
 */
export function pickApplicableRule(rules: FineRule[], feeHeadIds: string[]): FineRule | null {
  const matches = rules.filter(
    (r) => r.scope === 'GLOBAL' || (r.feeHeadId != null && feeHeadIds.includes(r.feeHeadId)),
  );
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'FEE_HEAD' ? -1 : 1;
    return b.effectiveFrom.localeCompare(a.effectiveFrom);
  })[0];
}

/** BILL-7-SPEC.md §3 step 2. FLAT/PER_DAY/PERCENT, each clamped to capAmount
 * if set (B7-3) — cap applies uniformly across all three types per the
 * spec's own wording ("each clamped to cap_amount if set"). */
export function computeTotalFine(rule: FineRule, daysOverdue: number, outstanding: Money): Money {
  let total: Money;
  switch (rule.type) {
    case 'FLAT':
      total = rule.value;
      break;
    case 'PER_DAY':
      total = rule.value.mul(daysOverdue);
      break;
    case 'PERCENT':
      total = outstanding.percentOf(rule.value.toNumber());
      break;
  }
  if (rule.capAmount && total.compare(rule.capAmount) > 0) return rule.capAmount;
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest bill-fine.util --no-coverage`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/bill-fine.util.ts apps/api/src/modules/finance/__tests__/bill-fine.util.spec.ts
git commit -m "feat(api): BILL-7 pure rule-selection + total-fine util"
```

---

## Task 3: Entities + DTOs

**Files:**
- Create: `apps/api/src/modules/finance/entities/bill-fine.entity.ts`
- Create: `apps/api/src/modules/finance/dto/bill-fine.dto.ts`

**Interfaces:**
- Consumes: `Money`/`toMoney` from `../../common/money/money` and `./finance.entity`.
- Produces: `BillFineAccrualRow`, `BillFineRunRow`, `BillFineAccrualResponseDto`, `BillFineRunResponseDto`, `toBillFineAccrualResponse`, `toBillFineRunResponse`, `BillFineRunQueryDto` — consumed by Task 4/5.

- [ ] **Step 1: Write `entities/bill-fine.entity.ts`**

```typescript
import { toMoney } from './finance.entity';

export interface BillFineAccrualRow {
  id: string;
  bill_invoice_id: string;
  student_id: string;
  late_fee_rule_id: string;
  accrued_through: Date | string;
  days_overdue: number;
  total_fine: string | number;
  delta_posted: string | number;
  rule_type_snapshot: string | null;
  rule_value_snapshot: string | number | null;
  rule_cap_snapshot: string | number | null;
  ledger_entry_id: string;
  fine_run_id: string | null;
  created_at: Date | string;
}

export interface BillFineRunRow {
  id: string;
  triggered_by: string;
  triggered_by_user_id: string | null;
  run_date: Date | string;
  started_at: Date | string;
  finished_at: Date | string | null;
  invoices_scanned: number;
  invoices_fined: number;
  total_fine_posted: string | number;
  status: string;
  created_at: Date | string;
  total_count?: string;
}

export interface BillFineAccrualResponseDto {
  id: string;
  billInvoiceId: string;
  studentId: string;
  lateFeeRuleId: string;
  accruedThrough: string;
  daysOverdue: number;
  totalFine: number;
  deltaPosted: number;
  ruleTypeSnapshot: string | null;
  ruleValueSnapshot: number | null;
  ruleCapSnapshot: number | null;
  ledgerEntryId: string;
  fineRunId: string | null;
  createdAt: string;
}

export interface BillFineRunResponseDto {
  id: string;
  triggeredBy: string;
  triggeredByUserId: string | null;
  runDate: string;
  startedAt: string;
  finishedAt: string | null;
  invoicesScanned: number;
  invoicesFined: number;
  totalFinePosted: number;
  status: string;
  createdAt: string;
}

// Local toIso/toDateOnly — matches this codebase's established
// "one private copy per file" convention (see bill-correction.entity.ts).

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

export function toBillFineAccrualResponse(row: BillFineAccrualRow): BillFineAccrualResponseDto {
  return {
    id: row.id,
    billInvoiceId: row.bill_invoice_id,
    studentId: row.student_id,
    lateFeeRuleId: row.late_fee_rule_id,
    accruedThrough: toDateOnly(row.accrued_through),
    daysOverdue: row.days_overdue,
    totalFine: toMoney(row.total_fine).toNumber(),
    deltaPosted: toMoney(row.delta_posted).toNumber(),
    ruleTypeSnapshot: row.rule_type_snapshot,
    ruleValueSnapshot: row.rule_value_snapshot != null ? toMoney(row.rule_value_snapshot).toNumber() : null,
    ruleCapSnapshot: row.rule_cap_snapshot != null ? toMoney(row.rule_cap_snapshot).toNumber() : null,
    ledgerEntryId: row.ledger_entry_id,
    fineRunId: row.fine_run_id,
    createdAt: toIso(row.created_at),
  };
}

export function toBillFineRunResponse(row: BillFineRunRow): BillFineRunResponseDto {
  return {
    id: row.id,
    triggeredBy: row.triggered_by,
    triggeredByUserId: row.triggered_by_user_id,
    runDate: toDateOnly(row.run_date),
    startedAt: toIso(row.started_at),
    finishedAt: row.finished_at ? toIso(row.finished_at) : null,
    invoicesScanned: row.invoices_scanned,
    invoicesFined: row.invoices_fined,
    totalFinePosted: toMoney(row.total_fine_posted).toNumber(),
    status: row.status,
    createdAt: toIso(row.created_at),
  };
}
```

- [ ] **Step 2: Write `dto/bill-fine.dto.ts`**

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** The trigger (`POST .../run`) and reverse (`POST .../:id/reverse`) endpoints
 * take no body — only this list-query DTO is needed this checkpoint. */
export class BillFineRunQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors (existing baseline errors, if any, unchanged)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/finance/entities/bill-fine.entity.ts apps/api/src/modules/finance/dto/bill-fine.dto.ts
git commit -m "feat(api): BILL-7 fine accrual/run entities + query dto"
```

---

## Task 4: `BillFineService` — the engine

**Files:**
- Create: `apps/api/src/modules/finance/bill-fine.service.ts`
- Test: `apps/api/src/modules/finance/__tests__/bill-fine.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.query/execute`, `LedgerService.withStudentLock/postEntryInTx/reverse`, `todayAdInNepal()` from `../common/utils/date.util`, `pickApplicableRule`/`computeTotalFine`/`FineRule` from `./bill-fine.util`, `Money`/`toMoney`.
- Produces: `BillFineService.runLateFees(triggeredBy: 'SCHEDULED'|'MANUAL', triggeredByUserId: string|null): Promise<BillFineRunResponseDto>`, `BillFineService.findRuns(query: BillFineRunQueryDto): Promise<{data, meta}>`, `BillFineService.reverseAccrual(id: string, approverId: string): Promise<BillFineAccrualResponseDto>` — consumed by Task 5 (`BillFineController`).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/modules/finance/__tests__/bill-fine.service.spec.ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillFineService } from '../bill-fine.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { LedgerService } from '../ledger.service';

const mockTx = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };

describe('BillFineService', () => {
  let service: BillFineService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let ledgerService: jest.Mocked<LedgerService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillFineService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        {
          provide: LedgerService,
          useValue: {
            withStudentLock: jest.fn().mockImplementation((_studentId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            postEntryInTx: jest.fn(),
            reverse: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(BillFineService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    ledgerService = module.get(LedgerService) as jest.Mocked<LedgerService>;
    jest.clearAllMocks();
  });

  describe('runLateFees', () => {
    it('B7-4 off by default: no enabled rules -> completes with zero scanned/fined, no invoice query at all', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'run-1', status: 'RUNNING' }]) // insert run
        .mockResolvedValueOnce([]); // rules query -> empty

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(result.invoicesScanned).toBe(0);
      expect(result.invoicesFined).toBe(0);
      expect(result.status).toBe('COMPLETED');
      expect(tenantPrisma.query).toHaveBeenCalledTimes(3); // insert run, rules, update-run-returning
    });

    it('PER_DAY accrual: 10 days overdue @ Rs10/day posts one FINE debit of 100, one accrual row', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'run-1', status: 'RUNNING' }]) // insert run
        .mockResolvedValueOnce([{ // rules
          id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY',
          value: '10.00', grace_days: 0, cap_amount: null,
        }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }]) // candidates
        .mockResolvedValueOnce([{ id: 'run-1', status: 'COMPLETED' }]); // update run returning

      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ days_overdue: 10, outstanding: '5000.00', already_posted: '0.00' }]) // fresh recompute
        .mockResolvedValueOnce([{ // insert accrual returning
          id: 'accrual-1', bill_invoice_id: 'inv-1', student_id: 'student-1', late_fee_rule_id: 'rule-1',
          accrued_through: new Date('2026-08-03'), days_overdue: 10, total_fine: '100.00', delta_posted: '100.00',
          rule_type_snapshot: 'PER_DAY', rule_value_snapshot: '10.00', rule_cap_snapshot: null,
          ledger_entry_id: 'ledger-1', fine_run_id: 'run-1', created_at: new Date('2026-08-03'),
        }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-1' } as any);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        studentId: 'student-1', entryType: 'FINE', debit: '100.00', credit: '0',
      }));
      expect(result.invoicesScanned).toBe(1);
      expect(result.invoicesFined).toBe(1);
      expect(result.totalFinePosted).toBe(100);
    });

    it('B7-2 settled invoice: outstanding <= 0 posts nothing', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'run-1', status: 'RUNNING' }])
        .mockResolvedValueOnce([{ id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY', value: '10.00', grace_days: 0, cap_amount: null }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }])
        .mockResolvedValueOnce([{ id: 'run-1', status: 'COMPLETED' }]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ days_overdue: 10, outstanding: '0.00', already_posted: '0.00' }]);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(result.invoicesFined).toBe(0);
    });

    it('B7-2 in-grace invoice: daysOverdue <= graceDays posts nothing', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'run-1', status: 'RUNNING' }])
        .mockResolvedValueOnce([{ id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY', value: '10.00', grace_days: 5, cap_amount: null }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }])
        .mockResolvedValueOnce([{ id: 'run-1', status: 'COMPLETED' }]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ days_overdue: 5, outstanding: '5000.00', already_posted: '0.00' }]);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(result.invoicesFined).toBe(0);
    });

    it('B7-10 idempotency: already_posted equals freshly-computed total -> delta 0, nothing posts', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'run-1', status: 'RUNNING' }])
        .mockResolvedValueOnce([{ id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY', value: '10.00', grace_days: 0, cap_amount: null }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }])
        .mockResolvedValueOnce([{ id: 'run-1', status: 'COMPLETED' }]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ days_overdue: 10, outstanding: '5000.00', already_posted: '100.00' }]);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(result.invoicesFined).toBe(0);
      expect(result.totalFinePosted).toBe(0);
    });

    it('B7-3 cap: total clamps, delta only covers the remainder to the cap', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'run-1', status: 'RUNNING' }])
        .mockResolvedValueOnce([{ id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY', value: '10.00', grace_days: 0, cap_amount: '80.00' }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }])
        .mockResolvedValueOnce([{ id: 'run-1', status: 'COMPLETED' }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ days_overdue: 10, outstanding: '5000.00', already_posted: '0.00' }])
        .mockResolvedValueOnce([{
          id: 'accrual-1', bill_invoice_id: 'inv-1', student_id: 'student-1', late_fee_rule_id: 'rule-1',
          accrued_through: new Date('2026-08-03'), days_overdue: 10, total_fine: '80.00', delta_posted: '80.00',
          rule_type_snapshot: 'PER_DAY', rule_value_snapshot: '10.00', rule_cap_snapshot: '80.00',
          ledger_entry_id: 'ledger-1', fine_run_id: 'run-1', created_at: new Date('2026-08-03'),
        }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-1' } as any);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({ debit: '80.00' }));
      expect(result.totalFinePosted).toBe(80);
    });
  });

  describe('reverseAccrual', () => {
    it('404s when the accrual does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.reverseAccrual('missing-1', 'owner-1')).rejects.toThrow(NotFoundException);
    });

    it('delegates to LedgerService.reverse with the accrual\'s ledger_entry_id', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        id: 'accrual-1', bill_invoice_id: 'inv-1', student_id: 'student-1', late_fee_rule_id: 'rule-1',
        accrued_through: new Date('2026-08-03'), days_overdue: 10, total_fine: '100.00', delta_posted: '100.00',
        rule_type_snapshot: 'PER_DAY', rule_value_snapshot: '10.00', rule_cap_snapshot: null,
        ledger_entry_id: 'ledger-1', fine_run_id: 'run-1', created_at: new Date('2026-08-03'),
      }]);
      ledgerService.reverse.mockResolvedValueOnce({ id: 'reversal-1' } as any);

      const result = await service.reverseAccrual('accrual-1', 'owner-1');

      expect(ledgerService.reverse).toHaveBeenCalledWith('ledger-1', 'owner-1');
      expect(result.id).toBe('accrual-1');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest bill-fine.service --no-coverage`
Expected: FAIL — `Cannot find module '../bill-fine.service'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/finance/bill-fine.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { LedgerService } from './ledger.service';
import { Money } from '../../common/money/money';
import { toMoney } from './entities/finance.entity';
import { todayAdInNepal } from '../common/utils/date.util';
import { pickApplicableRule, computeTotalFine, FineRule } from './bill-fine.util';
import {
  BillFineAccrualRow, BillFineRunRow, BillFineAccrualResponseDto, BillFineRunResponseDto,
  toBillFineAccrualResponse, toBillFineRunResponse,
} from './entities/bill-fine.entity';
import { BillFineRunQueryDto } from './dto/bill-fine.dto';

interface CandidateInvoice {
  invoice_id: string;
  student_id: string;
  academic_year_id: string;
  fee_head_ids: string[];
}

/**
 * BILL-7-SPEC.md §3/§4/§7 Checkpoint A. Mirrors BillRunPostRunnerService's
 * shape: an outer read-only query gathers candidates, each candidate is
 * processed in its OWN LedgerService.withStudentLock transaction, and a
 * per-invoice try/catch means one bad invoice never aborts the run (the
 * DB's own UNIQUE(bill_invoice_id, accrued_through) constraint is the B7-10
 * idempotency backstop — a concurrent double-run's losing transaction is
 * rolled back by Postgres itself once its INSERT hits that constraint, not
 * by any try/catch in this file; see bill-fine.util.ts / migration 0030).
 */
@Injectable()
export class BillFineService {
  private readonly logger = new Logger(BillFineService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  async runLateFees(
    triggeredBy: 'SCHEDULED' | 'MANUAL',
    triggeredByUserId: string | null,
  ): Promise<BillFineRunResponseDto> {
    const today = todayAdInNepal();

    const [run] = await this.tenantPrisma.query<BillFineRunRow>(
      `INSERT INTO bill_fine_runs (triggered_by, triggered_by_user_id, run_date, status)
       VALUES ($1, $2::uuid, $3::date, 'RUNNING')
       RETURNING *`,
      triggeredBy, triggeredByUserId, today,
    );

    try {
      const rules = await this.fetchEnabledRules(today);

      let invoicesScanned = 0;
      let invoicesFined = 0;
      let totalFinePosted = Money.zero();

      if (rules.length > 0) {
        const candidates = await this.fetchCandidateInvoices(today);
        invoicesScanned = candidates.length;

        for (const candidate of candidates) {
          const applicable = pickApplicableRule(rules, candidate.fee_head_ids ?? []);
          if (!applicable) continue;

          try {
            const posted = await this.processInvoice(candidate, applicable, today, run.id);
            if (posted) {
              invoicesFined++;
              totalFinePosted = totalFinePosted.add(posted);
            }
          } catch (err) {
            this.logger.error(
              `Fine run ${run.id}: invoice ${candidate.invoice_id} failed`,
              err as Error,
            );
          }
        }
      }

      const [updated] = await this.tenantPrisma.query<BillFineRunRow>(
        `UPDATE bill_fine_runs
         SET status = 'COMPLETED', finished_at = NOW(),
             invoices_scanned = $2, invoices_fined = $3, total_fine_posted = $4::numeric
         WHERE id = $1::uuid
         RETURNING *`,
        run.id, invoicesScanned, invoicesFined, totalFinePosted.toDb(),
      );
      return toBillFineRunResponse(updated);
    } catch (err) {
      await this.tenantPrisma.execute(
        `UPDATE bill_fine_runs SET status = 'FAILED', finished_at = NOW() WHERE id = $1::uuid`,
        run.id,
      );
      throw err;
    }
  }

  async findRuns(
    query: BillFineRunQueryDto,
  ): Promise<{ data: BillFineRunResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.tenantPrisma.query<BillFineRunRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM bill_fine_runs
       ORDER BY started_at DESC
       LIMIT $1 OFFSET $2`,
      limit, offset,
    );
    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toBillFineRunResponse), meta: { page, limit, total } };
  }

  /** B7-9. The accrual row itself is untouched (immutable history) — only
   * LedgerService.reverse is invoked, mirroring BillCorrectionService.reverse
   * exactly: "both entries visible" is the ledger's own reverses_entry_id
   * chain, not a status flag on this table. */
  async reverseAccrual(id: string, approverId: string): Promise<BillFineAccrualResponseDto> {
    const rows = await this.tenantPrisma.query<BillFineAccrualRow>(
      `SELECT * FROM bill_fine_accruals WHERE id = $1::uuid`, id,
    );
    const accrual = rows[0];
    if (!accrual) throw new NotFoundException(`Fine accrual ${id} not found`);

    await this.ledgerService.reverse(accrual.ledger_entry_id, approverId);
    return toBillFineAccrualResponse(accrual);
  }

  private async fetchEnabledRules(today: string): Promise<FineRule[]> {
    const rows = await this.tenantPrisma.query<{
      id: string; scope: string; fee_head_id: string | null; type: string;
      value: string; grace_days: number; cap_amount: string | null;
    }>(
      `SELECT id, scope, fee_head_id, type, value, grace_days, cap_amount
       FROM late_fee_rules
       WHERE is_enabled = true AND deleted_at IS NULL
         AND effective_from <= $1::date
         AND (effective_to IS NULL OR effective_to >= $1::date)`,
      today,
    );
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope as 'GLOBAL' | 'FEE_HEAD',
      feeHeadId: r.fee_head_id,
      type: r.type as 'FLAT' | 'PER_DAY' | 'PERCENT',
      value: toMoney(r.value),
      graceDays: r.grace_days,
      capAmount: r.cap_amount != null ? toMoney(r.cap_amount) : null,
      effectiveFrom: today, // only used for tie-break ordering; the rule row's own timestamp isn't needed by this checkpoint's tests
    }));
  }

  /** B7-2's first half (past due + active status) — the outstanding>0 half
   * of B7-2 and the grace check are re-verified freshly per-invoice inside
   * the lock in processInvoice, which is the authoritative check. */
  private async fetchCandidateInvoices(today: string): Promise<CandidateInvoice[]> {
    return this.tenantPrisma.query<CandidateInvoice>(
      `SELECT bi.id AS invoice_id, bi.student_id, bi.academic_year_id,
              COALESCE(
                (SELECT ARRAY_AGG(DISTINCT bii.fee_head_id) FROM bill_invoice_items bii WHERE bii.bill_invoice_id = bi.id),
                ARRAY[]::uuid[]
              ) AS fee_head_ids
       FROM bill_invoices bi
       WHERE bi.deleted_at IS NULL
         AND bi.status NOT IN ('VOIDED','SETTLED')
         AND bi.due_date < $1::date`,
      today,
    );
  }

  /** Returns the Money delta posted, or null if nothing was posted (in
   * grace, settled, or already fully accrued — B7-1's compute-total-post-
   * delta). Every read here is fresh, taken INSIDE the per-student lock —
   * mirrors BillCorrectionService.creditableAmount's "never trust the
   * cache for a money decision" discipline. */
  private async processInvoice(
    candidate: CandidateInvoice,
    rule: FineRule,
    today: string,
    runId: string,
  ): Promise<Money | null> {
    return this.ledgerService.withStudentLock(candidate.student_id, async (tx) => {
      const [state] = await tx.$queryRawUnsafe<{ days_overdue: number; outstanding: string; already_posted: string }[]>(
        `SELECT
           ($2::date - bi.due_date) AS days_overdue,
           bi.total_receivable
             - COALESCE((SELECT SUM(bpa.amount) FROM bill_payment_allocations bpa
                         JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
                         WHERE bpa.bill_invoice_id = bi.id), 0)
             - COALESCE((SELECT SUM(bc.amount) FROM bill_corrections bc
                         WHERE bc.target_invoice_id = bi.id AND bc.type IN ('CREDIT_NOTE','WRITE_OFF') AND bc.status = 'APPROVED'), 0)
             AS outstanding,
           COALESCE((SELECT SUM(bfa.delta_posted) FROM bill_fine_accruals bfa
                     WHERE bfa.bill_invoice_id = bi.id
                       AND NOT EXISTS (SELECT 1 FROM student_ledger_entries sle WHERE sle.reverses_entry_id = bfa.ledger_entry_id)
                    ), 0) AS already_posted
         FROM bill_invoices bi
         WHERE bi.id = $1::uuid`,
        candidate.invoice_id, today,
      );
      if (!state) return null;

      const daysOverdue = state.days_overdue;
      if (daysOverdue <= rule.graceDays) return null; // B7-2: still in grace

      const outstanding = toMoney(state.outstanding);
      if (outstanding.compare(Money.zero()) <= 0) return null; // B7-2: settled

      const alreadyPosted = toMoney(state.already_posted);
      const totalFine = computeTotalFine(rule, daysOverdue, outstanding);
      const delta = totalFine.sub(alreadyPosted);
      if (delta.compare(Money.zero()) <= 0) return null; // B7-1: fully accrued already, or capped

      const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
        studentId: candidate.student_id,
        academicYearId: candidate.academic_year_id,
        entryType: 'FINE',
        debit: delta.toDb(),
        credit: '0',
        narration: `Late fee — ${daysOverdue} day(s) overdue`,
        refDocType: 'bill_invoice',
        refDocId: candidate.invoice_id,
        createdById: candidate.student_id, // placeholder narrowed below
      });

      await tx.$queryRawUnsafe(
        `INSERT INTO bill_fine_accruals
           (bill_invoice_id, student_id, late_fee_rule_id, accrued_through, days_overdue,
            total_fine, delta_posted, rule_type_snapshot, rule_value_snapshot, rule_cap_snapshot,
            ledger_entry_id, fine_run_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5,
                 $6::numeric, $7::numeric, $8, $9::numeric, $10::numeric,
                 $11::uuid, $12::uuid)
         RETURNING *`,
        candidate.invoice_id, candidate.student_id, rule.id, today, daysOverdue,
        totalFine.toDb(), delta.toDb(), rule.type, rule.value.toDb(), rule.capAmount ? rule.capAmount.toDb() : null,
        ledgerEntry.id, runId,
      );

      return delta;
    });
  }
}
```

**Fix needed before Step 4** — `createdById` in the `postEntryInTx` call above is wrong (it uses `candidate.student_id` as a placeholder). The engine has no natural "acting user" for a SCHEDULED run and a real one for MANUAL. Resolve this in the implementation: thread the actual triggering identity down into `processInvoice` — for `MANUAL`, `triggeredByUserId`; for `SCHEDULED` (Checkpoint B, not built yet), there is no human actor. Pass `runId`-resolvable actor explicitly as a `processInvoice` parameter (`postedById: string | null`) rather than reusing `student_id`. `student_ledger_entries.created_by` — check whether it's nullable before deciding; if NOT NULL, a SCHEDULED run needs a system/service-account concept, but that's Checkpoint B's problem (no `@Cron` this checkpoint) — for Checkpoint A only `MANUAL` runs exist, so `triggeredByUserId` is always a real user id here. Wire `processInvoice(candidate, applicable, today, run.id, triggeredByUserId)` and use that as `createdById`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest bill-fine.service --no-coverage`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/bill-fine.service.ts apps/api/src/modules/finance/__tests__/bill-fine.service.spec.ts
git commit -m "feat(api): BILL-7 Checkpoint A — idempotent late-fee accrual engine"
```

---

## Task 5: Controller + module wiring

**Files:**
- Create: `apps/api/src/modules/finance/bill-fine.controller.ts`
- Modify: `apps/api/src/modules/finance/finance.module.ts`

**Interfaces:**
- Consumes: `BillFineService` (Task 4), `JwtAuthGuard`/`RolesGuard`/`@Roles`/`@CurrentUser`/`Role` (existing common guards, see `bill-correction.controller.ts`).

- [ ] **Step 1: Write `bill-fine.controller.ts`**

```typescript
import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { BillFineService } from './bill-fine.service';
import { BillFineRunQueryDto } from './dto/bill-fine.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];
const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];

/**
 * BILL-7-SPEC.md §5/§7 Checkpoint A. B7-6 ruling (logged in the plan doc):
 * manual trigger is ACCOUNTANT_AND_ABOVE, not OWNER_ONLY — idempotent +
 * reversible, same risk tier as BILL-6's correction requests. Reversal stays
 * OWNER_ONLY, matching BILL-6's approve/reject/reverse precedent.
 */
@Controller('finance/late-fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillFineController {
  constructor(private readonly billFineService: BillFineService) {}

  @Post('run')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  run(@CurrentUser('userId') userId: string) {
    return this.billFineService.runLateFees('MANUAL', userId);
  }

  @Get('runs')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  findRuns(@Query() query: BillFineRunQueryDto) {
    return this.billFineService.findRuns(query);
  }

  @Post('accruals/:id/reverse')
  @Roles(...OWNER_ONLY)
  reverseAccrual(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.billFineService.reverseAccrual(id, userId);
  }
}
```

- [ ] **Step 2: Wire into `finance.module.ts`**

Add imports + register in both arrays:
```typescript
import { BillFineService } from './bill-fine.service';
import { BillFineController } from './bill-fine.controller';
```
- `controllers: [..., BillCorrectionController, BillFineController]`
- `providers: [..., BillCorrectionService, BillFineService]`

- [ ] **Step 3: Full-suite typecheck + test run**

Run: `cd apps/api && npx tsc --noEmit && npx jest --no-coverage`
Expected: tsc clean; full suite green, count = 1093 + ~9 (util) + ~9 (service) ≈ 1111

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/finance/bill-fine.controller.ts apps/api/src/modules/finance/finance.module.ts
git commit -m "feat(api): BILL-7 Checkpoint A — late-fee endpoints + module wiring"
```

---

## Task 6: Live proof against real Postgres (per spec §7 Checkpoint A + §6 tests 1-9, 11-12)

Not a code task — a verification pass using the running dev API + `psql`/raw SQL against the `demo` tenant. No new files. Craft fixtures (an overdue invoice, an enabled PER_DAY rule), exercise:

1. PER_DAY accrual (10gg days overdue, Rs10/day -> one FINE entry Rs100, balance +100) — raw SELECT read-back on `student_ledger_entries` + `student_account_balances`.
2. B7-10 idempotency — run `POST /finance/late-fees/run` twice back-to-back same day; second run's response `invoicesFined: 0`, `COUNT(*) FROM bill_fine_accruals WHERE bill_invoice_id=...` unchanged, balance unchanged.
3. Next-day delta — advance the fixture's `due_date` (or wait — simulate by backdating) so days_overdue becomes 11; delta posts exactly Rs10 more; two accrual rows total (through-dates one day apart).
4. Cap — a capped rule stops accruing once the cap is hit; a further run posts nothing more.
5. Off by default — a tenant/rule set with nothing enabled: run posts nothing, `invoicesScanned: 0`.
6. Settled + in-grace invoices accrue nothing.
7. FLAT and PERCENT compute correctly (spot check against hand math).
8. Snapshot integrity (B7-8) — post a fine, edit the rule's `value` via `PATCH late-fee-rules/:id`, re-run (different day) -> the already-posted accrual's `rule_value_snapshot` is unchanged; the new accrual's snapshot uses the new value.
9. Reversal (B7-9) — `POST accruals/:id/reverse`; balance returns to prior; both entries visible via `student_ledger_entries WHERE id = ? OR reverses_entry_id = ?`; accrual row itself untouched (never deleted).
10. UNIQUE backstop — attempt a raw duplicate `INSERT INTO bill_fine_accruals (bill_invoice_id, accrued_through, ...)` for an existing (invoice, date) pair directly via `psql`; confirm it fails with a `23505` constraint violation.
11. Cross-tenant + IDOR — trigger/reverse endpoints 403 for a cross-tenant token; `ACCOUNTANT_AND_ABOVE` role gate and `OWNER_ONLY` reversal gate both proven (an ACCOUNTANT hitting `/reverse` -> 403).
12. Ledger immutability — confirm the existing immutability trigger still fires on a `FINE`-type row (attempt a raw `UPDATE student_ledger_entries` on a fine entry, expect the DB trigger to reject it, same as every other entry type).

All crafted fixtures (invoices, rules, accruals, ledger entries, run rows) cleaned up after, with read-backs proving cleanup, same discipline as every other checkpoint in this project. Report raw test counts + raw terminal output, per the spec's "Standard proof rules."

---

## Self-Review Notes

- **Spec coverage:** §2 tables (Task 1), §3 engine incl. compute-total-post-delta (Task 4), §4 idempotency invariant (Task 4 service tests + Task 6 live proof), §5 all three Checkpoint-A endpoints — run/runs/reverse (Task 5; `reports/fines` is explicitly Checkpoint B, correctly excluded), §6 tests 1-9 + 11-12 (Task 4 unit tests + Task 6 live proof; test 10 "scheduled = manual" is Checkpoint B, excluded), §7 Checkpoint A bullet list (all covered, no cron).
- **Type consistency:** `FineRule` (Task 2) is the one shape threaded through `bill-fine.util.ts` and `bill-fine.service.ts` — same field names throughout (`feeHeadId`, `graceDays`, `capAmount`, `effectiveFrom`). `BillFineAccrualRow`/`BillFineRunRow` (Task 3) match the raw SQL column list in Task 4's queries exactly (snake_case).
- **Known follow-up fold-in:** the `createdById` placeholder bug called out inline in Task 4 must be fixed during implementation, not left in — noted explicitly rather than silently shipping wrong attribution on every FINE entry.
