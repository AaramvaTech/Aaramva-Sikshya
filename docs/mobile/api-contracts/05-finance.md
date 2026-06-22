# Finance Module — Claude Code Session 5 Spec
# Aaramva Shikshya

## Prerequisites
- Sessions 0–4 complete, 61 tests passing
- students, classes, sections, academic_years all exist
- EventEmitterModule registered in AppModule

## Goal
Build the Finance module:
- Fee structures (define what fees a school charges, per class)
- Fee assignments (assign fee structure to individual students)
- Invoices (generate a bill for a student)
- Payments (record full or partial payment against an invoice)
- Discount & scholarship support
- Overdue detection + fine calculation
- Nepal fiscal year awareness (Shrawan–Ashadh)

This is the most complex module. Read the full spec before starting.

---

## Core concept — how school fees work in Nepal

A school defines a FEE STRUCTURE for each academic year:
  "Grade 10 students pay: Admission Rs.5000 + Tuition Rs.2000/month + Exam Rs.1500"

Each fee has a TYPE:
  - ONE_TIME  — paid once (admission, re-admission)
  - MONTHLY   — due every month of the academic year
  - QUARTERLY — due 4 times a year
  - ANNUALLY  — due once per year (but different from one-time)
  - EXAM      — due at exam time (2–3 times a year)

When a student is enrolled, an INVOICE is generated for each due date.
Payments are recorded against invoices.

---

## Database — add to tenant-schema.sql

```sql
-- ─── FEE CATEGORIES ───────────────────────────────────────────────────────────
-- Named fee types: "Tuition Fee", "Admission Fee", "Exam Fee", etc.
CREATE TABLE IF NOT EXISTS fee_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(20)  NOT NULL,   -- ONE_TIME | MONTHLY | QUARTERLY | ANNUALLY | EXAM
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─── FEE STRUCTURES ───────────────────────────────────────────────────────────
-- A fee structure = one class + one academic year + a list of fee items
CREATE TABLE IF NOT EXISTS fee_structures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id         UUID NOT NULL REFERENCES classes(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (class_id, academic_year_id)    -- one structure per class per year
);

-- Individual fee line items within a structure
CREATE TABLE IF NOT EXISTS fee_structure_items (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id   UUID    NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  fee_category_id    UUID    NOT NULL REFERENCES fee_categories(id),
  amount             NUMERIC(10,2) NOT NULL,
  due_day_of_month   SMALLINT,     -- for MONTHLY fees: day of month it's due (e.g. 7)
  due_date           DATE,         -- for ONE_TIME/EXAM/ANNUALLY: specific due date (AD)
  fine_per_day       NUMERIC(8,2)  NOT NULL DEFAULT 0,  -- late fine per day
  grace_period_days  SMALLINT      NOT NULL DEFAULT 0,  -- days after due before fine starts
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── STUDENT FEE ASSIGNMENTS ──────────────────────────────────────────────────
-- Overrides: a student can have a different amount (scholarship, discount)
CREATE TABLE IF NOT EXISTS student_fee_assignments (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID    NOT NULL REFERENCES students(id),
  fee_structure_item_id UUID   NOT NULL REFERENCES fee_structure_items(id),
  academic_year_id     UUID    NOT NULL REFERENCES academic_years(id),
  custom_amount        NUMERIC(10,2),   -- NULL = use structure amount
  discount_percent     NUMERIC(5,2)     NOT NULL DEFAULT 0,
  discount_reason      TEXT,
  is_waived            BOOLEAN NOT NULL DEFAULT false,  -- full waiver
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, fee_structure_item_id, academic_year_id)
);

-- ─── INVOICES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   VARCHAR(30) NOT NULL UNIQUE,  -- "INV-2081-000042"
  student_id       UUID        NOT NULL REFERENCES students(id),
  academic_year_id UUID        NOT NULL REFERENCES academic_years(id),
  due_date         DATE        NOT NULL,          -- AD
  status           VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
                               -- UNPAID | PARTIAL | PAID | OVERDUE | WAIVED
  subtotal         NUMERIC(10,2) NOT NULL,        -- sum of line items before discount
  discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  fine_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(10,2) NOT NULL,        -- subtotal - discount + fine
  paid_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance          NUMERIC(10,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  created_by       UUID        NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON invoices(status, due_date);

-- Invoice line items (one per fee category)
CREATE TABLE IF NOT EXISTS invoice_items (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID    NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  fee_category_id       UUID    NOT NULL REFERENCES fee_categories(id),
  fee_category_name     VARCHAR(100) NOT NULL,   -- snapshot: name at time of invoice
  original_amount       NUMERIC(10,2) NOT NULL,
  discount_percent      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  discounted_amount     NUMERIC(10,2) NOT NULL,  -- original - discount
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── PAYMENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number VARCHAR(30) NOT NULL UNIQUE,    -- "PAY-2081-000088"
  invoice_id     UUID        NOT NULL REFERENCES invoices(id),
  student_id     UUID        NOT NULL REFERENCES students(id),
  amount         NUMERIC(10,2) NOT NULL,
  method         VARCHAR(30) NOT NULL,           -- CASH | ESEWA | KHALTI | BANK_TRANSFER | CHEQUE
  reference      VARCHAR(100),                  -- transaction ref for digital payments
  notes          TEXT,
  received_by    UUID        NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ                    -- soft-cancel a payment (rare but needed)
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
```

---

## API Endpoints

### Fee Categories

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /finance/fee-categories | SCHOOL_OWNER, ACCOUNTANT | Create fee category |
| GET | /finance/fee-categories | ACCOUNTANT+ | List all |
| PATCH | /finance/fee-categories/:id | ACCOUNTANT+ | Update |
| DELETE | /finance/fee-categories/:id | SCHOOL_OWNER | Soft delete |

### Fee Structures

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /finance/fee-structures | SCHOOL_OWNER, ACCOUNTANT | Create structure for a class+year |
| GET | /finance/fee-structures | ACCOUNTANT+ | List structures |
| GET | /finance/fee-structures/:id | ACCOUNTANT+ | Detail with items |
| PATCH | /finance/fee-structures/:id/items | ACCOUNTANT+ | Add/update items |
| DELETE | /finance/fee-structures/:id | SCHOOL_OWNER | Soft delete |

### Student Fee Assignments

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /finance/students/:studentId/assignments | ACCOUNTANT+ | Set discount/waiver for a student |
| GET | /finance/students/:studentId/assignments | ACCOUNTANT+ | Get student's fee overrides |

### Invoices

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /finance/invoices/generate | ACCOUNTANT+ | Generate invoice(s) for student |
| POST | /finance/invoices/generate-bulk | ACCOUNTANT+ | Generate for all students in a class |
| GET | /finance/invoices | ACCOUNTANT+ | List invoices (filterable) |
| GET | /finance/invoices/:id | ACCOUNTANT+ | Invoice detail with items + payments |
| PATCH | /finance/invoices/:id/recalculate-fine | ACCOUNTANT+ | Recalculate overdue fine |
| DELETE | /finance/invoices/:id | SCHOOL_OWNER | Soft delete (void invoice) |

### Payments

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /finance/payments | ACCOUNTANT+ | Record a payment |
| GET | /finance/payments | ACCOUNTANT+ | List payments (filterable) |
| GET | /finance/payments/:id | ACCOUNTANT+ | Payment detail |
| DELETE | /finance/payments/:id | SCHOOL_OWNER | Soft-cancel a payment |

### Reports

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | /finance/reports/collection | PRINCIPAL+ | Fee collection summary (by class, by category) |
| GET | /finance/reports/defaulters | PRINCIPAL+ | Students with overdue invoices |
| GET | /finance/reports/student/:studentId | ACCOUNTANT+ | Full ledger for one student |

---

## Key DTOs

```typescript
// CreateFeeStructureDto
{
  classId: string;
  academicYearId: string;
  items: {
    feeCategoryId: string;
    amount: number;
    dueDate?: string;           // AD date — for ONE_TIME / ANNUALLY / EXAM
    dueDayOfMonth?: number;     // 1–28 — for MONTHLY fees
    finePerDay?: number;
    gracePeriodDays?: number;
  }[];
}

// SetStudentFeeAssignmentDto
{
  feeStructureItemId: string;
  academicYearId: string;
  customAmount?: number;
  discountPercent?: number;     // 0–100
  discountReason?: string;
  isWaived?: boolean;
}

// GenerateInvoiceDto
{
  studentId: string;
  academicYearId: string;
  // Which fee items to include — if omitted, generates for ALL due items
  feeStructureItemIds?: string[];
  dueDate?: string;             // override due date
}

// GenerateBulkInvoiceDto
{
  classId: string;
  academicYearId: string;
  feeStructureItemIds?: string[];
  dueDate: string;
}

// RecordPaymentDto
{
  invoiceId: string;
  amount: number;               // can be partial
  method: 'CASH' | 'ESEWA' | 'KHALTI' | 'BANK_TRANSFER' | 'CHEQUE';
  reference?: string;
  notes?: string;
}
```

---

## Business logic rules — read all of these

### 1. Invoice number format
Sequential per school: `INV-{BS_YEAR}-{6-digit-sequence}`
Example: `INV-2081-000042`
Use a transaction to get + increment sequence safely (no duplicates).

### 2. Payment number format
Same pattern: `PAY-2081-000088`

### 3. Invoice generation — amount calculation
```
For each fee_structure_item the student is being invoiced for:
  1. Get base amount from fee_structure_item.amount
  2. Check student_fee_assignments for this item:
     - If is_waived = true → amount = 0, skip this item (or include as Rs.0)
     - If custom_amount IS NOT NULL → use custom_amount as base
     - Apply discount_percent: discounted = base * (1 - discount/100)
  3. Sum all discounted_amounts = subtotal
  4. discount_amount = sum of (base - discounted) for all items
  5. fine_amount = 0 at generation time (calculated separately)
  6. total_amount = subtotal - discount_amount + fine_amount
```

### 4. Fine calculation (recalculate-fine endpoint)
```
For each overdue invoice:
  days_overdue = MAX(0, today - due_date - grace_period_days)
  fine = days_overdue * fine_per_day (from fee_structure_item)
  UPDATE invoices SET fine_amount = fine, total_amount = subtotal - discount + fine
```
Run this nightly via BullMQ job. Also expose as manual endpoint.

### 5. Payment recording — update invoice status
After recording a payment, recalculate invoice:
```
paid_amount = SUM of all non-cancelled payments for this invoice
if paid_amount >= total_amount → status = 'PAID'
else if paid_amount > 0       → status = 'PARTIAL'
else if due_date < today      → status = 'OVERDUE'
else                          → status = 'UNPAID'
```
Run in a transaction: insert payment + update invoice status atomically.

### 6. Bulk invoice generation
For each student enrolled in the class for the academic year:
  - Skip students who already have an invoice for the same items + due_date
  - Generate invoice using the same logic as single generation
  - Return summary: `{ generated: N, skipped: N, errors: [] }`

### 7. Soft-cancel payment
When a payment is soft-deleted:
  - Set payments.deleted_at = NOW()
  - Recalculate invoice paid_amount and status (same logic as step 5)
  - Must be SCHOOL_OWNER only — this is an audit-sensitive operation

### 8. Emit finance events (for future notification module)
After successful payment: `this.eventEmitter.emit('payment.received', { studentId, amount, invoiceId, tenantSlug })`
After invoice goes overdue: `this.eventEmitter.emit('invoice.overdue', { studentId, invoiceId, balance, tenantSlug })`

### 9. Nepal fiscal year
Fiscal year runs Shrawan (month 4 in BS) to Ashadh (month 3 next BS year).
Use `getCurrentFiscalYear()` from bs-calendar for report headers.
Fee collection reports should group by fiscal year, not calendar year.

---

## Report response shapes

```typescript
// GET /finance/reports/collection
{
  fiscalYear: string,            // "2081/82"
  academicYearId: string,
  asOf: { ad, bs },
  totalInvoiced: number,
  totalCollected: number,
  totalPending: number,
  collectionRate: number,        // percent
  byClass: {
    classId, className,
    invoiced, collected, pending, rate
  }[],
  byCategory: {
    categoryId, categoryName,
    invoiced, collected, pending
  }[]
}

// GET /finance/reports/defaulters
{
  asOf: { ad, bs },
  totalDefaulters: number,
  totalOutstanding: number,
  students: {
    studentId, admissionNumber, fullName, className, sectionName,
    overdueInvoices: number,
    totalDue: number,
    oldestDueDate: { ad, bs },
    guardianPhone: string
  }[]
}

// GET /finance/reports/student/:studentId  (ledger)
{
  student: { id, admissionNumber, fullName, className },
  academicYear: { id, name },
  invoices: {
    id, invoiceNumber, dueDate: { ad, bs }, status,
    subtotal, discountAmount, fineAmount, totalAmount, paidAmount, balance,
    items: { categoryName, originalAmount, discountPercent, discountedAmount }[],
    payments: { paymentNumber, amount, method, reference, createdAt }[]
  }[],
  summary: { totalInvoiced, totalPaid, totalBalance }
}
```

---

## BullMQ job — daily fine recalculation

```typescript
// apps/api/src/jobs/recalculate-fines.job.ts
// Runs at 00:05 Nepal time (UTC+5:45) = 18:20 UTC previous day
// Cron: '20 18 * * *'
// For every tenant with active subscription:
//   Get all UNPAID + PARTIAL invoices past due date
//   Recalculate fine_amount
//   If status was UNPAID and now overdue → set OVERDUE + emit invoice.overdue event
```

Register this job in a `JobsModule` with BullMQ.
For now the job can just process one tenant — multi-tenant job processing
will be refined in the DevOps session.

---

## Tests to write

```typescript
// FeeStructureService
- createFeeStructure creates structure with items
- createFeeStructure throws ConflictException if structure already exists for class+year

// InvoiceService
- generateInvoice calculates discounted amounts correctly (e.g. 20% discount on Rs.2000 = Rs.400 off)
- generateInvoice applies is_waived correctly (item excluded from total)
- generateInvoice uses custom_amount when set in student_fee_assignment
- generateInvoice creates unique invoice number (INV-2081-XXXXXX)
- generateBulkInvoice skips students who already have invoice for same items+date
- recalculateFine sets fine_amount = days_overdue * fine_per_day

// PaymentService
- recordPayment sets invoice status to PAID when fully paid
- recordPayment sets invoice status to PARTIAL when partially paid
- recordPayment runs in a transaction (payment insert + invoice update atomic)
- cancelPayment soft-deletes payment and recalculates invoice status
- cancelPayment throws if not SCHOOL_OWNER (guard-level, skip if testing guards separately)

// ReportService
- getDefaulters returns only students with OVERDUE invoices
- getStudentLedger returns invoices with nested items and payments
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full. Confirm you have read it.
Then read docs/api-contracts/05-finance.md in full.

Sessions 0–4 complete. 61 tests passing.
EventEmitterModule is already registered in AppModule.
BullMQ is already installed from Session 1.

Session 5 task: Build the Finance module. This is the most complex
module — read the entire spec before writing a single line of code.

Work in this order:

1. Add all finance tables to tenant-schema.sql with IF NOT EXISTS:
   fee_categories, fee_structures, fee_structure_items,
   student_fee_assignments, invoices, invoice_items, payments

2. Build FeeCategoryModule — simple CRUD, soft delete.

3. Build FeeStructureModule:
   - createFeeStructure with items (single transaction)
   - getFeeStructure with nested items
   - Throws ConflictException if structure already exists for class+year

4. Build InvoiceService:
   - generateInvoice() — full amount calculation logic from spec
     (custom_amount → discount_percent → is_waived)
   - generateBulkInvoice() — loop per enrolled student, skip existing
   - Invoice number format: INV-{BS_YEAR}-{6-digit padded sequence}
     Use a transaction to get and increment sequence safely.
   - recalculateFine() — days_overdue × fine_per_day

5. Build PaymentService:
   - recordPayment() — insert payment + update invoice status in ONE transaction
   - Invoice status logic: PAID / PARTIAL / OVERDUE / UNPAID
   - cancelPayment() — soft delete + recalculate invoice status
   - Emit payment.received and invoice.overdue events

6. Build ReportService:
   - getCollectionReport() — grouped by class and category
   - getDefaulters() — OVERDUE invoices with guardian phone
   - getStudentLedger() — full invoice + payment history

7. Build FinanceController — all endpoints with correct @Roles() guards.

8. Create JobsModule with BullMQ — daily fine recalculation job
   (cron: '20 18 * * *'). Job loops over all invoices past due date
   and calls recalculateFine().

9. Write all tests from spec.
   Run full suite — target: 61 existing + ~14 new = 75+ passing.

CRITICAL rules:
- All money stored as NUMERIC(10,2) — never use JavaScript float for money
- Invoice and payment number sequences must use DB transactions to avoid duplicates
- Payment recording must be atomic (payment row + invoice status update)
- TenantPrismaService for ALL queries — never plain PrismaService
- Dates: store AD, return { ad, bs }
- Soft deletes only
- Standard response format via global interceptor
- Every controller method needs @Roles() guard
```

---

## Learning checkpoint for Session 5

After this session, you should be able to answer:
- Why do we store money as NUMERIC and not as a JavaScript number?
- What is a "generated column" (balance in invoices table)?
- Why does payment recording need to be atomic?
- What is a BullMQ job and why run fine calculation on a schedule?
- What does "ledger" mean in accounting terms?
