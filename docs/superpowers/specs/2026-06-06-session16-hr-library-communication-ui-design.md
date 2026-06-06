# Session 16 — HR, Library & Communication UI Design
Date: 2026-06-06

## Overview
Build three remaining school-level frontend modules: HR & Staff, Library, and Communication. All use established patterns from Sessions 11–15 (DataTable + TanStack Query, Radix Select fix, response extraction rules, shadcn/ui primitives, `#1A5C38` primary color, BS dates everywhere).

---

## File structure (20 new/modified files)

```
types/api.types.ts                          ← append HR + Library + Communication types
lib/api/hr.api.ts                           ← new
lib/api/library.api.ts                      ← new
lib/api/communication.api.ts                ← new
lib/hooks/use-hr.ts                         ← new
lib/hooks/use-library.ts                    ← new
lib/hooks/use-communication.ts              ← new

app/(school)/hr/page.tsx                    ← replace placeholder → hub
app/(school)/hr/staff/page.tsx              ← new
app/(school)/hr/staff/[id]/page.tsx         ← new
app/(school)/hr/leave/page.tsx              ← new
app/(school)/hr/payroll/page.tsx            ← new

app/(school)/library/page.tsx               ← replace placeholder → hub
app/(school)/library/books/page.tsx         ← new
app/(school)/library/issues/page.tsx        ← new

app/(school)/communication/page.tsx         ← replace placeholder → hub
app/(school)/communication/notices/page.tsx ← new
app/(school)/communication/sms/page.tsx     ← new

components/layout/header.tsx                ← update: add notification bell
```

---

## PART A — HR & Staff

### Types (append to types/api.types.ts)
- `StaffSummary`, `StaffDetail`, `Department`, `Designation`, `LeaveType`
- `LeaveRequest`, `LeaveBalance`, `PayrollMonth`, `SalarySlip`
- DTOs: `CreateStaffData`, `ApplyLeaveData`, `PayrollOverride`

### API: lib/api/hr.api.ts
Wraps all HR endpoints:
- Staff: list (paginated + search + department filter), get, create, update, delete
- Departments: list, create
- Designations: list, create
- Leave types: list
- Leave requests: list (paginated + status filter), apply, review, get balance
- Payroll: list months, get slips for month, generate, finalize, open new month

### Hooks: lib/hooks/use-hr.ts
- `useStaffList(params)` — paginated, `.data.data.data`
- `useStaffDetail(id)` — single, `.data.data`
- `useDepartments()` — simple list, `.data.data`
- `useDesignations()` — simple list, `.data.data`
- `useLeaveTypes()` — simple list, `.data.data`
- `useLeaveRequests(params)` — paginated, `.data.data.data`
- `useLeaveBalance(userId)` — simple list, `.data.data`
- `usePayrollMonths()` — simple list, `.data.data`
- `usePayrollSlips(monthId)` — simple list, `.data.data`
- Mutations: `useCreateStaff`, `useReviewLeave`, `useApplyLeave`, `useGeneratePayroll`, `useFinalizePayroll`, `useOpenPayrollMonth`

### Pages

**`/hr`** — HR Hub
- Three quick-stat cards: Total Staff / On Leave Today / Payroll Status (current month status or "No active month")
- Three nav cards with icons linking to `/hr/staff`, `/hr/leave`, `/hr/payroll`
- Loading skeletons for stat cards

**`/hr/staff`** — Staff Directory
- `PageHeader` with "+ Add Staff" button
- Search input + Department dropdown (Radix Select, computed `<span>` inside trigger) + Role dropdown
- `DataTable`: Photo avatar | Employee ID | Name | Department | Designation | Role | Join Date | Status | Actions (Edit, Delete via ConfirmDialog)
- Add Staff: large Dialog with three sections (Personal info, HR info, Salary info), Zod + React Hook Form, same pattern as student form

**`/hr/staff/[id]`** — Staff Profile
- Back button to `/hr/staff`
- Two tabs: "Profile" (personal + HR details in key-value grid) | "Leave Balance" (table: Leave Type / Entitlement / Used / Balance)
- Loading skeleton for both tabs

**`/hr/leave`** — Leave Management
- Two tabs:
  - "All Requests": status filter dropdown, DataTable (Staff | Type | From | To | Days | Status | Actions). Approve/Reject buttons on PENDING rows — opens small review dialog with optional note. Uses `StatusBadge` for leave status.
  - "Apply for Leave": simple form (Leave Type select, From Date, To Date, Reason textarea), submits `applyLeave` mutation.

**`/hr/payroll`** — Payroll
- "Open Month" button → dialog (BS month 1–12 select, BS year number input, academic year select using `useCurrentAcademicYear`)
- List of payroll months: table rows with Month/Year | Status | Actions
  - DRAFT: [Generate] [View Slips] — Generate runs `generatePayroll`, View Slips opens Sheet
  - FINALIZED: [View Slips]
- Slips Sheet: full-width shadcn Sheet showing salary slips DataTable (Employee | Base | Allowances | Deductions | Leave Ded | Net). [Finalize] button at bottom with ConfirmDialog, SCHOOL_OWNER role only.

---

## PART B — Library

### Types (append to types/api.types.ts)
- `BookCategory`, `BookSummary`, `BookCopy`, `BookDetail`, `LibraryMember`, `BookIssue`
- DTOs: `AddBookData`, `AddCopyData`, `IssueBookData`

### API: lib/api/library.api.ts
Wraps all library endpoints:
- Books: list (paginated + search + category), get detail, add book, add copy
- Members: list (paginated + search), register
- Issues: list (paginated + status + member filter), get overdue, issue, return, pay fine
- Categories: list, create

### Hooks: lib/hooks/use-library.ts
- `useBooks(params)` — paginated → `.data.data.data`
- `useBookDetail(id)` — single → `.data.data`
- `useBookCategories()` — simple list → `.data.data`
- `useLibraryMembers(params)` — paginated → `.data.data.data`
- `useIssues(params)` — paginated → `.data.data.data`
- `useOverdueIssues()` — simple list → `.data.data`
- Mutations: `useAddBook`, `useAddCopy`, `useIssueBook`, `useReturnBook`, `usePayFine`

### Pages

**`/library`** — Library Hub
- Four stat cards: Total Books / Available Copies / Active Issues / Overdue (red highlight if > 0)
- Overdue table below stats (if any): Member | Book | Due Date | Days Overdue | [Return]
- Action buttons: "Issue Book" → `/library/issues`, "Catalogue" → `/library/books`

**`/library/books`** — Book Catalogue
- `PageHeader` with "+ Add Book" button
- Search input + Category dropdown (Radix Select + computed span)
- DataTable: Title | Author | ISBN | Category | Total Copies | Available | Actions (View, Add Copy)
- Click row → Book detail Sheet: full info + copies list (each copy shows availability; if issued shows member + due date + overdue flag)
- Add Book: Dialog with Zod form (title required, author/publisher/isbn/category/edition/language/description optional)
- Add Copy: smaller Dialog from the action menu (copy number required, accession/shelf/condition optional)

**`/library/issues`** — Issue & Return
- Two tabs:
  - "Active Issues": member search + status filter, DataTable (Member | Book | Copy | Issued | Due | Fine | Status | [Return] [Mark Lost] [Pay Fine]). Fine shown in red if overdue. StatusBadge for issue status.
  - "Issue a Book": member search by name/number → select member; book/copy search showing only available copies → select copy; due date using `BsDateInput`; [Issue Book] button.

---

## PART C — Communication

### Types (append to types/api.types.ts)
- `Notice`, `SmsLog`, `AppNotification`
- DTOs: `CreateNoticeData`

### API: lib/api/communication.api.ts
Wraps all communication endpoints:
- Notices: list (paginated + type + audience filter), create, publish, delete
- SMS: send single, bulk send, get logs (paginated + status filter)
- Notifications: get mine (paginated), get unread count, mark one read, mark all read

### Hooks: lib/hooks/use-communication.ts
- `useNotices(params)` — paginated → `.data.data.data`
- `useSmsLogs(params)` — paginated → `.data.data.data`
- `useMyNotifications(params)` — paginated → `.data.data.data`
- `useUnreadCount()` — simple → `.data.data.count`, `refetchInterval: 60_000`
- Mutations: `useCreateNotice`, `usePublishNotice`, `useDeleteNotice`, `useSendSms`, `useBulkSms`, `useMarkAsRead`, `useMarkAllRead`

### Pages

**`/communication`** — Communication Hub (replace placeholder)
- Two nav cards with icons: "Notice Board" → `/communication/notices`, "SMS Center" → `/communication/sms`
- Small stat: unread notification count badge

**`/communication/notices`** — Notice Board
- `PageHeader` with "+ Create Notice" button
- Type dropdown + Audience dropdown filters
- Cards grid (3-col on lg): each card shows type badge (URGENT=red, GENERAL=blue, EXAM=orange) | audience | title | body excerpt | published date (BsDate) | [Publish] (if draft) [Delete]
- Draft cards: grey border, "DRAFT" badge
- Create Notice dialog: title, body (textarea), type (select), audience (select), expires at (date input). Publish immediately checkbox.
- [Publish] calls `publishNotice` then invalidates

**`/communication/sms`** — SMS Center
- Two tabs:
  - "Send SMS": Audience select (ALL_PARENTS / BY_CLASS / CUSTOM_NUMBER). If BY_CLASS: class selector appears. If CUSTOM_NUMBER: phone input. Message textarea with 160-char counter. [Send] button.
  - "SMS Logs": status filter dropdown. DataTable: To Number | Message (truncated 50 chars) | Trigger | Status | Sent At. StatusBadge: SENT=green, FAILED=red, MOCK=yellow, PENDING=grey.

**`components/layout/header.tsx`** — Notification Bell
- Add `Bell` icon from lucide-react next to user avatar
- `useUnreadCount()` provides count; show red badge if count > 0
- shadcn `Popover` on click: header row "Notifications" + "Mark all read" button, then a scrollable list (max-h-80) of recent notifications (latest 10 from `useMyNotifications`)
- Each notification row: icon by type + title + body (truncated) + time ago
- Click notification: calls `markAsRead` mutation, invalidates unread count
- "View all" link at bottom (placeholder for now — no dedicated page)

---

## Patterns (all pages)

- `'use client'` at top of every page file
- Skeleton loading states on all async data
- `toast.success` / `toast.error` on mutation outcomes
- `<BsDate>` for all date display — never raw date strings
- `<AmountDisplay>` from `@/components/finance/amount-display` for money values
- Radix Select: always a computed `<span>` inside `<SelectTrigger>` for async-loaded option names
- Response extraction: paginated → `.data.data.data`, simple list → `.data.data`
- Primary color: `bg-[#1A5C38]` / `hover:bg-[#155030]`
- Never localStorage for tokens; never `useEffect + fetch`
