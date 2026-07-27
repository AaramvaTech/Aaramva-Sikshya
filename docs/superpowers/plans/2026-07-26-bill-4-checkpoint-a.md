# BILL-4 Checkpoint A — Billing Run Draft Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `bill_runs` / `bill_run_lines` / `bill_invoices` / `bill_invoice_items` tables and the **draft-generation** path only (`docs/api-contracts/BILL-4-SPEC.md` §7 Checkpoint A) — resolve a roster, call the existing `FeePreviewService` per student, write outcomes to `bill_run_lines`. No posting, no invoice numbers, no ledger entries, zero `bill_invoices` rows created.

**Architecture:** One new migration (`0022_bill_run.sql`, canary `demo` → all tenants) creates all four spec tables now (so FKs resolve forward without a follow-up migration), but only `bill_runs`/`bill_run_lines` are ever written to this checkpoint. A new `BillRunService` resolves the class-or-whole-school roster synchronously (no background job — spec only requires a background job for *posting*), calls the already-existing `FeePreviewService.preview()` per student unchanged, and records one `bill_run_lines` row per student with an outcome (`DRAFT` / `SKIPPED_NO_ASSIGNMENT` / `SKIPPED_ALREADY_BILLED` / `FAILED`). Run-level totals are computed with one SQL `SUM()` aggregate (R1: "aggregation happens in SQL"), never JS-side `Money` accumulation across many student rows.

**Tech Stack:** NestJS, raw SQL via `TenantPrismaService` (no Prisma models for tenant tables), `Money`/`@IsMoneyString()`, `bs-calendar`, Jest.

## Global Constraints

- Money via `Money` class only; SQL params for money fields that came from a `@IsMoneyString()` DTO need an explicit `::numeric` cast (INC-3) — not applicable here since this checkpoint writes no caller-supplied money values, only server-computed numbers from `FeePreviewService`'s response (already-rounded JS numbers), passed as plain params.
- All raw SQL against tenant schema goes through `TenantPrismaService.query`/`.execute`/`.run` — never a second Prisma client.
- Locally-constructed `Date` objects (anything from `bsToAd()`) must be stringified with `formatLocalDate()`, never `.toISOString()` (FIX-2). DB-sourced dates and explicit AD date strings are fine with `.toISOString()`/UTC parsing.
- `ACCOUNTANT_AND_ABOVE` role guard on every new endpoint (spec §5).
- Migration file is LF-pinned (`.gitattributes` already covers `apps/api/migrations/tenant/*.sql`) — do not hand-edit line endings.
- Standard response envelope `{success, data, meta}` (via the existing global interceptor — controllers just return plain objects).
- No posting, no `POST .../post`, no `POST .../regenerate`, no `PATCH .../exclude`, no `DELETE .../:id` (void), no sequence numbering, no ledger writes, no `bill_invoices` writes. These are Checkpoint B/C.
- R15: no tenant finance tables are truncated or destructively touched; live proof uses `demo` (smallest real dataset), fixtures cleaned with read-backs per this codebase's live-data discipline.

---

### Task 1: Migration `0022_bill_run.sql`

**Files:**
- Create: `apps/api/migrations/tenant/0022_bill_run.sql`

**Interfaces:**
- Produces tables: `bill_runs`, `bill_run_lines`, `bill_invoices`, `bill_invoice_items` (columns exactly as in BILL-4-SPEC.md §2, with the amendments noted in the SQL comments below). Every later task's SQL depends on these exact column names (snake_case as written here).

- [ ] **Step 1: Write the migration file**

```sql
-- 0022_bill_run.sql — BILL-4 Checkpoint A (draft billing run engine)
-- Per BILL-4-SPEC.md §2. Purely additive: no existing table touched, no old
-- finance table modified (R10/R15 still in force). All four spec tables are
-- created now, in spec order, even though Checkpoint A's draft-generation
-- code only ever writes to bill_runs/bill_run_lines (zero bill_invoices /
-- bill_invoice_items rows this checkpoint — posting is Checkpoint B) — this
-- lets bill_run_lines.bill_invoice_id and bill_invoices.bill_run_id /
-- bill_invoice_items.bill_invoice_id FK correctly without a follow-up
-- migration.

CREATE TABLE IF NOT EXISTS bill_runs (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id  UUID          NOT NULL REFERENCES academic_years(id),
  bs_year           INT           NOT NULL,
  bs_month          INT           NOT NULL CHECK (bs_month BETWEEN 1 AND 12),
  scope             VARCHAR(15)   NOT NULL CHECK (scope IN ('CLASS','WHOLE_SCHOOL')),
  class_id          UUID          REFERENCES classes(id),
  status            VARCHAR(10)   NOT NULL DEFAULT 'DRAFT'
                       CHECK (status IN ('DRAFT','POSTING','POSTED','VOIDED')),
  issue_date        DATE          NOT NULL,
  due_date          DATE          NOT NULL,
  total_students    INT           NOT NULL DEFAULT 0,
  total_gross       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_concession  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_tax         NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net         NUMERIC(14,2) NOT NULL DEFAULT 0,
  idempotency_key   TEXT          NOT NULL,
  created_by        UUID          NOT NULL REFERENCES users(id),
  posted_by         UUID          REFERENCES users(id),
  posted_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- B4-3 idempotency: "per (tenant, academicYear, bsMonth, scope)". Partial
-- (not the spec DDL comment's bare UNIQUE) so voiding a DRAFT run (soft
-- delete) frees the key for a fresh draft — §3 "Void a draft... nothing to
-- unwind" implies re-drafting a voided period must be possible; a bare
-- UNIQUE would permanently block that. Same convention as
-- uq_sfsa_one_active_per_student_year (0020_bill_assignment.sql).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_runs_idempotency_key
  ON bill_runs (idempotency_key) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bill_runs_period
  ON bill_runs (academic_year_id, bs_year, bs_month);

CREATE TABLE IF NOT EXISTS bill_run_lines (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_run_id     UUID          NOT NULL REFERENCES bill_runs(id) ON DELETE CASCADE,
  student_id      UUID          NOT NULL REFERENCES students(id),
  outcome         VARCHAR(25)   NOT NULL CHECK (outcome IN
                     ('DRAFT','POSTED','SKIPPED_NO_ASSIGNMENT',
                      'SKIPPED_ALREADY_BILLED','EXCLUDED','FAILED')),
  skip_reason     TEXT,
  bill_invoice_id UUID,
  gross           NUMERIC(12,2) NOT NULL DEFAULT 0,
  concession      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax             NUMERIC(12,2) NOT NULL DEFAULT 0,
  net             NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_run_lines_run ON bill_run_lines (bill_run_id);
CREATE INDEX IF NOT EXISTS idx_bill_run_lines_student ON bill_run_lines (student_id);

-- One line per student per run. Checkpoint A only ever inserts fresh rows
-- for a brand-new run, but this protects the invariant from day one (a
-- future "regenerate" rebuilds by deleting+reinserting, never duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_run_lines_run_student
  ON bill_run_lines (bill_run_id, student_id);

CREATE TABLE IF NOT EXISTS bill_invoices (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      TEXT          UNIQUE,
  student_id          UUID          NOT NULL REFERENCES students(id),
  academic_year_id    UUID          NOT NULL REFERENCES academic_years(id),
  bill_run_id         UUID          NOT NULL REFERENCES bill_runs(id),
  bs_year             INT           NOT NULL,
  bs_month            INT           NOT NULL,
  issue_date          DATE          NOT NULL,
  due_date            DATE          NOT NULL,
  gross_amount        NUMERIC(12,2) NOT NULL,
  concession_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_base        NUMERIC(12,2) NOT NULL,
  tax_rate            NUMERIC(5,3),
  tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount          NUMERIC(12,2) NOT NULL,
  previous_balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_receivable    NUMERIC(12,2) NOT NULL,
  amount_in_words_en  TEXT,
  amount_in_words_ne  TEXT,
  status              VARCHAR(15)   NOT NULL DEFAULT 'POSTED'
                         CHECK (status IN ('POSTED','SETTLED','PARTIALLY_PAID','VOIDED')),
  ledger_entry_id     UUID,
  created_by          UUID          NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bill_invoices_student ON bill_invoices (student_id);
CREATE INDEX IF NOT EXISTS idx_bill_invoices_run ON bill_invoices (bill_run_id);

-- B4-3's other half: "already-invoiced students in that period are skipped".
-- Checkpoint A's SKIPPED_ALREADY_BILLED check queries against this — table
-- exists now even though nothing populates it until Checkpoint B.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_invoices_student_period
  ON bill_invoices (student_id, academic_year_id, bs_year, bs_month) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS bill_invoice_items (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_invoice_id     UUID          NOT NULL REFERENCES bill_invoices(id) ON DELETE CASCADE,
  fee_head_id         UUID          NOT NULL REFERENCES fee_heads(id),
  fee_head_name       TEXT          NOT NULL,
  recurrence          TEXT,
  gross_amount        NUMERIC(12,2) NOT NULL,
  concession_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_taxable          BOOLEAN       NOT NULL DEFAULT false,
  net_amount          NUMERIC(12,2) NOT NULL,
  proration_note      TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_invoice_items_invoice ON bill_invoice_items (bill_invoice_id);

-- bill_run_lines.bill_invoice_id -> bill_invoices(id): added after
-- bill_invoices exists (Postgres can't forward-reference a table that
-- doesn't exist yet; the spec lists bill_run_lines before bill_invoices).
ALTER TABLE bill_run_lines
  ADD CONSTRAINT fk_bill_run_lines_invoice
  FOREIGN KEY (bill_invoice_id) REFERENCES bill_invoices(id);
```

- [ ] **Step 2: Canary-apply to `demo`, verify, roll to all tenants**

```
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 npm run migrate:tenants -- --tenant demo
TS_NODE_TRANSPILE_ONLY=1 npm run migrate:tenants -- --status
TS_NODE_TRANSPILE_ONLY=1 npm run migrate:tenants
TS_NODE_TRANSPILE_ONLY=1 npm run migrate:tenants -- --status
```
Expected: `demo` (and then all 8 tenants) show `latest_applied = 0022_bill_run`, count 22. (Windows: set `TS_NODE_TRANSPILE_ONLY=1` per the migrate-runner-windows-boot gotcha — a cold full type-check makes the run look hung.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/migrations/tenant/0022_bill_run.sql
git commit -m "feat(api): BILL-4 Checkpoint A — bill_run tables (migration only)"
```

---

### Task 2: `bill-run.util.ts` — pure helpers (idempotency key, due-date default)

**Files:**
- Create: `apps/api/src/modules/finance/bill-run.util.ts`
- Test: `apps/api/src/modules/finance/__tests__/bill-run.util.spec.ts`

**Interfaces:**
- Produces: `DEFAULT_DUE_DAYS: number`, `buildBillRunIdempotencyKey(tenantSlug: string, academicYearId: string, bsMonth: number, scope: string, classId?: string | null): string`, `addDaysToAdString(adDate: string, days: number): string`. Task 5 (`BillRunService`) consumes all three.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/finance/__tests__/bill-run.util.spec.ts
import { DEFAULT_DUE_DAYS, buildBillRunIdempotencyKey, addDaysToAdString } from '../bill-run.util';

describe('bill-run.util', () => {
  describe('buildBillRunIdempotencyKey', () => {
    it('builds the literal <tenant>:<yearId>:<bsMonth>:<scope>:<classId?> shape', () => {
      expect(buildBillRunIdempotencyKey('demo', 'year-1', 3, 'CLASS', 'class-1'))
        .toBe('demo:year-1:3:CLASS:class-1');
    });

    it('leaves a trailing empty segment when classId is omitted (WHOLE_SCHOOL)', () => {
      expect(buildBillRunIdempotencyKey('demo', 'year-1', 3, 'WHOLE_SCHOOL'))
        .toBe('demo:year-1:3:WHOLE_SCHOOL:');
    });

    it('produces different keys for different classes in the same month', () => {
      const a = buildBillRunIdempotencyKey('demo', 'year-1', 3, 'CLASS', 'class-1');
      const b = buildBillRunIdempotencyKey('demo', 'year-1', 3, 'CLASS', 'class-2');
      expect(a).not.toBe(b);
    });
  });

  describe('addDaysToAdString', () => {
    it('adds days within the same month', () => {
      expect(addDaysToAdString('2026-07-01', 15)).toBe('2026-07-16');
    });

    it('rolls across a month boundary', () => {
      expect(addDaysToAdString('2026-07-25', 15)).toBe('2026-08-09');
    });

    it('rolls across a year boundary', () => {
      expect(addDaysToAdString('2026-12-25', 15)).toBe('2027-01-09');
    });

    it('0 days is a no-op', () => {
      expect(addDaysToAdString('2026-07-01', 0)).toBe('2026-07-01');
    });
  });

  describe('DEFAULT_DUE_DAYS', () => {
    it('is a positive integer', () => {
      expect(Number.isInteger(DEFAULT_DUE_DAYS)).toBe(true);
      expect(DEFAULT_DUE_DAYS).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest bill-run.util.spec.ts`
Expected: FAIL — `Cannot find module '../bill-run.util'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/finance/bill-run.util.ts
/**
 * R8 (inherited): "Due date = issue date + N days, tenant-configurable."
 * No tenant-settings infrastructure for N exists anywhere in the codebase
 * yet (checked: no due_days/dueDays column on tenants or any settings
 * table) — flagged in BILL-BUGS.md rather than inventing one unilaterally
 * for this checkpoint. CreateBillRunDto accepts an explicit per-run
 * `dueDate` override; this constant is only the fallback when omitted.
 */
export const DEFAULT_DUE_DAYS = 15;

/**
 * B4-3: idempotent per (tenant, academicYear, bsMonth, scope). Literal
 * shape from BILL-4-SPEC.md §2's bill_runs DDL comment:
 * "<tenant>:<yearId>:<bsMonth>:<scope>:<classId?>". bsYear is deliberately
 * absent (matches the spec's own comment) — academicYearId already anchors
 * the specific year; one academic_year_id never covers the same BS month
 * twice.
 */
export function buildBillRunIdempotencyKey(
  tenantSlug: string,
  academicYearId: string,
  bsMonth: number,
  scope: string,
  classId?: string | null,
): string {
  return `${tenantSlug}:${academicYearId}:${bsMonth}:${scope}:${classId ?? ''}`;
}

/**
 * Adds `days` to an AD 'YYYY-MM-DD' string. UTC-midnight parse/serialize is
 * TZ-independent here because the input is a STRING (parsed as UTC per the
 * ECMAScript date-only string grammar), not a locally-constructed Date —
 * the FIX-2 gotcha (formatLocalDate vs toISOString) applies to Date objects
 * built from local y/m/d components, which this is not.
 */
export function addDaysToAdString(adDate: string, days: number): string {
  const d = new Date(`${adDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest bill-run.util.spec.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/bill-run.util.ts apps/api/src/modules/finance/__tests__/bill-run.util.spec.ts
git commit -m "feat(api): BILL-4 Checkpoint A — bill-run pure helpers"
```

---

### Task 3: Entities — row shapes, response DTOs, mappers

**Files:**
- Create: `apps/api/src/modules/finance/entities/bill-run.entity.ts`

**Interfaces:**
- Consumes: nothing (pure types + mappers).
- Produces: `BillRunRow`, `BillRunLineRow` (row shapes matching migration column names exactly), `BillRunResponseDto`, `BillRunLineResponseDto`, `BillRunSummaryResponseDto` (= `BillRunResponseDto & { outcomeSummary: Record<string, number> }`), `BillRunDetailResponseDto` (= `BillRunResponseDto & { lines: BillRunLineResponseDto[]; outcomeSummary: Record<string, number> }`), `toBillRunResponse(row)`, `toBillRunLineResponse(row)`. Task 5 (`BillRunService`) imports all of these.

- [ ] **Step 1: Write the file**

```ts
// apps/api/src/modules/finance/entities/bill-run.entity.ts
// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface BillRunRow {
  id: string;
  academic_year_id: string;
  bs_year: number;
  bs_month: number;
  scope: string;
  class_id: string | null;
  status: string;
  issue_date: Date | string;
  due_date: Date | string;
  total_students: number;
  total_gross: string | number;
  total_concession: string | number;
  total_tax: string | number;
  total_net: string | number;
  idempotency_key: string;
  created_by: string;
  posted_by: string | null;
  posted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BillRunLineRow {
  id: string;
  bill_run_id: string;
  student_id: string;
  outcome: string;
  skip_reason: string | null;
  bill_invoice_id: string | null;
  gross: string | number;
  concession: string | number;
  tax: string | number;
  net: string | number;
  created_at: Date | string;
  student_name?: string;
  admission_number?: string;
  total_count?: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BillRunResponseDto {
  id: string;
  academicYearId: string;
  bsYear: number;
  bsMonth: number;
  scope: string;
  classId: string | null;
  status: string;
  issueDate: string;
  dueDate: string;
  totalStudents: number;
  totalGross: number;
  totalConcession: number;
  totalTax: number;
  totalNet: number;
  createdBy: string;
  postedBy: string | null;
  postedAt: string | null;
  createdAt: string;
}

export interface BillRunLineResponseDto {
  id: string;
  billRunId: string;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  outcome: string;
  skipReason: string | null;
  billInvoiceId: string | null;
  gross: number;
  concession: number;
  tax: number;
  net: number;
  createdAt: string;
}

export type BillRunSummaryResponseDto = BillRunResponseDto & {
  outcomeSummary: Record<string, number>;
};

export type BillRunDetailResponseDto = BillRunResponseDto & {
  lines: BillRunLineResponseDto[];
  outcomeSummary: Record<string, number>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Local copies, not shared with finance.entity.ts / bill-assignment.entity.ts —
// matches this codebase's established "one private copy per file" convention
// (see BILL-2's BILL-BUGS.md note on FeePreviewService's guardian-ownership check).

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

function toNum(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v);
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toBillRunResponse(row: BillRunRow): BillRunResponseDto {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    bsYear: row.bs_year,
    bsMonth: row.bs_month,
    scope: row.scope,
    classId: row.class_id,
    status: row.status,
    issueDate: toDateOnly(row.issue_date),
    dueDate: toDateOnly(row.due_date),
    totalStudents: row.total_students,
    totalGross: toNum(row.total_gross),
    totalConcession: toNum(row.total_concession),
    totalTax: toNum(row.total_tax),
    totalNet: toNum(row.total_net),
    createdBy: row.created_by,
    postedBy: row.posted_by,
    postedAt: row.posted_at ? toIso(row.posted_at) : null,
    createdAt: toIso(row.created_at),
  };
}

export function toBillRunLineResponse(row: BillRunLineRow): BillRunLineResponseDto {
  return {
    id: row.id,
    billRunId: row.bill_run_id,
    studentId: row.student_id,
    studentName: row.student_name,
    admissionNumber: row.admission_number,
    outcome: row.outcome,
    skipReason: row.skip_reason,
    billInvoiceId: row.bill_invoice_id,
    gross: toNum(row.gross),
    concession: toNum(row.concession),
    tax: toNum(row.tax),
    net: toNum(row.net),
    createdAt: toIso(row.created_at),
  };
}
```

Note on `toNum`: unlike `finance.entity.ts`'s `toMoney(...).toNumber()`, these values are display-only re-serializations of numbers that `BillRunService` already computed/rounded via `Money` before writing them to the DB (R1's rounding boundary was already crossed at the write). A second `Money` round-trip here would be a no-op; a plain `parseFloat` on a NUMERIC-as-string from Postgres is the same boundary conversion `toMoney(...).toNumber()` does, just without allocating a `Money` for values never used in arithmetic again. This mirrors `toBulkAssignJobResponse`'s handling of non-arithmetic numeric fields.

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors (file has no consumers yet, so this only checks the file parses/typechecks standalone).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/finance/entities/bill-run.entity.ts
git commit -m "feat(api): BILL-4 Checkpoint A — bill-run entity rows/DTOs/mappers"
```

---

### Task 4: DTOs

**Files:**
- Create: `apps/api/src/modules/finance/dto/bill-run.dto.ts`

**Interfaces:**
- Produces: `BillRunScope` enum (`CLASS`, `WHOLE_SCHOOL`), `CreateBillRunDto`, `BillRunQueryDto`, `BillRunLineQueryDto`. Task 5's `BillRunService` and Task 6's `BillRunController` both import these.

- [ ] **Step 1: Write the file**

```ts
// apps/api/src/modules/finance/dto/bill-run.dto.ts
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export enum BillRunScope {
  CLASS = 'CLASS',
  WHOLE_SCHOOL = 'WHOLE_SCHOOL',
}

const RUN_STATUSES = ['DRAFT', 'POSTING', 'POSTED', 'VOIDED'] as const;
const LINE_OUTCOMES = [
  'DRAFT', 'POSTED', 'SKIPPED_NO_ASSIGNMENT', 'SKIPPED_ALREADY_BILLED', 'EXCLUDED', 'FAILED',
] as const;

/**
 * classId's "required only when scope is CLASS" is checked in the service,
 * not expressed here via @ValidateIf — matches this codebase's established
 * convention (see BulkAssignDto's identical comment in
 * student-fee-structure-assignment.dto.ts: "this codebase doesn't have a
 * bespoke validator for that shape yet").
 */
export class CreateBillRunDto {
  @IsUUID() academicYearId: string;

  @IsEnum(BillRunScope) scope: BillRunScope;

  @IsOptional() @IsUUID() classId?: string;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) bsYear: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(12) bsMonth: number;

  /** Defaults to today (Nepal AD) — see BillRunService. R7: issue date is independent of the billed period. */
  @IsOptional() @IsDateString() issueDate?: string;

  /** Defaults to issueDate + DEFAULT_DUE_DAYS — see bill-run.util.ts and BILL-BUGS.md (R8's tenant setting doesn't exist as infrastructure yet). */
  @IsOptional() @IsDateString() dueDate?: string;
}

export class BillRunQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) bsYear?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) bsMonth?: number;
  @IsOptional() @IsEnum(RUN_STATUSES) status?: string;
}

export class BillRunLineQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsEnum(LINE_OUTCOMES) outcome?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/finance/dto/bill-run.dto.ts
git commit -m "feat(api): BILL-4 Checkpoint A — bill-run DTOs"
```

---

### Task 5: `BillRunService` — draft generation, list, detail

**Files:**
- Create: `apps/api/src/modules/finance/bill-run.service.ts`
- Test: `apps/api/src/modules/finance/__tests__/bill-run.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.query<T>(sql, ...params): Promise<T[]>` / `.execute(sql, ...params): Promise<number>`; `TenantContextService.getOrThrow(): { tenantId, slug, schemaName }`; `FeePreviewService.preview(studentId: string, query: FeePreviewQueryDto, callerId?: string, callerRole?: Role): Promise<FeePreviewResponseDto>` (throws `NotFoundException` when no active assignment); `buildBillRunIdempotencyKey`, `addDaysToAdString`, `DEFAULT_DUE_DAYS` from `bill-run.util.ts`; `BillRunRow`, `BillRunLineRow`, `toBillRunResponse`, `toBillRunLineResponse` from `entities/bill-run.entity.ts`; `CreateBillRunDto`, `BillRunScope`, `BillRunQueryDto`, `BillRunLineQueryDto` from `dto/bill-run.dto.ts`; `formatLocalDate` from `../common/utils/date.util`; `bsToAd` from `bs-calendar`; `todayAdInNepal` from `../common/utils/date.util`.
- Produces: `BillRunService.generateDraft(dto, createdById): Promise<BillRunSummaryResponseDto>`, `BillRunService.findAll(query): Promise<{data: BillRunResponseDto[]; meta: {page,limit,total}}>`, `BillRunService.findOne(id, query?): Promise<BillRunDetailResponseDto>`. Task 6's `BillRunController` calls all three.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/finance/__tests__/bill-run.service.spec.ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillRunService } from '../bill-run.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { FeePreviewService } from '../fee-preview.service';
import { BillRunScope } from '../dto/bill-run.dto';

const mockRunRow = {
  id: 'run-1',
  academic_year_id: 'year-1',
  bs_year: 2083,
  bs_month: 3,
  scope: 'CLASS',
  class_id: 'class-1',
  status: 'DRAFT',
  issue_date: new Date('2026-07-16'),
  due_date: new Date('2026-07-31'),
  total_students: 2,
  total_gross: '0',
  total_concession: '0',
  total_tax: '0',
  total_net: '0',
  idempotency_key: 'demo:year-1:3:CLASS:class-1',
  created_by: 'user-1',
  posted_by: null,
  posted_at: null,
  created_at: new Date('2026-07-16'),
  updated_at: new Date('2026-07-16'),
  deleted_at: null,
};

function baseDto() {
  return {
    academicYearId: 'year-1',
    scope: BillRunScope.CLASS,
    classId: 'class-1',
    bsYear: 2083,
    bsMonth: 3,
  };
}

describe('BillRunService', () => {
  let service: BillRunService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let feePreviewService: jest.Mocked<FeePreviewService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillRunService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo', schemaName: 'tenant_demo' }) } },
        { provide: FeePreviewService, useValue: { preview: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillRunService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    feePreviewService = module.get(FeePreviewService) as jest.Mocked<FeePreviewService>;
    jest.clearAllMocks();
  });

  describe('generateDraft', () => {
    it('rejects CLASS scope without classId', async () => {
      await expect(
        service.generateDraft({ ...baseDto(), classId: undefined }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s when the academic year does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // academic year check
      await expect(service.generateDraft(baseDto(), 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('404s when the class does not exist', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([]); // class check
      await expect(service.generateDraft(baseDto(), 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('409s when a run already exists for this period+scope', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([{ id: 'class-1' }]) // class check
        .mockResolvedValueOnce([{ id: 'existing-run', status: 'DRAFT' }]); // idempotency check
      await expect(service.generateDraft(baseDto(), 'user-1')).rejects.toThrow(ConflictException);
    });

    it('creates zero bill_run_lines and a zero-student run when the roster is empty', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([{ id: 'class-1' }]) // class check
        .mockResolvedValueOnce([]) // idempotency check: none existing
        .mockResolvedValueOnce([]) // roster: empty class
        .mockResolvedValueOnce([{ ...mockRunRow, total_students: 0 }]) // INSERT bill_runs RETURNING *
        .mockResolvedValueOnce([{ ...mockRunRow, total_students: 0 }]); // final aggregate UPDATE RETURNING *

      const result = await service.generateDraft(baseDto(), 'user-1');
      expect(result.totalStudents).toBe(0);
      expect(result.outcomeSummary).toEqual({});
      expect(feePreviewService.preview).not.toHaveBeenCalled();
    });

    it('records DRAFT for a student with an active assignment and SKIPPED_NO_ASSIGNMENT for one without', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([{ id: 'class-1' }]) // class check
        .mockResolvedValueOnce([]) // idempotency check
        .mockResolvedValueOnce([{ id: 'student-1' }, { id: 'student-2' }]) // roster
        .mockResolvedValueOnce([mockRunRow]) // INSERT bill_runs RETURNING *
        .mockResolvedValueOnce([]) // student-1 already-billed check: none
        .mockResolvedValueOnce([]) // student-2 already-billed check: none
        .mockResolvedValueOnce([{ ...mockRunRow, total_gross: '5000.00', total_net: '4500.00', total_concession: '500.00' }]); // final aggregate UPDATE RETURNING *

      feePreviewService.preview
        .mockResolvedValueOnce({
          studentId: 'student-1', feeStructureId: 'fs-1', feeStructureName: 'Grade 9', academicYearId: 'year-1',
          asOfDate: '2026-07-16', heads: [], transport: null, wholeBillConcessions: [],
          grossTotal: 5000, concessionTotal: 500, netTotal: 4500,
        } as any)
        .mockRejectedValueOnce(new NotFoundException('No active fee structure assignment for this student in the given academic year'));

      const result = await service.generateDraft(baseDto(), 'user-1');

      expect(feePreviewService.preview).toHaveBeenCalledTimes(2);
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_run_lines'),
        'run-1', 'student-1', 'DRAFT', null, 5000, 500, 0, 4500,
      );
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_run_lines'),
        'run-1', 'student-2', 'SKIPPED_NO_ASSIGNMENT',
        'No active fee structure assignment for this student in the given academic year',
        0, 0, 0, 0,
      );
      expect(result.totalGross).toBe(5000);
    });

    it('records SKIPPED_ALREADY_BILLED without calling FeePreviewService', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ id: 'class-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([mockRunRow])
        .mockResolvedValueOnce([{ id: 'existing-invoice-1' }]) // already-billed check: found
        .mockResolvedValueOnce([mockRunRow]); // final aggregate UPDATE

      await service.generateDraft(baseDto(), 'user-1');

      expect(feePreviewService.preview).not.toHaveBeenCalled();
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_run_lines'),
        'run-1', 'student-1', 'SKIPPED_ALREADY_BILLED', expect.stringContaining('existing-invoice-1'),
        0, 0, 0, 0,
      );
    });

    it('records FAILED (not an abort) when FeePreviewService throws something other than NotFoundException', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ id: 'class-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([mockRunRow])
        .mockResolvedValueOnce([]) // already-billed check
        .mockResolvedValueOnce([mockRunRow]); // final aggregate UPDATE

      feePreviewService.preview.mockRejectedValueOnce(new Error('unexpected DB error'));

      const result = await service.generateDraft(baseDto(), 'user-1');

      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_run_lines'),
        'run-1', 'student-1', 'FAILED', 'unexpected DB error', 0, 0, 0, 0,
      );
      expect(result).toBeDefined(); // run continues, does not throw
    });

    it('WHOLE_SCHOOL scope resolves the roster with no class filter', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([]) // idempotency check (no class check for WHOLE_SCHOOL)
        .mockResolvedValueOnce([]) // roster (empty for simplicity)
        .mockResolvedValueOnce([{ ...mockRunRow, scope: 'WHOLE_SCHOOL', class_id: null, total_students: 0 }])
        .mockResolvedValueOnce([{ ...mockRunRow, scope: 'WHOLE_SCHOOL', class_id: null, total_students: 0 }]);

      const result = await service.generateDraft(
        { academicYearId: 'year-1', scope: BillRunScope.WHOLE_SCHOOL, bsYear: 2083, bsMonth: 3 },
        'user-1',
      );
      expect(result.scope).toBe('WHOLE_SCHOOL');
      const rosterCall = (tenantPrisma.query as jest.Mock).mock.calls[2];
      expect(rosterCall[0]).not.toContain('class_id =');
    });
  });

  describe('findOne', () => {
    it('404s when the run does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the run with lines and an outcome summary', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockRunRow]) // run row
        .mockResolvedValueOnce([{ outcome: 'DRAFT', count: '2' }, { outcome: 'SKIPPED_NO_ASSIGNMENT', count: '1' }]) // outcome summary
        .mockResolvedValueOnce([ // lines page
          { id: 'line-1', bill_run_id: 'run-1', student_id: 'student-1', outcome: 'DRAFT', skip_reason: null, bill_invoice_id: null, gross: '5000', concession: '500', tax: '0', net: '4500', created_at: new Date('2026-07-16'), student_name: 'Test Student', admission_number: 'STU-001', total_count: '3' },
        ]);

      const result = await service.findOne('run-1');
      expect(result.lines).toHaveLength(1);
      expect(result.outcomeSummary).toEqual({ DRAFT: 2, SKIPPED_NO_ASSIGNMENT: 1 });
    });
  });

  describe('findAll', () => {
    it('applies default pagination', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      const result = await service.findAll({});
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 0 });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest bill-run.service.spec.ts`
Expected: FAIL — `Cannot find module '../bill-run.service'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/finance/bill-run.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { bsToAd } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { FeePreviewService } from './fee-preview.service';
import { formatLocalDate, todayAdInNepal } from '../common/utils/date.util';
import { buildBillRunIdempotencyKey, addDaysToAdString, DEFAULT_DUE_DAYS } from './bill-run.util';
import { CreateBillRunDto, BillRunScope, BillRunQueryDto, BillRunLineQueryDto } from './dto/bill-run.dto';
import {
  BillRunRow, BillRunLineRow, BillRunResponseDto, BillRunSummaryResponseDto, BillRunDetailResponseDto,
  toBillRunResponse, toBillRunLineResponse,
} from './entities/bill-run.entity';

interface LineOutcome {
  outcome: string;
  skipReason: string | null;
  gross: number;
  concession: number;
  net: number;
}

@Injectable()
export class BillRunService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly feePreviewService: FeePreviewService,
  ) {}

  /**
   * BILL-4-SPEC.md §3 "Generate draft". Synchronous (no background job —
   * the spec only requires one for *posting*, a whole-school post being
   * "thousands of invoices on 1 vCPU"; a draft's per-student work is a
   * handful of SELECTs, not a write-heavy chunked job). Creates bill_runs +
   * bill_run_lines ONLY — zero bill_invoices, zero ledger entries, per
   * Checkpoint A's explicit scope.
   */
  async generateDraft(dto: CreateBillRunDto, createdById: string): Promise<BillRunSummaryResponseDto> {
    if (dto.scope === BillRunScope.CLASS && !dto.classId) {
      throw new BadRequestException('classId is required when scope is CLASS');
    }

    const { slug } = this.tenantContext.getOrThrow();

    const yearRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.academicYearId,
    );
    if (!yearRows[0]) throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);

    if (dto.scope === BillRunScope.CLASS) {
      const classRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.classId,
      );
      if (!classRows[0]) throw new NotFoundException(`Class ${dto.classId} not found`);
    }

    const issueDate = dto.issueDate ?? todayAdInNepal();
    const dueDate = dto.dueDate ?? addDaysToAdString(issueDate, DEFAULT_DUE_DAYS);
    const idempotencyKey = buildBillRunIdempotencyKey(slug, dto.academicYearId, dto.bsMonth, dto.scope, dto.classId);

    const existing = await this.tenantPrisma.query<{ id: string; status: string }>(
      `SELECT id, status FROM bill_runs WHERE idempotency_key = $1 AND deleted_at IS NULL`,
      idempotencyKey,
    );
    if (existing[0]) {
      throw new ConflictException(
        `A bill run already exists for this period and scope (id=${existing[0].id}, status=${existing[0].status})`,
      );
    }

    const studentIds = await this.resolveRoster(dto.scope, dto.classId);

    let runRow: BillRunRow;
    try {
      const rows = await this.tenantPrisma.query<BillRunRow>(
        `INSERT INTO bill_runs
           (academic_year_id, bs_year, bs_month, scope, class_id, status,
            issue_date, due_date, total_students, idempotency_key, created_by)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid, 'DRAFT',
                 $6::date, $7::date, $8, $9, $10::uuid)
         RETURNING *`,
        dto.academicYearId, dto.bsYear, dto.bsMonth, dto.scope, dto.classId ?? null,
        issueDate, dueDate, studentIds.length, idempotencyKey, createdById,
      );
      runRow = rows[0];
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      if (msg.includes('23505') || msg.includes('unique constraint')) {
        throw new ConflictException('A bill run already exists for this period and scope');
      }
      throw err;
    }

    // The date used to resolve which fee-structure assignment/override/
    // concession/transport is active for this billing period — first day
    // of the target BS month. bsToAd() returns a locally-constructed Date
    // (FIX-2), so formatLocalDate (not toISOString) is required here.
    const asOfDate = formatLocalDate(bsToAd({ year: dto.bsYear, month: dto.bsMonth, day: 1 }));

    const outcomeCounts: Record<string, number> = {};
    for (const studentId of studentIds) {
      const line = await this.resolveLine(studentId, dto.academicYearId, dto.bsYear, dto.bsMonth, asOfDate);
      await this.tenantPrisma.execute(
        `INSERT INTO bill_run_lines
           (bill_run_id, student_id, outcome, skip_reason, gross, concession, tax, net)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)`,
        runRow.id, studentId, line.outcome, line.skipReason,
        line.gross, line.concession, 0, line.net,
      );
      outcomeCounts[line.outcome] = (outcomeCounts[line.outcome] ?? 0) + 1;
    }

    // R1: "aggregation happens in SQL" — SUM() across (potentially
    // thousands of) bill_run_lines rows, not a JS accumulator.
    const [updatedRun] = await this.tenantPrisma.query<BillRunRow>(
      `UPDATE bill_runs br SET
         total_gross = agg.gross, total_concession = agg.concession,
         total_tax = agg.tax, total_net = agg.net, updated_at = NOW()
       FROM (
         SELECT COALESCE(SUM(gross),0) AS gross, COALESCE(SUM(concession),0) AS concession,
                COALESCE(SUM(tax),0) AS tax, COALESCE(SUM(net),0) AS net
         FROM bill_run_lines WHERE bill_run_id = $1::uuid AND outcome = 'DRAFT'
       ) agg
       WHERE br.id = $1::uuid
       RETURNING br.*`,
      runRow.id,
    );

    return { ...toBillRunResponse(updatedRun), outcomeSummary: outcomeCounts };
  }

  async findAll(query: BillRunQueryDto): Promise<{ data: BillRunResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;
    if (query.academicYearId) { conditions.push(`academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.bsYear) { conditions.push(`bs_year = $${idx++}`); params.push(query.bsYear); }
    if (query.bsMonth) { conditions.push(`bs_month = $${idx++}`); params.push(query.bsMonth); }
    if (query.status) { conditions.push(`status = $${idx++}`); params.push(query.status); }

    params.push(limit, offset);
    const rows = await this.tenantPrisma.query<BillRunRow>(
      `SELECT *, COUNT(*) OVER() AS total_count FROM bill_runs
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toBillRunResponse), meta: { page, limit, total } };
  }

  async findOne(id: string, lineQuery: BillRunLineQueryDto = {}): Promise<BillRunDetailResponseDto> {
    const runRows = await this.tenantPrisma.query<BillRunRow>(
      `SELECT * FROM bill_runs WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!runRows[0]) throw new NotFoundException(`Bill run ${id} not found`);

    const summaryRows = await this.tenantPrisma.query<{ outcome: string; count: string }>(
      `SELECT outcome, COUNT(*) AS count FROM bill_run_lines WHERE bill_run_id = $1::uuid GROUP BY outcome`,
      id,
    );
    const outcomeSummary: Record<string, number> = {};
    for (const row of summaryRows) outcomeSummary[row.outcome] = parseInt(row.count, 10);

    const page = lineQuery.page ?? 1;
    const limit = lineQuery.limit ?? 20;
    const offset = (page - 1) * limit;
    const conditions = ['brl.bill_run_id = $1::uuid'];
    const params: unknown[] = [id];
    let idx = 2;
    if (lineQuery.outcome) { conditions.push(`brl.outcome = $${idx++}`); params.push(lineQuery.outcome); }
    params.push(limit, offset);

    const lineRows = await this.tenantPrisma.query<BillRunLineRow>(
      `SELECT brl.*, s.first_name || ' ' || s.last_name AS student_name, s.student_id AS admission_number
       FROM bill_run_lines brl
       JOIN students s ON s.id = brl.student_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.student_id
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    return {
      ...toBillRunResponse(runRows[0]),
      lines: lineRows.map(toBillRunLineResponse),
      outcomeSummary,
    };
  }

  private async resolveRoster(scope: BillRunScope, classId?: string): Promise<string[]> {
    if (scope === BillRunScope.CLASS) {
      const rows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students WHERE class_id = $1::uuid AND deleted_at IS NULL AND status = 'ACTIVE' ORDER BY student_id`,
        classId,
      );
      return rows.map((r) => r.id);
    }
    const rows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE deleted_at IS NULL AND status = 'ACTIVE' ORDER BY student_id`,
    );
    return rows.map((r) => r.id);
  }

  private async resolveLine(
    studentId: string,
    academicYearId: string,
    bsYear: number,
    bsMonth: number,
    asOfDate: string,
  ): Promise<LineOutcome> {
    const already = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM bill_invoices
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
         AND bs_year = $3 AND bs_month = $4 AND deleted_at IS NULL`,
      studentId, academicYearId, bsYear, bsMonth,
    );
    if (already[0]) {
      return {
        outcome: 'SKIPPED_ALREADY_BILLED',
        skipReason: `Already billed (invoice ${already[0].id})`,
        gross: 0, concession: 0, net: 0,
      };
    }

    try {
      const preview = await this.feePreviewService.preview(studentId, { academicYearId, asOfDate });
      return { outcome: 'DRAFT', skipReason: null, gross: preview.grossTotal, concession: preview.concessionTotal, net: preview.netTotal };
    } catch (err) {
      if (err instanceof NotFoundException) {
        return { outcome: 'SKIPPED_NO_ASSIGNMENT', skipReason: err.message, gross: 0, concession: 0, net: 0 };
      }
      return { outcome: 'FAILED', skipReason: (err as Error).message, gross: 0, concession: 0, net: 0 };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest bill-run.service.spec.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/finance/bill-run.service.ts apps/api/src/modules/finance/__tests__/bill-run.service.spec.ts
git commit -m "feat(api): BILL-4 Checkpoint A — BillRunService draft generation"
```

---

### Task 6: `BillRunController` + module wiring

**Files:**
- Create: `apps/api/src/modules/finance/bill-run.controller.ts`
- Modify: `apps/api/src/modules/finance/finance.module.ts`

**Interfaces:**
- Consumes: `BillRunService` (Task 5), `CreateBillRunDto`/`BillRunQueryDto`/`BillRunLineQueryDto` (Task 4), the existing `JwtAuthGuard`/`RolesGuard`/`Roles`/`CurrentUser`/`Role` decorators/guards (same imports as `bill-assignment.controller.ts`).
- Produces: `POST /finance/bill/runs`, `GET /finance/bill/runs`, `GET /finance/bill/runs/:id` — routed, guarded `ACCOUNTANT_AND_ABOVE`.

- [ ] **Step 1: Write the controller**

```ts
// apps/api/src/modules/finance/bill-run.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { BillRunService } from './bill-run.service';
import { CreateBillRunDto, BillRunQueryDto, BillRunLineQueryDto } from './dto/bill-run.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/**
 * BILL-4 Checkpoint A only: draft generation + read. No post/regenerate/
 * exclude/void endpoints yet (BILL-4-SPEC.md §7 Checkpoints B/C).
 */
@Controller('finance/bill/runs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillRunController {
  constructor(private readonly billRunService: BillRunService) {}

  @Post()
  @Roles(...ACCOUNTANT_AND_ABOVE)
  create(@Body() dto: CreateBillRunDto, @CurrentUser('userId') userId: string) {
    return this.billRunService.generateDraft(dto, userId);
  }

  @Get()
  @Roles(...ACCOUNTANT_AND_ABOVE)
  findAll(@Query() query: BillRunQueryDto) {
    return this.billRunService.findAll(query);
  }

  @Get(':id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query() lineQuery: BillRunLineQueryDto) {
    return this.billRunService.findOne(id, lineQuery);
  }
}
```

- [ ] **Step 2: Wire into `FinanceModule`**

In `apps/api/src/modules/finance/finance.module.ts`: add `import { BillRunController } from './bill-run.controller';` and `import { BillRunService } from './bill-run.service';`; add `BillRunController` to the `controllers` array; add `BillRunService` to the `providers` array. (No new export needed — nothing outside the finance module consumes `BillRunService` yet.)

- [ ] **Step 3: Typecheck + full unit suite**

Run: `cd apps/api && npx tsc --noEmit && npx jest`
Expected: `tsc` exits 0; full Jest suite passes with the new bill-run tests included in the total count.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/finance/bill-run.controller.ts apps/api/src/modules/finance/finance.module.ts
git commit -m "feat(api): BILL-4 Checkpoint A — BillRunController + module wiring"
```

---

### Task 7: Live proof + BILL-BUGS.md entries

**Files:**
- Modify: `BILL-BUGS.md` (append entries, newest-first per file convention)

**Interfaces:** none (proof + documentation task).

- [ ] **Step 1: Log design decisions in `BILL-BUGS.md`**

Append (above the existing top entry) a `BILL-4 Checkpoint A` section covering, each flagged "raised not decided" per this repo's convention:
- R8's tenant-configurable due-days setting doesn't exist as infrastructure anywhere in the codebase (checked: no `due_days` column on `tenants` or any settings table). Checkpoint A takes an explicit optional `dueDate` per run, defaulting to `issueDate + 15 days` (`DEFAULT_DUE_DAYS` in `bill-run.util.ts`) — flagged for Srijan to decide whether a real per-tenant setting should replace the constant before Checkpoint B/C.
- `academicYearId` is an explicit required field on `CreateBillRunDto` (not inferred from an `is_current` lookup) — matches `FeePreviewQueryDto`'s own explicit-param convention; the spec's terse endpoint bullet ("scope + bsYear + bsMonth") doesn't enumerate every DTO field, same as other phases' DTOs being richer than their one-line spec bullet.
- `idempotency_key` is a **partial** unique index (`WHERE deleted_at IS NULL`), not the spec DDL comment's bare `TEXT UNIQUE` — so voiding a DRAFT run frees the key for a fresh draft, matching §3's "Void a draft... nothing to unwind." A bare UNIQUE would permanently block re-drafting a voided period.
- `FAILED` is used for any non-`NotFoundException` error during **draft** resolution (not just posting) — the outcome enum's CHECK constraint allows it generically, and this codebase's established convention (bulk-assign, bulk-invoice) never aborts a whole batch over one student's error.
- Run-level totals (`bill_runs.total_*`) are computed with one SQL `SUM()` aggregate over `bill_run_lines`, not a `Money` accumulator in the per-student loop — per R1 ("aggregation happens in SQL"), since a whole-school run could be thousands of rows.

- [ ] **Step 2: Live proof — smallest real demo class**

Find the smallest class in `tenant_demo` with at least one enrolled ACTIVE student and a real academic year:

```sql
SELECT c.id, c.name, COUNT(s.id) AS student_count
FROM classes c LEFT JOIN students s ON s.class_id = c.id AND s.deleted_at IS NULL AND s.status='ACTIVE'
GROUP BY c.id, c.name HAVING COUNT(s.id) > 0 ORDER BY student_count ASC LIMIT 1;

SELECT id, name FROM academic_years WHERE is_current = true AND deleted_at IS NULL;
```

Log in as an existing demo accountant/owner account (temporary password shim + restore + 401-proof, per this codebase's established live-data discipline). Call:

```
POST /finance/bill/runs
{ "academicYearId": "<id>", "scope": "CLASS", "classId": "<smallest class id>", "bsYear": 2083, "bsMonth": 3 }
```

Then:

```sql
SELECT id, status, total_students, total_gross, total_net FROM bill_runs WHERE id = '<run id>';
SELECT student_id, outcome, gross, net FROM bill_run_lines WHERE bill_run_id = '<run id>';
SELECT COUNT(*) FROM bill_invoices;               -- must be unchanged (zero new rows)
SELECT COUNT(*) FROM student_ledger_entries;      -- must be unchanged (zero new rows)
```

Capture the raw terminal output of all of the above. Confirm: `bill_runs`/`bill_run_lines` rows exist and match the class roster; `bill_invoices` and `student_ledger_entries` counts are byte-identical to their pre-run counts.

- [ ] **Step 3: Raw build + test count**

```bash
cd apps/api
npx tsc --noEmit
npx jest 2>&1 | tail -20
```

Report the raw `Test Suites:`/`Tests:` summary line (expected: prior 665 + this task's new suites, e.g. `bill-run.util.spec.ts` ~8 tests + `bill-run.service.spec.ts` ~12 tests).

- [ ] **Step 4: Clean up + commit**

Delete the crafted `bill_runs`/`bill_run_lines` rows from the proof (or explicitly note if Srijan wants them kept as a documented live artifact, matching the BILL-3 precedent for non-reversible rows — these ARE deletable since no immutability trigger exists on these two tables yet). Restore any shimmed password with a 401 read-back.

```bash
git add BILL-BUGS.md
git commit -m "docs(api): BILL-4 Checkpoint A — deviations log + live proof notes"
```

Stop here. Do not implement Checkpoint B (posting).
