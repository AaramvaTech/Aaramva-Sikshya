# WEB-P Phase 5 — Parent Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PARENT-facing web portal (dashboard with per-child overview + side-by-side comparison, child switcher, attendance calendar, leave request, notices, results+PDF, timetable, assignments view, fees view-only) under `apps/web/app/(portal)/parent/`, replacing Phase 1's placeholder.

**Architecture:** Nine screens under `apps/web/app/(portal)/parent/`, reusing the Phase 1 `PortalShell`/`route-access.ts` scaffold (`/parent` prefix already covers every sub-route via longest-prefix matching — confirmed, no route-access change needed). **Unlike Phase 4** (which needed a whole new `/students/me/*` API surface), most of this phase's backend endpoints are the SAME admin-facing routes already wrapped by existing `lib/api/*.ts` + `lib/hooks/use-*.ts` files (`GET /attendance/students/:studentId/summary`, `GET /exams/results/report-card/:studentId`, `GET /finance/reports/student/:studentId`, `GET /finance/students/:studentId/assignments`, `GET /timetable/section/:sectionId`) — the backend now permits PARENT for all of them (confirmed in `docs/web/phase-5-idor-audit.md`, independently re-verified), and the existing hooks are ALREADY `enabled: !!studentId`-gated, so they're directly reusable with a parent-selected child's id. Only a handful of genuinely new endpoints exist: `GET /students/my-children`, `GET /assignments/my-children`, `GET /attendance/students/:studentId/history`, `POST /attendance/leave`.

**Tech Stack:** Next.js 14 App Router, TanStack Query, Zustand, Tailwind + shadcn/ui (existing conventions only).

## Global Constraints

- **Step 0 audit already complete and clean** (`docs/web/phase-5-idor-audit.md`) — every child-scoped endpoint this phase calls has a verified `guardians`-table ownership check. No backend changes are needed before building. If any task's own verification contradicts the audit doc, STOP and re-escalate — do not silently patch around a discrepancy.
- **Hard exclusion, not a judgment call:** never call `GET /finance/payments/{esewa|khalti}/status/:transactionUuid` from any screen — it is side-effecting (can finalize/credit a stuck transaction) despite being a GET, even though `PARENT` is technically role-permitted. No "Pay Now" / payment-status affordance anywhere in this phase (checkout is v2, view-only is v1).
- **Fees are view-only.** Render invoice detail from the array already in `useStudentLedger`'s response — there is no invoice-detail-by-id endpoint for parents. Do not invent one.
- **Assignments view-only for PARENT** — no submission affordance (that stays STUDENT-only, confirmed `POST /assignments/:id/submissions` is `@Roles(Role.STUDENT)`).
- **BS dates** always via `<BsDate>` or the `bs-calendar` package (`todayBs`, `bsToAd`, `adToBs`, `daysInBsMonth`, `formatBs`) — never raw JS `Date` for user-facing dates. For any BS-month-to-AD-range conversion, use a local component-extraction formatter (`getFullYear()/getMonth()/getDate()`, zero-padded) — **never** `.toISOString().split('T')[0]` on a locally-constructed Date (confirmed live, real bug: shifts the date backward by one day in Nepal's UTC+5:45 timezone; see `docs/web/phase-4-findings.md` §3). `BsDateInput` itself has this bug and must not be used as a reference for date-string conversion.
- **Reuse existing hooks before writing new ones.** Every task below names the exact existing hook to reuse where one exists — do not duplicate `useStudentAttendanceSummary`, `useReportCard`, `useStudentLedger`, `useStudentAssignments`, `useSectionTimetable`, `useNotices`, `useCurrentAcademicYear`. All of these are already `enabled: !!studentId`-gated (verified directly in each hook's source during planning) — safe to call with an async-resolved child id from the start.
- **Async-gate/hydration-guard bug class** (5 prior occurrences across Phases 2-4): every screen in this phase depends on an async-resolved "selected child" id (from `useMyChildren()`) before it can fetch anything — this is the single biggest async-gate surface of any phase so far. The shared `useSelectedChild()` hook (Task 2) is the one place this must be gated correctly; every downstream screen inherits its guard by construction (never re-derive "is a child selected yet" logic locally in a screen — always read it from `useSelectedChild()`).
- Live proof throughout: real HTTP + Postgres `SELECT` read-backs, shim/verify/restore for any test-account credential changes, IDOR probes on every child-scoped endpoint (cross-family attempts must 403).
- Raw terminal output (`tsc --noEmit` + test count) at the end.

---

### Task 1: Backend-adjacent — new parent-facing API client methods + types

No backend changes (all routes already exist and are correctly scoped per the audit). This task adds the frontend wrappers for the endpoints that have no existing admin-facing equivalent.

**Files:**
- Modify: `apps/web/types/api.types.ts`
- Modify: `apps/web/lib/api/students.api.ts`
- Modify: `apps/web/lib/api/attendance.api.ts`
- Modify: `apps/web/lib/api/assignments.api.ts`
- Modify: `apps/web/lib/hooks/use-students.ts`
- Modify: `apps/web/lib/hooks/use-attendance.ts`
- Modify: `apps/web/lib/hooks/use-assignments.ts`

**Interfaces:**
- Produces: `studentsApi.getMyChildren()`, `useMyChildren()`; `attendanceApi.getStudentHistory(studentId, params)`, `useStudentAttendanceHistory(studentId, params)`; `attendanceApi.applyLeave(data)`, `useApplyChildLeave()`; `assignmentsApi.myChildren()`, `useMyChildrenAssignments()`. Every later task (2-9) consumes one or more of these plus the pre-existing hooks named in Global Constraints.

- [ ] **Step 1: Add types to `apps/web/types/api.types.ts`**

Add near the existing `StudentAttendanceSummary`/leave types (after `StudentLeaveRequest`, check the file for its exact current location before inserting):

```typescript
// WEB-P Phase 5 — GET /students/my-children response shape (array elements).
export interface MyChild {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  relation: string;
  currentEnrollment: {
    className: string;
    sectionName: string;
    rollNumber: number | null;
    sectionId: string;
    academicYearId: string;
    academicYearName: string;
  } | null;
}
```

Add near `AssignmentSubmission`/`MyAssignment` (after `MyAssignment`):

```typescript
// WEB-P Phase 5 — GET /assignments/my-children response shape (array
// elements, one per child; NOT one call per child — the backend returns
// every child's assignments in a single request, already guardian-scoped).
export interface MyChildAssignments {
  studentId: string;
  studentName: string;
  assignments: (Assignment & {
    submission: { status: SubmissionStatus; marks: number | null; feedback: string | null } | null;
  })[];
}
```

Add near `StudentAttendanceSummary` (attendance history item, matching the paginated shape `getStudentHistory` returns — check the existing `AttendanceRecord` type first; if its fields already match `{id, studentId, sectionId, academicYearId, date, status, remarks, markedBy, markedAt}` exactly, reuse `AttendanceRecord` instead of adding a new type — verify before adding a duplicate).

Add near `ApplyLeaveDto`-equivalent (check if a `CreateLeaveData`/`ApplyLeaveData` type already exists for the HR leave flow — this is a DIFFERENT endpoint (`/attendance/leave`, not `/hr/leave`), so it needs its own type even if a similarly-named one exists elsewhere; don't reuse the HR one, the shapes are unrelated):

```typescript
export interface ApplyChildLeaveData {
  studentId: string;
  academicYearId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}
```

- [ ] **Step 2: Add `getMyChildren` to `apps/web/lib/api/students.api.ts`**

Read the file first to match its existing export style exactly. Add:

```typescript
  // WEB-P Phase 5 — GET /students/my-children (PARENT role only, no id param
  // — scoped server-side via the guardians table on the caller's own token).
  getMyChildren: () => api.get<ApiResponse<MyChild[]>>('/students/my-children'),
```

(Add `MyChild` to the file's existing type import list from `@/types/api.types`.)

- [ ] **Step 3: Add `useMyChildren` to `apps/web/lib/hooks/use-students.ts`**

Read the file first to match its existing hook style (check `useCurrentAcademicYear`'s exact pattern for the `enabled: !!slug` convention this file uses). Add:

```typescript
export function useMyChildren() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'my-children'],
    queryFn: () => studentsApi.getMyChildren().then((r) => r.data.data),
    enabled: !!slug,
  });
}
```

- [ ] **Step 4: Add `getStudentHistory` to `apps/web/lib/api/attendance.api.ts`**

Add after `getStudentSummary`:

```typescript
  getStudentHistory: (
    studentId: string,
    params: { fromDate?: string; toDate?: string; page?: number; limit?: number },
  ) =>
    api.get<ApiResponse<PaginatedResponse<AttendanceRecord>>>(
      `/attendance/students/${studentId}/history`,
      { params },
    ),
```

- [ ] **Step 5: Add `useStudentAttendanceHistory` to `apps/web/lib/hooks/use-attendance.ts`**

Add after `useStudentAttendanceSummary`, matching its exact gating convention:

```typescript
export function useStudentAttendanceHistory(
  studentId: string,
  params: { fromDate: string; toDate: string },
) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['attendance', 'student-history', studentId, params],
    queryFn: () =>
      attendanceApi
        .getStudentHistory(studentId, { ...params, limit: 100 })
        .then((r) => r.data.data.data),
    enabled: !!slug && !!studentId && !!params.fromDate && !!params.toDate,
  });
}
```

- [ ] **Step 6: Add `applyLeave` to `apps/web/lib/api/attendance.api.ts`**

Add after `reviewLeave`:

```typescript
  // WEB-P Phase 5 — POST /attendance/leave, PARENT filing leave for a child.
  // Distinct from /hr/leave (staff leave) — unrelated endpoint, unrelated shape.
  applyLeave: (data: ApplyChildLeaveData) =>
    api.post<ApiResponse<StudentLeaveRequest>>('/attendance/leave', data),
```

(Add `ApplyChildLeaveData` to the file's type imports.)

- [ ] **Step 7: Add `useApplyChildLeave` to `apps/web/lib/hooks/use-attendance.ts`**

```typescript
export function useApplyChildLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ApplyChildLeaveData) => attendanceApi.applyLeave(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', 'student-history'] });
    },
  });
}
```

- [ ] **Step 8: Add `myChildren` to `apps/web/lib/api/assignments.api.ts`**

Add after the existing `listMine`/`mySubmission`/etc. (from Phase 4's Task 3):

```typescript
  // WEB-P Phase 5 — GET /assignments/my-children (PARENT, no id param —
  // returns EVERY child's assignments in one call, already guardian-scoped).
  myChildren: () => api.get('/assignments/my-children'),
```

- [ ] **Step 9: Add `useMyChildrenAssignments` to `apps/web/lib/hooks/use-assignments.ts`**

```typescript
export function useMyChildrenAssignments() {
  return useQuery({
    queryKey: ['assignments', 'my-children'],
    queryFn: async () =>
      (await assignmentsApi.myChildren()).data.data as MyChildAssignments[],
  });
}
```

(Add `MyChildAssignments` to the file's type imports. No `enabled: !!slug` needed here if this file's convention doesn't already gate on slug elsewhere — check `useMyAssignments`'s pattern from Phase 4 first and match it exactly; if that one has no slug gate either, don't add one here for consistency.)

- [ ] **Step 10: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add apps/web/types/api.types.ts apps/web/lib/api/students.api.ts apps/web/lib/api/attendance.api.ts apps/web/lib/api/assignments.api.ts apps/web/lib/hooks/use-students.ts apps/web/lib/hooks/use-attendance.ts apps/web/lib/hooks/use-assignments.ts
git commit -m "feat(web-portal): add parent-facing API methods for my-children, attendance history, and leave requests

The rest of this phase's endpoints (attendance summary, results, ledger,
fee assignments, section timetable, notices) reuse existing admin-facing
hooks as-is — the backend already permits PARENT for all of them (see
docs/web/phase-5-idor-audit.md) and those hooks are already
enabled:!!studentId-gated. Only the genuinely new endpoints needed their
own wrappers here."
```

---

### Task 2: Child switcher — shared state + dropdown component

**Files:**
- Create: `apps/web/store/parent.store.ts`
- Create: `apps/web/lib/hooks/use-selected-child.ts`
- Create: `apps/web/components/parent/child-switcher.tsx`

**Interfaces:**
- Consumes: `useMyChildren()` (Task 1).
- Produces: `useSelectedChild()` returning `{ children: MyChild[], selectedChildId: string | null, selectedChild: MyChild | undefined, setSelectedChild: (id: string) => void, isLoading: boolean, isError: boolean }` — every per-child screen (Tasks 4-9) consumes this, never `useMyChildren()` directly, so the "pick a default child" and "is a child selected yet" logic lives in exactly one place. `<ChildSwitcher />` — rendered in each per-child screen's header.

**Design decision (why a Zustand store, not a URL param):** matches this app's existing pattern (`auth.store`, `tenant.store`, `locale.store` are all Zustand) and every other cross-page filter/selection in this app already resets on reload rather than round-tripping through the URL (e.g. the admin student-detail page's academic-year selector). Keeps this task small; a URL-param version can be a later polish pass if deep-linking to a specific child's screen becomes a real requirement.

- [ ] **Step 1: Create `apps/web/store/parent.store.ts`**

```typescript
import { create } from 'zustand';

interface ParentState {
  selectedChildId: string | null;
  setSelectedChildId: (id: string) => void;
}

export const useParentStore = create<ParentState>((set) => ({
  selectedChildId: null,
  setSelectedChildId: (id) => set({ selectedChildId: id }),
}));
```

- [ ] **Step 2: Create `apps/web/lib/hooks/use-selected-child.ts`**

```typescript
import { useEffect } from 'react';
import { useMyChildren } from '@/lib/hooks/use-students';
import { useParentStore } from '@/store/parent.store';

/**
 * WEB-P Phase 5 — the ONE place "which child is currently selected" is
 * resolved. Every per-child screen reads from this, never useMyChildren()
 * directly, so the default-to-first-child logic and the "children haven't
 * loaded yet" async-gate live in exactly one place (see Global Constraints
 * — this phase's single biggest async-gate surface).
 */
export function useSelectedChild() {
  const { data: children, isLoading, isError } = useMyChildren();
  const selectedChildId = useParentStore((s) => s.selectedChildId);
  const setSelectedChildId = useParentStore((s) => s.setSelectedChildId);

  useEffect(() => {
    if (!selectedChildId && children && children.length > 0) {
      setSelectedChildId(children[0].id);
    }
  }, [selectedChildId, children, setSelectedChildId]);

  const selectedChild = children?.find((c) => c.id === selectedChildId);

  return {
    children: children ?? [],
    selectedChildId,
    selectedChild,
    setSelectedChild: setSelectedChildId,
    isLoading,
    isError,
  };
}
```

- [ ] **Step 3: Create `apps/web/components/parent/child-switcher.tsx`**

```tsx
'use client';

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';

/**
 * WEB-P Phase 5 — dropdown child switcher, rendered in each per-child
 * screen's header. A single child renders as a plain label (no dropdown
 * needed — the common case for many families). Radix/base-ui Select with
 * async-loaded items: computed <span>, never <SelectValue>, per this
 * codebase's established convention.
 */
export function ChildSwitcher() {
  const { children, selectedChildId, setSelectedChild, isLoading } = useSelectedChild();

  if (isLoading) return <Skeleton className="h-9 w-40" />;
  if (children.length === 0) return null;

  if (children.length === 1) {
    return (
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {children[0].firstName} {children[0].lastName}
      </span>
    );
  }

  return (
    <Select value={selectedChildId ?? ''} onValueChange={(v) => v && setSelectedChild(v)}>
      <SelectTrigger className="h-9 w-48">
        <span>
          {children.find((c) => c.id === selectedChildId)
            ? `${children.find((c) => c.id === selectedChildId)!.firstName} ${children.find((c) => c.id === selectedChildId)!.lastName}`
            : 'Select child'}
        </span>
      </SelectTrigger>
      <SelectContent>
        {children.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.firstName} {c.lastName}
            {c.currentEnrollment ? ` — ${c.currentEnrollment.className} ${c.currentEnrollment.sectionName}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/store/parent.store.ts apps/web/lib/hooks/use-selected-child.ts apps/web/components/parent/child-switcher.tsx
git commit -m "feat(web-portal): add the shared child-switcher (state + dropdown)

Centralizes 'which child is selected' and the default-to-first-child
async-gate logic in one hook (useSelectedChild) so every per-child screen
inherits the same guard rather than re-deriving it."
```

---

### Task 3: Screen — Dashboard (overview + side-by-side comparison)

**Files:**
- Modify: `apps/web/app/(portal)/parent/page.tsx` (replace the Phase 1 placeholder)

**Interfaces:**
- Consumes: `useSelectedChild()` (Task 2, for the children list — this screen shows ALL children, not just the selected one, but still uses the shared hook so it never re-fetches `useMyChildren()` separately), `useStudentAttendanceSummary`, `useStudentLedger`, `useCurrentAcademicYear` (all pre-existing), `useMyChildrenAssignments` (Task 1), `useNotices` (pre-existing).

**Design — this is where both required child-switcher modes live:**
- **Per-child overview cards** (satisfies "dashboard: overview across all children" — item 1): one compact card per child (name, attendance %, fee balance), rendered in a loop over `children` from `useSelectedChild()`. Each card links to that child's Attendance/Fees screen (setting `selectedChildId` on click via `setSelectedChild`, then routing).
- **Side-by-side comparison table** (satisfies the "e.g. attendance/results compared across children at once" example from the child-switcher requirement — item 2's second mode): a table with one COLUMN per child and rows for attendance % / fee balance, beneath the overview cards. This is deliberately placed on the Dashboard rather than as a separate route — it's the natural home for "compare all my children at a glance," and avoids a redundant nav entry for a view that's really a Dashboard sub-section. Document this placement choice in a header comment (your call per the brief, but must be reachable and must genuinely show data side-by-side per column, not just a re-listing of the overview cards).
- Upcoming assignments: from `useMyChildrenAssignments()`, flatten all children's `assignments[]`, filter to `submission === null && status === 'PUBLISHED'`, sort by `dueDate`, cap at 5, each row shows which child it belongs to (`studentName`).
- Recent notices: `useNotices({ page: 1, limit: 3 })`.

**Async-gate note:** each per-child card's `useStudentAttendanceSummary(child.id, currentYear?.id)`/`useStudentLedger(child.id, currentYear?.id)` calls are already `enabled: !!studentId && !!academicYearId`-gated at the hook level (confirmed in Task 1's research) — no additional guard needed here beyond passing `currentYear?.id ?? ''`, matching the admin student-detail page's exact established pattern.

- [ ] **Step 1: Read `apps/web/app/(portal)/student/page.tsx`** (Phase 4's dashboard) for the overall card-grid/PageHeader composition convention — adapt to per-child looping, not single-subject content.

- [ ] **Step 2: Build the page** per the design above. Structure: `PageHeader` "My Children" → per-child overview card grid → comparison table section (heading "Compare" or similar) → upcoming assignments card → recent notices card.

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(portal\)/parent/page.tsx
git commit -m "feat(web-portal): build the parent dashboard (overview + comparison)

Per-child overview cards satisfy 'dashboard: overview across all
children'; a side-by-side comparison table (one column per child) beneath
them satisfies the child-switcher spec's comparison mode — placed on the
dashboard rather than a separate route since it's a natural dashboard
sub-section, not a distinct workflow."
```

---

### Task 4: Screen — Attendance (per child) + leave request

**Files:**
- Create: `apps/web/app/(portal)/parent/attendance/page.tsx`

**Interfaces:**
- Consumes: `useSelectedChild()` (Task 2), `useStudentAttendanceSummary(studentId, academicYearId)` (pre-existing), `useStudentAttendanceHistory(studentId, {fromDate,toDate})` (Task 1), `useCurrentAcademicYear()` (pre-existing), `useApplyChildLeave()` (Task 1).

**Design:** Mirror Phase 4's student attendance calendar exactly in structure (`ChildSwitcher` in the header instead of a fixed identity; BS-month grid; year-to-date % shown as-is from `useStudentAttendanceSummary`, never recomputed; visible-month summary strip shows raw counts only) — read `apps/web/app/(portal)/student/attendance/page.tsx` first and reuse its BS-month-grid logic pattern (leading blank cells, `daysInBsMonth`, per-day `bsToAd` calls, the `formatLocalDateAd` local formatter — **do not use `.toISOString()`**, same reasoning as Phase 4). Below the calendar, add a "Request leave for {child}" section: a form (leave type is implicit — this endpoint has no leave-type field, just `fromDate`/`toDate`/`reason`) submitting via `useApplyChildLeave().mutateAsync({ studentId: selectedChildId, academicYearId, fromDate, toDate, reason })`.

- [ ] **Step 1: Read `apps/web/app/(portal)/student/attendance/page.tsx`** in full — this task ports its calendar-grid logic to a per-child, switcher-driven version rather than the single-identity `/students/me/*` version.

- [ ] **Step 2: Build the page** — `ChildSwitcher` in the header; if `!selectedChildId` (children still loading or genuinely zero children), show a loading skeleton or an empty state respectively — never let the calendar attempt to render with an empty-string studentId. Year-to-date percent card from `useStudentAttendanceSummary`. BS-month grid from `useStudentAttendanceHistory`. Leave-request form below, with its own success/error toast handling (`getErrorDisplay`) and a query invalidation on success so a freshly-filed leave doesn't require a manual refresh to disappear from any "pending" indicator you choose to show (optional — no admin-side leave-status display was requested for this phase, keep it simple: a success toast is sufficient, no need to render the leave request back in this screen unless it's trivial to add).

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Live proof (deferred to the controller's consolidated pass — do not attempt)**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(portal\)/parent/attendance/page.tsx
git commit -m "feat(web-portal): add parent attendance calendar + leave request screen

Per-child BS-month grid (ported from Phase 4's student version, driven by
the shared ChildSwitcher instead of a fixed identity) plus a real leave-
request write flow via POST /attendance/leave."
```

---

### Task 5: Screen — Timetable (per child) — HIGHEST SCRUTINY

**Files:**
- Create: `apps/web/app/(portal)/parent/timetable/page.tsx`

**Interfaces:**
- Consumes: `useSelectedChild()` (Task 2), `useSectionTimetable(sectionId)` (pre-existing, `apps/web/lib/hooks/use-academic.ts:37-45`).

**This is explicitly the highest-scrutiny screen in this phase** — it calls the exact route (`GET /timetable/section/:sectionId`) implicated in Phase 4's IDOR finding. Before writing any code, re-read `docs/web/phase-5-idor-audit.md` §3 and independently re-verify (do not just trust the doc) that `TimetableService.getSectionTimetable`'s current PARENT branch (`apps/api/src/modules/academic/timetable.service.ts`) still checks guardian ownership of a student in the requested `sectionId`. Only proceed once you've read that code yourself.

**Design:** `sectionId` comes exclusively from `selectedChild.currentEnrollment.sectionId` (confirmed present in `GET /students/my-children`'s response per the audit) — never from any other source, never a route param, never user-suppliable. Read `apps/web/app/(portal)/student/timetable/page.tsx` (Phase 4) for the period-rows × day-columns table structure (confirmed the real, established convention last phase — do not reinvent a day-columns layout) and port it to a per-child, switcher-driven version. `useSectionTimetable(selectedChild?.currentEnrollment?.sectionId ?? '')` — the hook is already `enabled: !!sectionId`-gated. Handle: children still loading (skeleton), selected child has no `currentEnrollment` (empty state, "not enrolled in a section"), selected child has no timetable slots yet (different empty state), and the underlying query's own error state (surfaced, not swallowed — this was a real bug Phase 4's review caught on the analogous student screen, don't reintroduce it here).

- [ ] **Step 1: Independently re-verify the PARENT ownership check** in `apps/api/src/modules/academic/timetable.service.ts` by reading it directly. Report what you found in your task report even though it's expected to match the audit doc — this is a deliberate double-check, not busywork.

- [ ] **Step 2: Read `apps/web/app/(portal)/student/timetable/page.tsx`** for the table structure to port.

- [ ] **Step 3: Build the page** per the design above.

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(portal\)/parent/timetable/page.tsx
git commit -m "feat(web-portal): add parent timetable screen (per child)

Read-only weekly grid via GET /timetable/section/:sectionId, sectionId
sourced exclusively from the selected child's own /students/my-children
enrollment — never user-suppliable. Ownership check independently
re-verified before writing this screen (docs/web/phase-5-idor-audit.md §3)."
```

---

### Task 6: Screen — Notices

**Files:**
- Create: `apps/web/app/(portal)/parent/notices/page.tsx`

**Interfaces:**
- Consumes: `useNotices({page,limit})` (pre-existing, unchanged from Phase 4's usage).

Byte-for-byte port of `apps/web/app/(portal)/student/notices/page.tsx` (Phase 4 Task 6) — same hook, same audience-filtering already correct server-side for PARENT (`ROLE_AUDIENCES['PARENT'] = ['ALL','PARENTS']`, confirmed in the audit), no per-child scoping needed (notices aren't child-specific).

- [ ] **Step 1: Read `apps/web/app/(portal)/student/notices/page.tsx`**, adapt only the page title/description copy ("School announcements" stays generic, not per-child) and any student-specific route references.

- [ ] **Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(portal\)/parent/notices/page.tsx
git commit -m "feat(web-portal): add parent notices screen

Byte-for-byte port of the student notices screen — same hook, same
server-side audience filtering, not child-scoped (notices aren't per-child)."
```

---

### Task 7: Screen — Results + PDF (per child)

**Files:**
- Create: `apps/web/app/(portal)/parent/results/page.tsx`

**Interfaces:**
- Consumes: `useSelectedChild()` (Task 2), `useReportCard(studentId)` (pre-existing, `apps/web/lib/hooks/use-examination.ts:65-72`), the existing `ReportCardView` component (`apps/web/components/exams/report-card.tsx`, same one Phase 4 reused).

**Step 0 — verify before writing (do not assume the contract matches Phase 4's):** Phase 4's student results screen downloaded the PDF via a direct authenticated blob fetch against `GET /students/me/report-card/pdf` (a `/me`-family route). PARENT's equivalent is a DIFFERENT route: `GET /exams/results/report-card/:studentId/pdf` (confirmed in the audit — same `assertGuardianOwnsStudent` gate via the shared `getReportCard` call chain, but a different URL shape and NOT under the `/me` family). Confirm live (or by reading `examination.controller.ts`'s exact route decorator) that this is still a direct on-the-fly generated PDF (not a FILE-1 stored/presigned object) before building the download button — check for a `responseType`/content-type clue in the controller, or just build the same direct-blob-fetch pattern Phase 4 used and verify it live in the consolidated proof pass. Do not silently assume it's identical without this check — say explicitly in your report whether it matched or differed.

**Design:** Same shortcut Phase 4 found — reuse `ReportCardView` for on-page rendering (no `filterExamTypeId`), don't rebuild per-exam-type cards. Add a new `examinationApi` method for the PDF download if one doesn't already exist (check first — Phase 4 built `studentApi.downloadMyReportCardPdf()` for the `/me` route; this needs a PARENT-scoped equivalent hitting the `:studentId` route instead, likely `examinationApi.downloadReportCardPdf(studentId)` — add it to `apps/web/lib/api/examination.api.ts` if missing, following the exact blob-fetch pattern `student.api.ts`'s equivalent used: `api.get(\`/exams/results/report-card/${studentId}/pdf\`, { responseType: 'blob' })`). Reuse `downloadBlob()` from `@/lib/download` (Phase 4, already exists). Download button only shown when `reportCard.examResults.length > 0`, same reasoning as Phase 4 (never let the UI reach the backend's 409).

- [ ] **Step 1: Do the Step-0 route/contract check** described above.

- [ ] **Step 2: Add the PDF-download API method** if missing (per the design above).

- [ ] **Step 3: Build the page** — `ChildSwitcher` in the header, loading/error/empty states for `useReportCard`, `<ReportCardView reportCard={reportCard} />` when data exists, download button gated on `examResults.length > 0`.

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(portal\)/parent/results/page.tsx apps/web/lib/api/examination.api.ts
git commit -m "feat(web-portal): add parent results + report-card PDF screen (per child)

Reuses the existing ReportCardView component. PDF download hits the
:studentId-scoped route (GET /exams/results/report-card/:studentId/pdf),
NOT the /me-family route Phase 4's student screen used — confirmed this
is still a direct on-the-fly authenticated blob fetch, not a stored/
presigned object, per the Step-0 check in this task's report."
```

---

### Task 8: Screen — Assignments (view-only, per child)

**Files:**
- Create: `apps/web/app/(portal)/parent/assignments/page.tsx`

**Interfaces:**
- Consumes: `useSelectedChild()` (Task 2), `useMyChildrenAssignments()` (Task 1 — returns ALL children's assignments in one call, already guardian-scoped server-side).

**Design:** Unlike the other per-child screens, this one does NOT need a per-child API call when the switcher changes — `useMyChildrenAssignments()` already returns every child's list in one shot (`{studentId, studentName, assignments}[]`). Fetch once, then derive the currently-displayed list via `data?.find((c) => c.studentId === selectedChildId)?.assignments ?? []`. Card list (title, subject, `<BsDate>` due date, a status chip — reuse Phase 4's `assignmentStatusConfig` from `@/lib/assignment-status` if its shape matches this response's `submission` field naming, otherwise adapt inline since the field is named `submission` here vs `mySubmission` in Phase 4's `MyAssignment` — check before assuming they're interchangeable). **View-only: no click-through to a detail/submit page** — per the locked spec, submission is the student's job; a parent needs to see status/marks/feedback, not act on it. Render marks/feedback inline in the card when `submission?.status === 'REVIEWED'`.

- [ ] **Step 1: Build the page** per the design above.

- [ ] **Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(portal\)/parent/assignments/page.tsx
git commit -m "feat(web-portal): add parent assignments screen (view-only, per child)

Fetches GET /assignments/my-children once (already returns every child's
list, guardian-scoped server-side) and filters client-side on switcher
change — no per-switch API call needed. View-only per the locked spec:
no detail/submit affordance, marks+feedback shown inline when reviewed."
```

---

### Task 9: Screen — Fees (view-only, per child)

**Files:**
- Create: `apps/web/app/(portal)/parent/fees/page.tsx`

**Interfaces:**
- Consumes: `useSelectedChild()` (Task 2), `useStudentAssignments(studentId, academicYearId)` (pre-existing, fee STRUCTURE assignment — not to be confused with homework "assignments"), `useStudentLedger(studentId, academicYearId)` (pre-existing), `useCurrentAcademicYear()` (pre-existing).

**Design:** `ChildSwitcher` in the header. Render `useStudentLedger`'s response: `summary` (totalInvoiced/totalPaid/totalBalance) as stat cards, then `invoices[]` as a list/table (invoice number, due date via `<BsDate>`, status via `StatusBadge`, totalAmount/paidAmount/balance) — **this IS the invoice detail** per the locked spec (no separate invoice-detail-by-id call, no invoice-detail page/route). Optionally show `useStudentAssignments`'s fee-category breakdown (what's assigned, at what amount) as a secondary section — useful context, not strictly required by the spec's "view-only" framing, your call whether to include it (if included, label it clearly as "Fee structure" distinct from the invoice/payment history below it, so the two don't read as duplicates). **Absolutely no "Pay Now" button, no call to `GET /finance/payment-gateways`, no call to either payment-status route** — this is view-only, full stop, per the Global Constraints hard exclusion.

- [ ] **Step 1: Build the page** per the design above.

- [ ] **Step 2: Self-review specifically for the hard exclusion** — grep your own new file for `payment-gateways`, `esewa`, `khalti`, `status/` before committing; none should appear.

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(portal\)/parent/fees/page.tsx
git commit -m "feat(web-portal): add parent fees screen (view-only, per child)

Renders invoice/payment history directly from the ledger report response
(no invoice-detail-by-id endpoint exists for parents, per the locked
spec). No payment-gateway or payment-status calls anywhere — checkout
stays out of scope for v1, and the status endpoints are a confirmed
side-effecting hazard regardless (docs/web/phase-5-idor-audit.md §6)."
```

---

### Task 10: Nav wiring

**Files:**
- Modify: `apps/web/components/layout/portal-shell.tsx`
- Modify: `apps/web/lib/route-access.ts`

**Interfaces:**
- Produces: nothing consumed elsewhere — pure wiring.

- [ ] **Step 1: Add `PARENT_NAV_ITEMS` to `portal-shell.tsx`**

Read the file first (it currently has a three-way conditional: TEACHER → `TEACHER_NAV_ITEMS`, STUDENT → `STUDENT_NAV_ITEMS`, else → single Home link — PARENT currently falls into the `else` branch). Add:

```typescript
const PARENT_NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/parent', label: 'Dashboard' },
  { href: '/parent/attendance', label: 'Attendance' },
  { href: '/parent/timetable', label: 'Timetable' },
  { href: '/parent/notices', label: 'Notices' },
  { href: '/parent/results', label: 'Results' },
  { href: '/parent/assignments', label: 'Assignments' },
  { href: '/parent/fees', label: 'Fees' },
];
```

Change the three-way conditional to a four-way: TEACHER → `TEACHER_NAV_ITEMS`, STUDENT → `STUDENT_NAV_ITEMS`, PARENT → `PARENT_NAV_ITEMS`, else (none remaining, but keep the fallback for safety) → the single `t('nav.home')` link. Also render `<ChildSwitcher />` (Task 2) in the header for PARENT sessions specifically — place it next to the nav or in the right-hand cluster near the language toggle/role badge, your call on exact positioning, but it must be visible on every parent screen, not just per-page.

- [ ] **Step 2: Update the stale `route-access.ts` comment** for the `/parent` row (same pattern as Phase 4 Task 10 — comment-only, no logic change, cite a real endpoint like `GET /students/my-children`).

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run lib/__tests__/route-access.test.ts`
Expected: 0 tsc errors; route-access tests still pass unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/layout/portal-shell.tsx apps/web/lib/route-access.ts
git commit -m "feat(web-portal): wire the 7 parent screens into portal nav + global child switcher"
```

---

### Task 11: Whole-branch review, IDOR probes, findings doc, final counts

Verification only — no new feature code expected unless review turns up a real bug.

- [ ] **Step 1: Consolidated live-proof pass** (controller-owned, real HTTP + Postgres + a real browser session against the running dev stack, demo tenant, shim/verify/restore convention for any credential changes):
  - Log in as a demo parent account with at least one real child. Walk all 7 screens + the dashboard comparison table.
  - File a real leave request for a real child through the actual UI form; Postgres read-back confirms the row and `student_id` matches the selected child.
  - IDOR probes (raw HTTP, deliberately outside the UI) on EVERY child-scoped endpoint this phase calls: attendance summary/history, results/report-card(+pdf), timetable-by-section, fee assignments/ledger, `POST /attendance/leave` — using a SECOND demo parent/child pair from a different family. Every cross-family attempt must 403; confirm via Postgres that no side effect occurred for the write path.
  - Confirm the results PDF Step-0 finding from Task 7 (matched Phase 4's contract, or differed — report which).
  - Restore any shimmed credentials with a 401 read-back proof.

- [ ] **Step 2: Write `docs/web/phase-5-findings.md`** — the live-proof transcript, confirmation the step-0 audit held with no new gaps discovered during actual screen-building (or documenting any that WERE found despite the clean audit, with the same fix+test+live-403-proof discipline as Phase 4's timetable finding), and the async-gate bug-class note (whether this phase's heavier async-gate surface — every screen depending on `useSelectedChild()` — needed any regression test, and whether a shared test helper finally feels warranted now that this is a 6th-ish occurrence class in spirit even if `useSelectedChild()` itself is a single, correctly-gated-from-the-start hook).

- [ ] **Step 3: Full suite + tsc**

Run: `cd apps/api && npm test 2>&1 | tail -20` — record the exact count.
Run: `cd apps/web && npx vitest run 2>&1 | tail -20` — record the exact count.
Run: `cd apps/web && npx tsc --noEmit` — expect 0 errors.

- [ ] **Step 4: Update `CLAUDE.md`** with a "WEB-P Phase 5" entry matching the style/detail of Phases 1-4's entries — what was built, the step-0 audit's clean result, the live-proof summary, final counts. Explicitly note this phase does NOT authorize Phase 6 (teacher login cutover) — that needs the human's manual parity sign-off per the locked ruling in `WEB-P-PORTAL.md` §7, not just a green test suite.

- [ ] **Step 5: Commit**

```bash
git add docs/web/phase-5-findings.md CLAUDE.md
git commit -m "docs: record WEB-P Phase 5 (Parent module) completion"
```

---

## Self-Review Notes

- **Spec coverage:** all 9 numbered sections from the phase brief map to tasks — Dashboard (Task 3), Child switcher dual-mode (Tasks 2+3), Attendance (Task 4), Leave request (Task 4), Notices (Task 6), Results+PDF (Task 7), Timetable (Task 5, explicitly flagged highest-scrutiny), Assignments (Task 8), Fees (Task 9). Step 0's audit is already done and documented (`docs/web/phase-5-idor-audit.md`), predating this plan.
- **Hard exclusions:** no task calls the payment-status routes; no task builds a submission affordance for PARENT; no task invents an invoice-detail-by-id call.
- **Placeholder scan:** no task defers a decision to "add appropriate handling" — every design section states the exact behavior and exact hook/component to reuse or build.
- **Type consistency:** `MyChild`, `MyChildAssignments`, `ApplyChildLeaveData` (Task 1) are the only genuinely new types; every other task consumes pre-existing types (`StudentAttendanceSummary`, `ReportCard`, `StudentLedger`, `FeeAssignment`, `SectionTimetable`, `Notice`) verified present in `types/api.types.ts` during planning.
