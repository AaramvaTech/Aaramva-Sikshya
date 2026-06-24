# Frontend Session 16 — HR, Library & Communication UI
# Aaramva Shikshya

## Prerequisites
- Sessions 11–15 complete
- Student, Attendance, Finance, Academic, Exam UIs all working
- CLAUDE.md updated with Radix Select fix, response extraction rules,
  academic year two-step creation, marks merge pattern

## Goal
Build three remaining school-level modules in one session:
- HR & Staff UI (staff list, profiles, leave, payroll slips)
- Library UI (catalogue, issue/return)
- Communication UI (notice board, SMS logs, notifications bell)

These are lighter than previous modules — less complex business logic,
familiar patterns from previous sessions.

---

## PART A — HR & Staff UI

### API functions — `lib/api/hr.api.ts`

```typescript
export const hrApi = {
  // Staff
  listStaff: (params?: { page?: number; limit?: number; search?: string; departmentId?: string }) =>
    api.get<ApiResponse<PaginatedResponse<StaffSummary>>>('/hr/staff', { params }),
  getStaff: (id: string) =>
    api.get<ApiResponse<StaffDetail>>(`/hr/staff/${id}`),
  createStaff: (data: CreateStaffData) =>
    api.post<ApiResponse<StaffDetail>>('/hr/staff', data),
  updateStaff: (id: string, data: Partial<CreateStaffData>) =>
    api.patch<ApiResponse<StaffDetail>>(`/hr/staff/${id}`, data),
  deleteStaff: (id: string) => api.delete(`/hr/staff/${id}`),

  // Departments
  listDepartments: () => api.get<ApiResponse<Department[]>>('/hr/departments'),
  createDepartment: (data: { name: string }) =>
    api.post<ApiResponse<Department>>('/hr/departments', data),

  // Designations
  listDesignations: () => api.get<ApiResponse<Designation[]>>('/hr/designations'),
  createDesignation: (data: { title: string; departmentId?: string }) =>
    api.post<ApiResponse<Designation>>('/hr/designations', data),

  // Leave types
  listLeaveTypes: () => api.get<ApiResponse<LeaveType[]>>('/hr/leave-types'),

  // Leave requests
  listLeave: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<ApiResponse<PaginatedResponse<LeaveRequest>>>('/hr/leave', { params }),
  applyLeave: (data: ApplyLeaveData) =>
    api.post<ApiResponse<LeaveRequest>>('/hr/leave', data),
  reviewLeave: (id: string, data: { status: 'APPROVED' | 'REJECTED'; reviewerNote?: string }) =>
    api.patch<ApiResponse<LeaveRequest>>(`/hr/leave/${id}/review`, data),
  getLeaveBalance: (userId: string) =>
    api.get<ApiResponse<LeaveBalance[]>>(`/hr/leave/balance/${userId}`),

  // Payroll
  listPayrollMonths: () =>
    api.get<ApiResponse<PayrollMonth[]>>('/hr/payroll/months'),
  getPayrollSlips: (monthId: string) =>
    api.get<ApiResponse<SalarySlip[]>>(`/hr/payroll/months/${monthId}/slips`),
  generatePayroll: (monthId: string, data?: { overrides?: PayrollOverride[] }) =>
    api.post<ApiResponse<{ generated: number }>>(`/hr/payroll/months/${monthId}/generate`, data ?? {}),
  finalizePayroll: (monthId: string) =>
    api.patch<ApiResponse<PayrollMonth>>(`/hr/payroll/months/${monthId}/finalize`),
  openPayrollMonth: (data: { monthBs: number; yearBs: number; academicYearId: string }) =>
    api.post<ApiResponse<PayrollMonth>>('/hr/payroll/months', data),
};
```

### Types for HR

```typescript
export interface StaffSummary {
  id: string;           // staff_profiles.id
  userId: string;
  employeeId: string;   // EMP-2081-0001
  fullName: string;
  email: string;
  role: string;
  departmentName: string | null;
  designationTitle: string | null;
  employmentType: string;
  joinDate: { ad: string; bs: string };
  isActive: boolean;
  photoUrl: string | null;
}

export interface StaffDetail extends StaffSummary {
  phone: string | null;
  dateOfBirth: { ad: string; bs: string } | null;
  gender: string | null;
  permanentAddress: string | null;
  baseSalary: number;
  panNumber: string | null;
  bankName: string | null;
  bankAccount: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface Department { id: string; name: string; }
export interface Designation { id: string; title: string; departmentId: string | null; }
export interface LeaveType { id: string; name: string; daysPerYear: number; isPaid: boolean; }

export interface LeaveRequest {
  id: string;
  userId: string;
  staffName: string;
  leaveTypeName: string;
  fromDate: { ad: string; bs: string };
  toDate: { ad: string; bs: string };
  totalDays: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  appliedAt: string;
  reviewerNote: string | null;
}

export interface LeaveBalance {
  leaveTypeId: string;
  leaveTypeName: string;
  entitlement: number;
  used: number;
  balance: number;
}

export interface PayrollMonth {
  id: string;
  monthBs: number;
  yearBs: number;
  status: 'DRAFT' | 'FINALIZED' | 'PAID';
  academicYearId: string;
  createdAt: string;
}

export interface SalarySlip {
  id: string;
  userId: string;
  staffName: string;
  employeeId: string;
  baseSalary: number;
  allowanceTotal: number;
  deductionTotal: number;
  leaveDeduction: number;
  grossSalary: number;
  netSalary: number;
  paymentDate: string | null;
  paymentMethod: string | null;
}

export interface CreateStaffData {
  email: string; password: string;
  firstName: string; lastName: string; role: string;
  departmentId?: string; designationId?: string;
  dateOfBirth?: string; gender?: string; phone?: string;
  joinDate: string; employmentType?: string;
  baseSalary: number; panNumber?: string;
  bankName?: string; bankAccount?: string;
  permanentAddress?: string;
  emergencyContactName?: string; emergencyContactPhone?: string;
}

export interface ApplyLeaveData {
  leaveTypeId: string; fromDate: string; toDate: string; reason?: string;
}

export interface PayrollOverride {
  userId: string; customBaseSalary?: number;
  additionalAllowances?: { name: string; amount: number }[];
  additionalDeductions?: { name: string; amount: number }[];
}
```

### HR Pages to build

**`app/(school)/hr/page.tsx` — HR Hub**
Three cards: Staff Directory, Leave Management, Payroll.
Quick stats: Total Staff, On Leave Today, This Month's Payroll status.

**`app/(school)/hr/staff/page.tsx` — Staff List**
```
<PageHeader title="Staff" action={<Button>+ Add Staff</Button>} />
[Search] [Department ▼] [Role ▼]

DataTable columns:
Photo | Employee ID | Name | Department | Designation | Role | Join Date | Status | Actions
```

Add Staff: full-page form or large dialog.
Fields: Personal info + HR info + salary info. Same Zod pattern as student form.

**`app/(school)/hr/staff/[id]/page.tsx` — Staff Profile**
Two tabs: Profile (personal + HR details) | Leave Balance (table of leave types + remaining days).

**`app/(school)/hr/leave/page.tsx` — Leave Management**
Two tabs:

Tab 1 — All Requests (PRINCIPAL+ sees all, TEACHER sees own):
```
[Status filter ▼]

Table: Staff Name | Leave Type | From | To | Days | Status | Actions
Actions: Approve / Reject (for PENDING, PRINCIPAL+ only)
```

Tab 2 — Apply for Leave (all staff):
```
Leave Type* | From Date* | To Date* | Reason
[Submit]
```

**`app/(school)/hr/payroll/page.tsx` — Payroll**
```
[Month/Year selector (BS)]  [Open Month] button

Payroll months list:
Shrawan 2081 | DRAFT  | [Generate] [View Slips] [Finalize]
Baisakh 2081 | FINALIZED | [View Slips]

--- After clicking View Slips ---
Sheet/drawer showing salary slips table:
Employee | Base | Allowances | Deductions | Leave Ded. | Net Salary
[Finalize Payroll] (ConfirmDialog, SCHOOL_OWNER only)
```

---

## PART B — Library UI

### API functions — `lib/api/library.api.ts`

```typescript
export const libraryApi = {
  // Books
  listBooks: (params?: { page?: number; limit?: number; search?: string; categoryId?: string }) =>
    api.get<ApiResponse<PaginatedResponse<BookSummary>>>('/library/books', { params }),
  getBook: (id: string) =>
    api.get<ApiResponse<BookDetail>>(`/library/books/${id}`),
  addBook: (data: AddBookData) =>
    api.post<ApiResponse<BookSummary>>('/library/books', data),
  addCopy: (bookId: string, data: AddCopyData) =>
    api.post<ApiResponse<BookCopy>>(`/library/books/${bookId}/copies`, data),

  // Members
  listMembers: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<ApiResponse<PaginatedResponse<LibraryMember>>>('/library/members', { params }),
  registerMember: (data: { type: 'STUDENT' | 'STAFF'; studentId?: string; userId?: string; maxBooks?: number }) =>
    api.post<ApiResponse<LibraryMember>>('/library/members', data),

  // Issues
  listIssues: (params?: { page?: number; limit?: number; status?: string; memberId?: string }) =>
    api.get<ApiResponse<PaginatedResponse<BookIssue>>>('/library/issues', { params }),
  getOverdue: () =>
    api.get<ApiResponse<BookIssue[]>>('/library/issues/overdue'),
  issueBook: (data: IssueBookData) =>
    api.post<ApiResponse<BookIssue>>('/library/issues', data),
  returnBook: (issueId: string, data?: { notes?: string }) =>
    api.patch<ApiResponse<BookIssue>>(`/library/issues/${issueId}/return`, data ?? {}),
  payFine: (issueId: string) =>
    api.patch<ApiResponse<BookIssue>>(`/library/issues/${issueId}/pay-fine`, {}),

  // Categories
  listCategories: () =>
    api.get<ApiResponse<BookCategory[]>>('/library/categories'),
  createCategory: (data: { name: string }) =>
    api.post<ApiResponse<BookCategory>>('/library/categories', data),
};
```

### Types for Library

```typescript
export interface BookCategory { id: string; name: string; }

export interface BookSummary {
  id: string; title: string; author: string | null;
  isbn: string | null; language: string;
  categoryName: string | null;
  totalCopies: number; availableCopies: number;
}

export interface BookCopy {
  id: string; bookId: string; copyNumber: string;
  accessionNumber: string | null; shelfLocation: string | null;
  condition: string; isAvailable: boolean;
}

export interface BookDetail extends BookSummary {
  publisher: string | null; edition: string | null; description: string | null;
  copies: (BookCopy & { currentIssue?: { memberId: string; memberNumber: string; dueDate: { ad: string; bs: string }; isOverdue: boolean } | null })[];
}

export interface LibraryMember {
  id: string; memberNumber: string;
  memberName: string; memberType: 'STUDENT' | 'STAFF';
  maxBooks: number; isActive: boolean;
  currentIssueCount: number;
}

export interface BookIssue {
  id: string; bookCopyId: string;
  bookTitle: string; copyNumber: string;
  memberId: string; memberNumber: string; memberName: string;
  issuedAt: { ad: string; bs: string };
  dueDate: { ad: string; bs: string };
  returnedAt: { ad: string; bs: string } | null;
  status: 'ISSUED' | 'RETURNED' | 'OVERDUE' | 'LOST';
  fineAmount: number; finePaid: boolean;
  overdueDays?: number;
}

export interface AddBookData {
  title: string; author?: string; publisher?: string;
  isbn?: string; categoryId?: string; edition?: string;
  language?: string; description?: string;
}

export interface AddCopyData {
  copyNumber: string; accessionNumber?: string;
  shelfLocation?: string; condition?: string;
}

export interface IssueBookData {
  bookCopyId: string; memberId: string;
  dueDate: string; finePerDay?: number; notes?: string;
}
```

### Library Pages to build

**`app/(school)/library/page.tsx` — Library Hub**
Four stat cards: Total Books, Available Copies, Active Issues, Overdue.
Below: Overdue issues table (if any).
Action buttons: Issue Book, Return Book, Add Book.

**`app/(school)/library/books/page.tsx` — Book Catalogue**
```
[Search by title/author/ISBN] [Category ▼] [+ Add Book]

DataTable: Title | Author | ISBN | Category | Copies | Available | Actions
Actions: View copies, Add copy

Click row → Book detail sheet:
  Full info + list of copies with availability status
  Overdue copies show who has them + due date
```

**`app/(school)/library/issues/page.tsx` — Issue & Return**
Two tabs:

Tab 1 — Active Issues:
```
[Member search] [Status ▼]
Table: Member | Book | Copy | Issued | Due | Fine | Status | [Return] [Mark Lost]
```

Tab 2 — Issue a Book:
```
Member search (search by name or member number)
Book/Copy search (show only available copies)
Due Date (BsDateInput)
[Issue Book]
```

Fine display: if overdue, show fine amount in red. [Pay Fine] button records payment.

---

## PART C — Communication UI

### API functions — `lib/api/communication.api.ts`

```typescript
export const communicationApi = {
  // Notices
  listNotices: (params?: { page?: number; limit?: number; type?: string; audience?: string }) =>
    api.get<ApiResponse<PaginatedResponse<Notice>>>('/communication/notices', { params }),
  createNotice: (data: CreateNoticeData) =>
    api.post<ApiResponse<Notice>>('/communication/notices', data),
  publishNotice: (id: string) =>
    api.patch<ApiResponse<Notice>>(`/communication/notices/${id}/publish`, {}),
  deleteNotice: (id: string) => api.delete(`/communication/notices/${id}`),

  // SMS
  sendSms: (data: { toNumber: string; message: string; studentId?: string }) =>
    api.post<ApiResponse<{ sent: boolean }>>('/communication/sms/send', data),
  getSmsLogs: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<ApiResponse<PaginatedResponse<SmsLog>>>('/communication/sms/logs', { params }),
  bulkSms: (data: { audience: string; classId?: string; sectionId?: string; message: string }) =>
    api.post<ApiResponse<{ sent: number; failed: number; skipped: number }>>('/communication/sms/bulk', data),

  // Notifications
  getMyNotifications: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Notification>>>('/communication/notifications', { params }),
  getUnreadCount: () =>
    api.get<ApiResponse<{ count: number }>>('/communication/notifications/unread-count'),
  markAsRead: (id: string) =>
    api.patch(`/communication/notifications/${id}/read`, {}),
  markAllAsRead: () =>
    api.patch('/communication/notifications/read-all', {}),
};
```

### Types for Communication

```typescript
export interface Notice {
  id: string; title: string; body: string;
  type: string; audience: string; classId: string | null;
  isPublished: boolean; publishedAt: string | null;
  expiresAt: string | null; createdBy: string;
  createdAt: string;
}

export interface SmsLog {
  id: string; toNumber: string; message: string;
  trigger: string; status: 'PENDING' | 'SENT' | 'FAILED' | 'MOCK';
  sentAt: string | null; errorMessage: string | null;
  studentName: string | null;
}

export interface AppNotification {
  id: string; title: string; body: string;
  type: string; isRead: boolean; readAt: string | null;
  data: Record<string, unknown> | null; createdAt: string;
}

export interface CreateNoticeData {
  title: string; body: string;
  type?: string; audience?: string;
  classId?: string; expiresAt?: string;
}
```

### Communication Pages to build

**`app/(school)/communication/notices/page.tsx` — Notice Board**
```
<PageHeader title="Notice Board" action={<Button>+ Create Notice</Button>} />

[Type ▼] [Audience ▼]

Cards grid (not table — notices feel better as cards):
┌─────────────────────────────────┐
│ 🔴 URGENT  • All Students       │
│ Exam Schedule Released          │
│ Please note the revised...      │
│ Published: 15 Baisakh 2081      │
│ [Publish] [Edit] [Delete]       │
└─────────────────────────────────┘

Unpublished notices shown with grey/draft styling.
[Publish] button triggers publishNotice() + invalidate.
Create notice: dialog with title, body (textarea), type, audience, expiry.
```

**`app/(school)/communication/sms/page.tsx` — SMS Center**
Two tabs:

Tab 1 — Send SMS:
```
Audience: [All Parents ▼] / [Class ▼] / [Custom Number]
Message: [textarea, 160 char limit with counter]
[Send to N recipients]
```

Tab 2 — SMS Logs:
```
[Status filter ▼]
Table: To Number | Message (truncated) | Trigger | Status | Sent At
StatusBadge: SENT=green, FAILED=red, MOCK=yellow, PENDING=grey
```

**Notification Bell — `components/layout/header.tsx` update**
Add notification bell icon to header:
```
🔔 (3)  ← unread count badge

Click → dropdown/popover:
  [Mark all read]
  ─────────────
  📋 Fee payment received for Ram...  2m ago
  ⚠️ Ram Sharma was absent today      1h ago
  📢 New notice: Exam schedule         3h ago
  ─────────────
  [View all notifications]
```

Poll for unread count every 60 seconds using `refetchInterval: 60000`.
On click of a notification: markAsRead → navigate based on type.

---

## TanStack Query hooks

```typescript
// lib/hooks/use-hr.ts
export function useStaffList(params) { ... }
export function useStaffDetail(id) { ... }
export function useLeaveRequests(params) { ... }
export function useReviewLeave() { ... }  // mutation
export function usePayrollMonths() { ... }
export function useGeneratePayroll() { ... }  // mutation

// lib/hooks/use-library.ts
export function useBooks(params) { ... }
export function useBookDetail(id) { ... }
export function useIssues(params) { ... }
export function useOverdueIssues() { ... }
export function useIssueBook() { ... }   // mutation
export function useReturnBook() { ... }  // mutation

// lib/hooks/use-communication.ts
export function useNotices(params) { ... }
export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => communicationApi.getUnreadCount().then(r => r.data.data.count),
    refetchInterval: 60 * 1000,   // poll every 60 seconds
  });
}
export function useMarkAllRead() { ... }  // mutation, invalidates unread-count
export function useSmsLogs(params) { ... }
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full — especially the Radix Select fix,
response extraction rules, and frontend rules.
Then read docs/api-contracts/16-hr-library-communication-ui.md.

Sessions 11–15 complete. All previous UIs working.
This session builds THREE modules: HR, Library, Communication.

Use established patterns from previous sessions:
- DataTable + TanStack Query for all lists
- forwardRef + useImperativeHandle for grids (not needed this session)
- Radix Select: computed <span> inside trigger for async data
- Response extraction: paginated → .data.data.data, simple → .data.data

Work in this order:

PART A — HR:
1. Add HR types to types/api.types.ts
2. Create lib/api/hr.api.ts
3. Create lib/hooks/use-hr.ts
4. Build app/(school)/hr/page.tsx — hub with 3 cards + quick stats
5. Build app/(school)/hr/staff/page.tsx — DataTable + Add Staff dialog
6. Build app/(school)/hr/staff/[id]/page.tsx — profile tabs
7. Build app/(school)/hr/leave/page.tsx — two tabs (list + apply)
8. Build app/(school)/hr/payroll/page.tsx — months list + slips sheet

PART B — Library:
9. Add Library types to types/api.types.ts
10. Create lib/api/library.api.ts
11. Create lib/hooks/use-library.ts
12. Build app/(school)/library/page.tsx — hub + overdue table
13. Build app/(school)/library/books/page.tsx — catalogue + book detail sheet
14. Build app/(school)/library/issues/page.tsx — two tabs (active + issue new)

PART C — Communication:
15. Add Communication types to types/api.types.ts
16. Create lib/api/communication.api.ts
17. Create lib/hooks/use-communication.ts
18. Build app/(school)/communication/notices/page.tsx — card grid + create dialog
19. Build app/(school)/communication/sms/page.tsx — send + logs tabs
20. Update components/layout/header.tsx — add notification bell with unread count,
    dropdown showing recent notifications, mark as read on click

Frontend rules (always):
- Never localStorage for tokens
- Always <BsDate> for dates, <AmountDisplay> for money
- Always TanStack Query — no useEffect + fetch
- Tailwind only — no inline styles
- shadcn/ui for all primitives
- Loading skeletons on async operations
- Error toasts on failures
- Computed <span> inside Radix SelectTrigger for async-loaded items
```

---

## Learning checkpoint for Session 16

After this session, you should be able to answer:
- Why does the notification bell use refetchInterval instead of a WebSocket?
- What is the UX difference between showing notices as cards vs a table?
- Why does the library issue flow need a member search AND a book search separately?
- What does "poll" mean in the context of unread notification count?
