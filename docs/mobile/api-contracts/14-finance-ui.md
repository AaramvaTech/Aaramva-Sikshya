# Frontend Session 14 — Finance UI
# Aaramva Shikshya

## Prerequisites
- Sessions 11–13 complete
- Student module UI working (list, profile, enrollment)
- Attendance UI working
- Shared components all exist

## Goal
Build the complete Finance module UI:
- Fee structure setup (define what a school charges per class)
- Invoice generation (per student or bulk per class)
- Payment recording (full or partial, with method)
- Fee collection report
- Defaulters list
- Student fee ledger

Finance is the second most-used module after attendance.
The accountant uses this daily. Design for clarity over cleverness.

---

## API functions

File: `lib/api/finance.api.ts`

```typescript
export const financeApi = {
  // Fee categories
  listCategories: () =>
    api.get<ApiResponse<FeeCategory[]>>('/finance/fee-categories'),
  createCategory: (data: CreateFeeCategoryData) =>
    api.post<ApiResponse<FeeCategory>>('/finance/fee-categories', data),

  // Fee structures
  listStructures: (params?: { academicYearId?: string }) =>
    api.get<ApiResponse<FeeStructureSummary[]>>('/finance/fee-structures', { params }),
  getStructure: (id: string) =>
    api.get<ApiResponse<FeeStructureDetail>>(`/finance/fee-structures/${id}`),
  createStructure: (data: CreateFeeStructureData) =>
    api.post<ApiResponse<FeeStructureDetail>>('/finance/fee-structures', data),

  // Student fee assignments (discounts/waivers)
  getStudentAssignments: (studentId: string) =>
    api.get<ApiResponse<FeeAssignment[]>>(`/finance/students/${studentId}/assignments`),
  setStudentAssignment: (studentId: string, data: SetAssignmentData) =>
    api.post<ApiResponse<FeeAssignment>>(`/finance/students/${studentId}/assignments`, data),

  // Invoices
  listInvoices: (params: InvoiceListParams) =>
    api.get<ApiResponse<PaginatedResponse<InvoiceSummary>>>('/finance/invoices', { params }),
  getInvoice: (id: string) =>
    api.get<ApiResponse<InvoiceDetail>>(`/finance/invoices/${id}`),
  generateInvoice: (data: GenerateInvoiceData) =>
    api.post<ApiResponse<InvoiceDetail>>('/finance/invoices/generate', data),
  generateBulkInvoices: (data: GenerateBulkInvoiceData) =>
    api.post<ApiResponse<{ generated: number; skipped: number; errors: string[] }>>(
      '/finance/invoices/generate-bulk', data
    ),
  voidInvoice: (id: string) =>
    api.delete(`/finance/invoices/${id}`),

  // Payments
  recordPayment: (data: RecordPaymentData) =>
    api.post<ApiResponse<Payment>>('/finance/payments', data),
  cancelPayment: (id: string) =>
    api.delete(`/finance/payments/${id}`),

  // Reports
  getCollectionReport: (params: { academicYearId: string }) =>
    api.get<ApiResponse<CollectionReport>>('/finance/reports/collection', { params }),
  getDefaulters: (params: { academicYearId?: string }) =>
    api.get<ApiResponse<DefaulterStudent[]>>('/finance/reports/defaulters', { params }),
  getStudentLedger: (studentId: string, params: { academicYearId: string }) =>
    api.get<ApiResponse<StudentLedger>>(`/finance/reports/student/${studentId}`, { params }),
};
```

---

## Types to add to api.types.ts

```typescript
export interface FeeCategory {
  id: string;
  name: string;
  type: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'EXAM';
  description: string | null;
  isActive: boolean;
}

export interface FeeStructureItem {
  id: string;
  feeCategoryId: string;
  feeCategoryName: string;
  amount: number;
  dueDate: { ad: string; bs: string } | null;
  dueDayOfMonth: number | null;
  finePerDay: number;
  gracePeriodDays: number;
}

export interface FeeStructureSummary {
  id: string;
  classId: string;
  className: string;
  academicYearId: string;
  academicYearName: string;
  itemCount: number;
  totalAmount: number;
}

export interface FeeStructureDetail extends FeeStructureSummary {
  items: FeeStructureItem[];
}

export interface FeeAssignment {
  id: string;
  feeStructureItemId: string;
  feeCategoryName: string;
  originalAmount: number;
  customAmount: number | null;
  discountPercent: number;
  discountReason: string | null;
  isWaived: boolean;
  effectiveAmount: number;   // computed: what student actually pays
}

export interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  dueDate: { ad: string; bs: string };
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED';
  totalAmount: number;
  paidAmount: number;
  balance: number;
}

export interface InvoiceItem {
  id: string;
  feeCategoryName: string;
  originalAmount: number;
  discountPercent: number;
  discountedAmount: number;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  receivedBy: string;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  subtotal: number;
  discountAmount: number;
  fineAmount: number;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface CollectionReport {
  fiscalYear: string;
  academicYearId: string;
  asOf: { ad: string; bs: string };
  totalInvoiced: number;
  totalCollected: number;
  totalPending: number;
  collectionRate: number;
  byClass: { classId: string; className: string; invoiced: number; collected: number; pending: number; rate: number }[];
  byCategory: { categoryId: string; categoryName: string; invoiced: number; collected: number; pending: number }[];
}

export interface DefaulterStudent {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  className: string;
  sectionName: string;
  overdueInvoices: number;
  totalDue: number;
  oldestDueDate: { ad: string; bs: string };
  guardianPhone: string;
}

export interface StudentLedger {
  student: { id: string; admissionNumber: string; fullName: string; className: string };
  academicYear: { id: string; name: string };
  invoices: InvoiceDetail[];
  summary: { totalInvoiced: number; totalPaid: number; totalBalance: number };
}

// DTOs
export interface CreateFeeCategoryData {
  name: string;
  type: FeeCategory['type'];
  description?: string;
}

export interface CreateFeeStructureData {
  classId: string;
  academicYearId: string;
  items: {
    feeCategoryId: string;
    amount: number;
    dueDate?: string;
    dueDayOfMonth?: number;
    finePerDay?: number;
    gracePeriodDays?: number;
  }[];
}

export interface GenerateInvoiceData {
  studentId: string;
  academicYearId: string;
  feeStructureItemIds?: string[];
  dueDate?: string;
}

export interface GenerateBulkInvoiceData {
  classId: string;
  academicYearId: string;
  feeStructureItemIds?: string[];
  dueDate: string;
}

export interface RecordPaymentData {
  invoiceId: string;
  amount: number;
  method: 'CASH' | 'ESEWA' | 'KHALTI' | 'BANK_TRANSFER' | 'CHEQUE';
  reference?: string;
  notes?: string;
}

export interface InvoiceListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  classId?: string;
  academicYearId?: string;
}

export interface SetAssignmentData {
  feeStructureItemId: string;
  academicYearId: string;
  customAmount?: number;
  discountPercent?: number;
  discountReason?: string;
  isWaived?: boolean;
}
```

---

## Pages to build

### 1. Finance Hub — `app/(school)/finance/page.tsx`

Four summary cards at top (from collection report):
```
Rs. 4,82,000    Rs. 3,61,500    Rs. 1,20,500    73.5%
Total Invoiced  Collected       Pending         Collection Rate
```

Below the cards, two sections side by side:
- Left: Recent Payments (last 5) — amount, student, method, date
- Right: Top Defaulters (5 worst) — name, class, amount due

Two action buttons in header:
- "Fee Structures" → navigates to /finance/fee-structures
- "Generate Invoices" → opens a dialog

---

### 2. Invoices Page — `app/(school)/finance/invoices/page.tsx`

```
<PageHeader title="Invoices" action={<Button>Generate Invoice</Button>} />

[Search by name/number]  [Status ▼]  [Class ▼]  [Academic Year ▼]

<DataTable columns={invoiceColumns} ... />
```

Invoice table columns:
```
Invoice No.  |  Student  |  Class  |  Due Date  |  Amount  |  Paid  |  Balance  |  Status  |  Actions
```

Actions per row:
- View → opens invoice detail sheet/modal
- Record Payment → opens payment form
- Void → ConfirmDialog

Status column uses `<StatusBadge>` with finance-specific colors.

---

### 3. Invoice Detail — `components/finance/invoice-detail-sheet.tsx`

A shadcn Sheet (slide-in panel from the right) showing full invoice:

```
Invoice #INV-2081-000042          Status: PARTIAL
Student: Ram Sharma (2081-0001)   Due: 15 Baisakh 2081
Class: Grade 10 — Section A

Fee Breakdown:
  Tuition Fee          Rs. 2,000
  Exam Fee             Rs. 1,500
  Discount (10%)      -Rs.   350
  ─────────────────────────────
  Total                Rs. 3,150

Payments Received:
  PAY-2081-000055  Cash  Rs. 2,000  Received by: Admin  15 Baisakh
  [+ Record Payment]

Balance Due: Rs. 1,150

[Void Invoice]  (SCHOOL_OWNER only, with confirmation)
```

---

### 4. Record Payment Form — `components/finance/payment-form.tsx`

Modal/dialog that opens from invoice detail or invoice row action:

```typescript
interface PaymentFormProps {
  invoice: InvoiceSummary;
  onSuccess: () => void;
}
```

Fields:
```
Amount*          [Rs. ___________]   Max: balance amount
                 Quick fill: [Full Amount Rs.3,150]
Method*          [CASH ▼]            CASH | ESEWA | KHALTI | BANK_TRANSFER | CHEQUE
Reference No.    [___________]       (required for non-CASH)
Notes            [___________]       optional
```

Zod schema:
```typescript
const paymentSchema = z.object({
  amount: z.number().positive().max(invoice.balance, 'Amount exceeds balance'),
  method: z.enum(['CASH', 'ESEWA', 'KHALTI', 'BANK_TRANSFER', 'CHEQUE']),
  reference: z.string().optional(),
  notes: z.string().optional(),
}).refine(data =>
  data.method === 'CASH' || !!data.reference,
  { message: 'Reference required for non-cash payments', path: ['reference'] }
);
```

On submit: `financeApi.recordPayment()` → toast → invalidate invoice queries.

---

### 5. Fee Structures Page — `app/(school)/finance/fee-structures/page.tsx`

```
<PageHeader title="Fee Structures" action={<Button>+ Create Structure</Button>} />

[Academic Year ▼]

Cards grid (one card per class):
┌─────────────────────────┐
│ Grade 10                │
│ 4 fee items             │
│ Total: Rs. 25,500/year  │
│                         │
│ [View]  [Edit]          │
└─────────────────────────┘
```

"Create Structure" opens a multi-step form:
1. Select Class + Academic Year
2. Add fee items (dynamic rows: Category | Amount | Due Date/Day | Fine/Day)
3. Review + Save

---

### 6. Reports Page — `app/(school)/finance/reports/page.tsx`

Three tabs:

**Tab 1 — Collection Report**
```
[Academic Year ▼]  [Generate]

Summary cards: Total Invoiced | Collected | Pending | Rate%

By Class table:
Class  |  Invoiced  |  Collected  |  Pending  |  Rate  |  [bar chart]

By Category table:
Category  |  Invoiced  |  Collected  |  Pending
```

**Tab 2 — Defaulters**
```
[Academic Year ▼]  [Refresh]

Table:
Name  |  Admission  |  Class  |  Overdue Invoices  |  Total Due  |  Oldest Due  |  Guardian Phone
```

Export button (placeholder — just log to console for now).

**Tab 3 — Student Ledger**
```
[Search student by name or admission number]

After selecting student + academic year:

Student: Ram Sharma | Class: Grade 10
Summary: Invoiced Rs.25,500 | Paid Rs.20,000 | Balance Rs.5,500

Invoice history (expandable rows):
▼ INV-2081-000042  Due: 15 Baisakh  PARTIAL  Rs.3,150
    Items: Tuition Rs.2,000 | Exam Rs.1,500 | Discount -Rs.350
    Payments: PAY-2081-000055 Cash Rs.2,000

▼ INV-2081-000041  Due: 1 Baisakh  PAID  Rs.5,000
    ...
```

---

## Key components to build

### `components/finance/amount-display.tsx`
Consistent Rupee formatting throughout finance module:
```typescript
// Rs. 2,50,000 (Nepal comma format: 2,50,000 not 250,000)
function formatNPR(amount: number): string {
  return 'Rs. ' + amount.toLocaleString('en-NP');
}

export function AmountDisplay({ amount, className }: { amount: number; className?: string }) {
  return <span className={cn('font-mono', className)}>{formatNPR(amount)}</span>;
}
```

### `components/finance/invoice-status-badge.tsx`
Extended StatusBadge with finance-specific colors:
- PAID → green
- PARTIAL → yellow
- UNPAID → orange
- OVERDUE → red (bold)
- WAIVED → grey

### `components/finance/fee-structure-form.tsx`
Dynamic form with add/remove rows for fee items.
Each row: Category (select) | Amount (number) | Due Date or Day | Fine/Day

---

## TanStack Query hooks

```typescript
// lib/hooks/use-finance.ts

export function useInvoices(params: InvoiceListParams) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => financeApi.listInvoices(params).then(r => r.data.data),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => financeApi.getInvoice(id).then(r => r.data.data),
    enabled: !!id,
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: financeApi.recordPayment,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'collection-report'] });
    },
  });
}

export function useCollectionReport(academicYearId: string) {
  return useQuery({
    queryKey: ['finance', 'collection-report', academicYearId],
    queryFn: () => financeApi.getCollectionReport({ academicYearId }).then(r => r.data.data),
    enabled: !!academicYearId,
  });
}

export function useDefaulters(academicYearId: string) {
  return useQuery({
    queryKey: ['finance', 'defaulters', academicYearId],
    queryFn: () => financeApi.getDefaulters({ academicYearId }).then(r => r.data.data),
    enabled: !!academicYearId,
  });
}

export function useStudentLedger(studentId: string, academicYearId: string) {
  return useQuery({
    queryKey: ['finance', 'ledger', studentId, academicYearId],
    queryFn: () => financeApi.getStudentLedger(studentId, { academicYearId }).then(r => r.data.data),
    enabled: !!studentId && !!academicYearId,
  });
}
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full.
Then read docs/api-contracts/14-finance-ui.md in full.

Sessions 11–13 complete. Student and Attendance UIs working.
Existing components: DataTable, BsDate, StatusBadge, PageHeader,
EmptyState, ConfirmDialog, BsDateInput.

Session 14 task: Build the complete Finance module UI.

Work in this exact order:

1. Add all finance types to types/api.types.ts.

2. Create lib/api/finance.api.ts with all API functions.

3. Create lib/hooks/use-finance.ts with all TanStack Query hooks.

4. Build shared finance components:
   - components/finance/amount-display.tsx (Nepal NPR formatting)
   - components/finance/invoice-status-badge.tsx

5. Build components/finance/payment-form.tsx:
   - shadcn Dialog wrapper
   - Zod schema with cross-field validation (reference required for non-CASH)
   - "Quick fill full amount" button
   - useRecordPayment mutation

6. Build components/finance/invoice-detail-sheet.tsx:
   - shadcn Sheet (slide from right)
   - Full invoice breakdown: items, discounts, payments
   - Embedded payment form trigger
   - Void invoice action (ConfirmDialog)

7. Build the Finance Hub (app/(school)/finance/page.tsx):
   - 4 summary cards from collection report
   - Recent payments list (last 5)
   - Top defaulters list (first 5 from defaulters list)

8. Build Invoices page (app/(school)/finance/invoices/page.tsx):
   - Filterable DataTable
   - Invoice detail sheet on row click / View action
   - Record payment from action menu
   - Void with ConfirmDialog

9. Build Fee Structures page (app/(school)/finance/fee-structures/page.tsx):
   - Class cards with totals
   - components/finance/fee-structure-form.tsx (dynamic items)
   - Create new structure dialog

10. Build Reports page (app/(school)/finance/reports/page.tsx):
    - 3 tabs: Collection Report, Defaulters, Student Ledger
    - Collection: summary cards + byClass table + byCategory table
    - Defaulters: table with guardian phone
    - Ledger: student search → expandable invoice rows

Frontend rules (always):
- Never localStorage for tokens
- Always <BsDate> for dates, <AmountDisplay> for money
- Always TanStack Query
- Tailwind only
- shadcn/ui for primitives
- Loading skeletons on all async
- Error toasts on failures
- Invalidate related queries after mutations
```

---

## Learning checkpoint for Session 14

After this session, you should be able to answer:
- What is a shadcn Sheet and when do you use it instead of a Dialog?
- Why does Nepal use different comma formatting (2,50,000 not 250,000)?
- What does cross-field validation in Zod mean?
- Why do we invalidate multiple query keys after recording a payment?
