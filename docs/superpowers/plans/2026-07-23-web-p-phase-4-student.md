# WEB-P Phase 4 — Student Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the STUDENT-facing web portal (dashboard, attendance calendar, timetable, notices, results+PDF, assignments view/submission) under `apps/web/app/(portal)/student/`, replacing Phase 1's placeholder, and fix a real STUDENT-role IDOR found while researching the timetable screen.

**Architecture:** Six desktop screens under `apps/web/app/(portal)/student/`, reusing the Phase 1 `PortalShell` + `route-access.ts` scaffold (the `/student` prefix already covers every sub-route via longest-prefix matching — no route-access change needed). Data layer follows the existing per-domain `lib/api/*.api.ts` + `lib/hooks/use-*.ts` split; one new file (`lib/api/student.api.ts` + `lib/hooks/use-student-me.ts`) covers every `/students/me/*` self-service endpoint, mirroring the `/me` hard-scoping discipline already established on the backend (no id params anywhere). Assignment submission reuses the exact presign→PUT→confirm flow mobile already ships (`EDU-2`), rebuilt for a browser `File` object instead of Expo's file picker.

**Tech Stack:** Next.js 14 App Router, TanStack Query, Zustand, Tailwind + shadcn/ui (existing conventions only — no new libraries).

## Global Constraints

- STUDENT gets **no fee screen** (zero finance API access, explicitly deferred per `docs/web/WEB-P-PORTAL.md` §3) and **no leave-request screen** (parent files leave on the student's behalf, per mobile's design) — do not build either.
- Every `/students/me/*` call resolves the student **only** from the JWT (`token.userId → students.user_id`) — never accept or forward an id param from the frontend. This mirrors "THE ONE RULE" already documented in `CLAUDE.md` for this endpoint family.
- BS dates always render via `<BsDate>` or the `bs-calendar` package (`todayBs`, `bsToAd`, `adToBs`, `daysInBsMonth`, `formatBs`, `BS_MONTH_NAMES_EN`) — never raw JS `Date` for user-facing dates.
- Reuse existing hooks/components before writing new ones — `useNotices`, `useUnreadCount`, `FileDownloadLink`, `useFileUrl`, `StatusBadge`, `<BsDate>`, `<Card>`-equivalent Tailwind classes (`rounded-2xl border-gray-200 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900`, the established Phase 3 teacher-portal card convention) are all already correct for STUDENT and must not be reimplemented.
- Watch for the recurring async-gate/hydration-guard bug class (4 prior occurrences: `useStudents`/`useAssignments` query-enablement races in Phase 2, My Leave's render-branch race in Phase 3). Any new hook/component consuming an async-resolved value (e.g. `userId` from the auth store, a section id from a profile fetch) before feeding it into a query `enabled` gate or a JSX loading/empty branch must be guarded the same way — `!value || isLoading`, not just `isLoading`.
- Live proof throughout: real HTTP + Postgres `SELECT` read-backs, not mocked/curl-only claims for the UI-driven flows. Shim/verify/restore convention for any test-account credential changes (established pattern: temporarily set a known password, verify, restore, prove restoration with a 401).
- Raw terminal output (`tsc --noEmit` + test count) at the end.

---

### Task 1: Backend — fix the STUDENT timetable IDOR + regression tests

**Files:**
- Modify: `apps/api/src/modules/academic/timetable.service.ts:56-66`
- Modify: `apps/api/src/modules/academic/__tests__/timetable.service.spec.ts:259-266`

**Interfaces:**
- Consumes: nothing new — `TenantPrismaService.query`, `Role` enum, `errorBody` (all already imported in the file).
- Produces: `getSectionTimetable(sectionId, callerId?, callerRole?)` now enforces ownership for **both** `Role.PARENT` and `Role.STUDENT` (unchanged signature/return type — every later task that calls this via `academicApi.getSectionTimetable(sectionId)` is unaffected as long as the frontend always passes the caller's own `sectionId`, which Task 4 does).

**Background (already confirmed by reading the live source, do not re-derive):** `getSectionTimetable` has an `if (callerRole === Role.PARENT && callerId)` ownership check (JOIN through `guardians`) but **no equivalent branch for `Role.STUDENT`**, even though `STUDENT` is in the route's `@Roles()` allowlist (`timetable.controller.ts:54-65`). A STUDENT-authenticated request with any other section's UUID returns that section's full timetable — no error, no scoping. This is NOT the same as the existing `getSectionTimetable skips IDOR check for non-PARENT roles` test (`timetable.service.spec.ts:259`) — that test uses `Role.TEACHER`, and TEACHER's unrestricted access is correct, tested, intentional (staff have broad school-structure read access by design, per `docs/web/WEB-P-PORTAL.md` §7: *"Full school-wide roster/structure read access... is not scoped to 'own classes' — carries over as-is"*). STUDENT is a different trust tier from staff and must be scoped like PARENT is. Do not touch the TEACHER-role behavior.

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the existing `describe('IDOR protection — PARENT role', ...)` block in `apps/api/src/modules/academic/__tests__/timetable.service.spec.ts` (rename the `describe` to `'IDOR protection — PARENT and STUDENT roles'` since it now covers both), directly after the existing `'getSectionTimetable proceeds when parent has a child enrolled in the section'` test and before the `'skips IDOR check for non-PARENT roles'` test:

```typescript
    it('getSectionTimetable throws ForbiddenException when a student is not enrolled in the section', async () => {
      // enrollment check returns no matching student
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.getSectionTimetable('other-section', 'student-uuid', Role.STUDENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('getSectionTimetable proceeds when the student is enrolled in the section', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-uuid' }])   // IDOR enrollment check passes
        .mockResolvedValueOnce([{                           // timetable slots query
          ...mockSlotRow,
          subject_name: 'Math', subject_code: 'MTH',
          teacher_full_name: 'Ram Sharma',
          section_name: 'A', class_name: 'Grade 10',
        }]);

      const result = await service.getSectionTimetable('sec-1', 'student-uuid', Role.STUDENT);

      expect(result.schedule[1]).toHaveLength(1);
    });
```

Also rename the existing `'getSectionTimetable skips IDOR check for non-PARENT roles'` test (line 259) to `'getSectionTimetable skips IDOR check for staff roles (e.g. TEACHER)'` — same body, same `Role.TEACHER` caller, no logic change — the old name is no longer accurate once STUDENT is also checked.

- [ ] **Step 2: Run tests to verify the two new ones fail**

Run: `cd apps/api && npx jest timetable.service.spec.ts -t "student"`
Expected: FAIL — `getSectionTimetable proceeds when the student is enrolled` fails because the enrollment-check query is never issued (only 1 mocked call consumed, the slots query gets the empty-array mock instead), and the "throws ForbiddenException" test fails because no exception is thrown (falls straight through to the slots query, which 200s on the mocked empty response).

- [ ] **Step 3: Add the STUDENT ownership branch**

In `apps/api/src/modules/academic/timetable.service.ts`, immediately after the existing `if (callerRole === Role.PARENT && callerId) { ... }` block (ends at line 66) and before the `const rows = await this.tenantPrisma.query<...>(` slots query (line 67), insert:

```typescript
    // WEB-P Phase 4 — STUDENT was in this route's @Roles() allowlist but had
    // no ownership check at all (only PARENT was scoped above), so any
    // authenticated student could read any OTHER section's timetable by
    // passing an arbitrary sectionId. Mirrors the PARENT check: a student
    // may only ever view their own section's timetable.
    if (callerRole === Role.STUDENT && callerId) {
      const enrollment = await this.tenantPrisma.query<{ id: string }>(
        `SELECT s.id FROM students s
         WHERE s.user_id = $1::uuid AND s.section_id = $2::uuid AND s.deleted_at IS NULL`,
        callerId,
        sectionId,
      );
      if (!enrollment[0]) throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
    }
```

- [ ] **Step 4: Run the full timetable spec, then the full api suite**

Run: `cd apps/api && npx jest timetable.service.spec.ts`
Expected: PASS, all tests including the two new ones and the renamed one.

Run: `cd apps/api && npm test`
Expected: PASS, count = 665 + 2 = 667 (two new tests, zero removed — the rename doesn't change the count).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/academic/timetable.service.ts apps/api/src/modules/academic/__tests__/timetable.service.spec.ts
git commit -m "fix(api): scope STUDENT to their own section in getSectionTimetable

STUDENT was in @Roles() for GET /timetable/section/:sectionId but had no
ownership check (only PARENT did) — any authenticated student could read
any other section's timetable by passing an arbitrary sectionId. Found
while building WEB-P Phase 4's student timetable screen."
```

---

### Task 2: Web — student self-service types, API client, and hooks

**Files:**
- Modify: `apps/web/types/api.types.ts` (additions only, see below for exact anchors)
- Create: `apps/web/lib/api/student.api.ts`
- Create: `apps/web/lib/hooks/use-student-me.ts`
- Create: `apps/web/lib/download.ts`

**Interfaces:**
- Consumes: existing `api` axios instance (`@/lib/api`), existing `ApiResponse`/`PaginatedResponse` generics, existing `ReportCard` type (`types/api.types.ts:753`, reused as-is — the `/students/me/report-card` shape is structurally identical), existing `SectionTimetable` type (`types/api.types.ts:643`, reused as-is for the today-timetable's per-period shape via a new thin wrapper type).
- Produces: `studentApi.{getMyProfile, getMyTodayTimetable, getMyAttendanceSummary, getMyAttendanceHistory, getMyResults, getMyReportCard, downloadMyReportCardPdf}` — every later task (3–9) imports from this file. `useStudentMeProfile()`, `useMyTodayTimetable()`, `useMyAttendanceSummary()`, `useMyAttendanceHistory({fromDate,toDate})`, `useMyResults()`, `useMyReportCard()` — the hooks every screen task consumes. `downloadBlob(blob: Blob, filename: string): void` from `lib/download.ts`.

**Step 0 — verify before writing (do not skip):** confirm the exact response envelope for `GET /assignments/:id/submissions/me` when the student has not yet submitted (404, or 200 with `null`/`{}` data) — start the API dev server, log in as the demo student (shim password if needed, see Task 11's shim convention), and hit the route for an assignment they have not submitted. This determines how `useMySubmission` (Task 3) handles the "not yet submitted" case. Record the actual behavior in a one-line comment on the hook.

- [ ] **Step 1: Add the new response types to `apps/web/types/api.types.ts`**

Add immediately after the `StudentAttendanceSummary` interface (ends at `types/api.types.ts:299`, right before the `// Student leave application` comment on line 301):

```typescript
// WEB-P Phase 4 — GET /students/me/attendance/summary response shape.
// Distinct from StudentAttendanceSummary above (that's the admin/PARENT-
// facing GET /attendance/students/:studentId/summary — different route,
// different fields: no studentId/studentName here since it's always the
// caller's own; recentHistory uses {dateAd,status} not {ad,bs,status}).
export interface MyAttendanceSummary {
  academicYearId: string;
  academicYearName: string;
  totalWorkingDays: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  attendancePercent: number;
  recentHistory: { dateAd: string; status: string }[];
}

export interface MyAttendanceHistoryItem {
  dateAd: string;
  status: string;
  remarks: string | null;
}

// GET /students/me/timetable/today response shape.
export interface MyTodayTimetable {
  dayOfWeek: number;
  dateAd: string;
  isSchoolDay: boolean;
  periods: {
    slotId: string;
    periodNumber: number;
    startTime: string;
    endTime: string;
    subject: { id: string; name: string; code: string | null };
    teacher: { id: string; fullName: string };
    room: string | null;
  }[];
}

// GET /students/me response shape.
export interface StudentMeProfile {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  currentEnrollment: {
    className: string;
    sectionName: string;
    rollNumber: number | null;
    sectionId: string;
    academicYearId: string;
    academicYearName: string;
  } | null;
}

// GET /students/me/results response shape (array elements).
export interface MyResultRow {
  id: string;
  studentId: string;
  examTypeId: string;
  academicYearId: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  gpa: number | null;
  grade: string;
  division: string;
  rankInSection: number;
  rankInClass: number;
  isPassed: boolean;
  status: 'PASS' | 'FAIL' | 'ABSENT';
  computedAt: { ad: string; bs: string } | null;
  examTypeName: string;
}
```

Add immediately after the `Assignment` interface (ends at `types/api.types.ts:1418`, right before `export interface AssignmentSubmission {`):

```typescript
// WEB-P Phase 4 — GET /assignments/me response row. Extends Assignment with
// the caller's own submission summary (mirrors the MyExamSchedule extends
// ExamSchedule pattern above for /exams/schedules/my).
export interface MyAssignment extends Assignment {
  mySubmission: { status: SubmissionStatus; submittedAt: string; marks: number | null } | null;
}
```

- [ ] **Step 2: Create `apps/web/lib/api/student.api.ts`**

```typescript
import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  MyAttendanceSummary,
  MyAttendanceHistoryItem,
  MyTodayTimetable,
  StudentMeProfile,
  MyResultRow,
  ReportCard,
} from '@/types/api.types';

// WEB-P Phase 4 — every /students/me/* call. Same discipline as the backend:
// the student is always resolved from the caller's JWT server-side; nothing
// here accepts or forwards a studentId.
export const studentApi = {
  getMyProfile: () => api.get<ApiResponse<StudentMeProfile>>('/students/me'),
  getMyTodayTimetable: () =>
    api.get<ApiResponse<MyTodayTimetable>>('/students/me/timetable/today'),
  getMyAttendanceSummary: (params?: { academicYearId?: string }) =>
    api.get<ApiResponse<MyAttendanceSummary>>('/students/me/attendance/summary', { params }),
  getMyAttendanceHistory: (params: { fromDate?: string; toDate?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<MyAttendanceHistoryItem>>>('/students/me/attendance/history', { params }),
  getMyResults: () => api.get<ApiResponse<MyResultRow[]>>('/students/me/results'),
  getMyReportCard: () => api.get<ApiResponse<ReportCard>>('/students/me/report-card'),
  // Generated on the fly per-request (buildReportCardPdf) — NOT a FILE-1
  // stored object, so there is no presigned-URL step here; this is a direct
  // authenticated blob fetch, unlike every other file download in this app.
  downloadMyReportCardPdf: () =>
    api.get('/students/me/report-card/pdf', { responseType: 'blob' }),
};
```

- [ ] **Step 3: Create `apps/web/lib/download.ts`**

```typescript
/**
 * Trigger a browser file-save for an in-memory Blob. The web app's first
 * blob download (report-card PDFs are generated per-request, not a FILE-1
 * stored key — see studentApi.downloadMyReportCardPdf) — a small reusable
 * primitive rather than one-off inline code, matching how exportToCsv is
 * already the shared primitive for CSV downloads.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Create `apps/web/lib/hooks/use-student-me.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/lib/api/student.api';
import { useTenantStore } from '@/store/tenant.store';

export function useStudentMeProfile() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me'],
    queryFn: () => studentApi.getMyProfile().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyTodayTimetable() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'timetable-today'],
    queryFn: () => studentApi.getMyTodayTimetable().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyAttendanceSummary() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'attendance-summary'],
    queryFn: () => studentApi.getMyAttendanceSummary().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyAttendanceHistory(params: { fromDate: string; toDate: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'attendance-history', params],
    queryFn: () =>
      studentApi
        .getMyAttendanceHistory({ ...params, limit: 100 })
        .then((r) => r.data.data.data),
    enabled: !!slug && !!params.fromDate && !!params.toDate,
  });
}

export function useMyResults() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'results'],
    queryFn: () => studentApi.getMyResults().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyReportCard() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'report-card'],
    queryFn: () => studentApi.getMyReportCard().then((r) => r.data.data),
    enabled: !!slug,
  });
}
```

Note the deliberate `limit: 100` cap on `useMyAttendanceHistory` (a BS month is at most 32 days — 100 is a safety margin, not a real pagination need; no UI paginator required for this hook).

- [ ] **Step 5: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors (no consumers yet, but the new files must be internally type-correct).

- [ ] **Step 6: Commit**

```bash
git add apps/web/types/api.types.ts apps/web/lib/api/student.api.ts apps/web/lib/hooks/use-student-me.ts apps/web/lib/download.ts
git commit -m "feat(web-portal): add student self-service types, API client, and hooks

Foundational layer for WEB-P Phase 4 — every /students/me/* endpoint
(profile, today's timetable, attendance summary/history, results,
report card) plus a shared blob-download helper for the on-the-fly-
generated report-card PDF."
```

---

### Task 3: Web — assignment student-side API/hooks + submission upload helper

**Files:**
- Modify: `apps/web/lib/api/assignments.api.ts`
- Modify: `apps/web/lib/hooks/use-assignments.ts`
- Create: `apps/web/lib/submissionUpload.ts`

**Interfaces:**
- Consumes: `filesApi`'s `PresignUploadResponse` type (`@/lib/api/files.api.ts:14-21`, reused as-is — the assignment-scoped presign returns the identical shape), `MyAssignment`/`AssignmentSubmission` types from Task 2/existing.
- Produces: `assignmentsApi.{listMine, mySubmission, presignSubmissionUpload, submitMine}`, `useMyAssignments(params, options?)`, `useMySubmission(assignmentId)`, `useSubmitAssignment(assignmentId)`, and `uploadSubmissionFile(assignmentId, file): Promise<string>` (resolves to the confirmed `fileKey`) — Task 8 consumes all of these.

- [ ] **Step 1: Add student-side methods to `apps/web/lib/api/assignments.api.ts`**

Add at the end of the `assignmentsApi` object, after the existing `review` method:

```typescript
  // WEB-P Phase 4 — student-side. listMine hits the /me route (hard-scoped
  // server-side to the caller's own class/section), NOT `list` above (which
  // is the teacher/admin-facing /assignments route with different query
  // semantics and would 403 for STUDENT).
  listMine: (params: { page?: number; limit?: number }) => api.get('/assignments/me', { params }),
  mySubmission: (id: string) => api.get(`/assignments/${id}/submissions/me`),
  presignSubmissionUpload: (id: string, body: { filename: string; contentType: string; size: number }) =>
    api.post(`/assignments/${id}/submissions/presign-upload`, body),
  submitMine: (id: string, data: { textAnswer?: string; fileKey?: string }) =>
    api.post(`/assignments/${id}/submissions`, data),
```

- [ ] **Step 2: Add student-side hooks to `apps/web/lib/hooks/use-assignments.ts`**

Add near the top, after the `useAssignments` export (which stays untouched — this is a distinct query key, `['assignments','me',...]`, never colliding with the teacher list's `['assignments', params]`):

```typescript
export function useMyAssignments(params: { page?: number; limit?: number }, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['assignments', 'me', params],
    queryFn: async () => {
      const res = await assignmentsApi.listMine(params);
      return {
        data: res.data.data.data as MyAssignment[],
        meta: res.data.data.meta as { page: number; limit: number; total: number },
      };
    },
    enabled: options?.enabled ?? true,
  });
}

export function useMySubmission(assignmentId: string) {
  return useQuery({
    queryKey: ['assignments', 'me', 'submission', assignmentId],
    queryFn: async () => {
      try {
        return (await assignmentsApi.mySubmission(assignmentId)).data.data as AssignmentSubmission;
      } catch (err) {
        // Step 0 of Task 2 determines whether "not yet submitted" is a 404
        // or a 200/null — adjust this catch to match what was actually
        // observed live, do not guess.
        if (axios.isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!assignmentId,
  });
}

export function useSubmitAssignment(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { textAnswer?: string; fileKey?: string }) =>
      assignmentsApi.submitMine(assignmentId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments', 'me'] });
      void qc.invalidateQueries({ queryKey: ['assignments', 'me', 'submission', assignmentId] });
    },
  });
}
```

Add `import axios from 'axios';` and `import type { MyAssignment } from '@/types/api.types';` to the file's existing import block (the file already imports `AssignmentSubmission` from `@/types/api.types` — confirm and reuse, don't duplicate the import line).

- [ ] **Step 3: Create `apps/web/lib/submissionUpload.ts`**

```typescript
import axios from 'axios';
import { assignmentsApi } from '@/lib/api/assignments.api';
import type { PresignUploadResponse } from '@/lib/api/files.api';

// WEB-P Phase 4 — mirrors apps/mobile/lib/submissionUpload.ts's presign →
// raw PUT → confirm flow (EDU-2), rebuilt for a browser File instead of
// Expo's document picker. Deliberately does NOT use lib/upload.ts's
// uploadFile() helper: that calls the GENERIC POST /files/presign-upload,
// which the backend explicitly REJECTS for the submission-file kind
// (scopedOnly:true — see storage.policy.ts) regardless of role. The only
// legal presign path for a submission is the assignment-scoped one below.
const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function validateSubmissionFile(file: File): string | null {
  if (file.size > MAX_SUBMISSION_BYTES) return 'File is too large — max 10 MB.';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Unsupported file type — use an image, PDF, or Word document.';
  return null;
}

export async function uploadSubmissionFile(assignmentId: string, file: File): Promise<string> {
  const presign = (
    await assignmentsApi.presignSubmissionUpload(assignmentId, {
      filename: file.name,
      contentType: file.type,
      size: file.size,
    })
  ).data.data as PresignUploadResponse;

  // Plain axios on purpose — same reason as lib/upload.ts: the presigned
  // URL must not carry our Authorization / X-Tenant-Slug headers.
  await axios.put(presign.uploadUrl, file, { headers: presign.headers });

  return presign.key;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api/assignments.api.ts apps/web/lib/hooks/use-assignments.ts apps/web/lib/submissionUpload.ts
git commit -m "feat(web-portal): add student assignment API/hooks + submission upload

listMine/mySubmission/presignSubmissionUpload/submitMine plus a web port
of mobile's presign->PUT->confirm submission flow (the generic file-upload
route rejects submission-file uploads by design, so this uses the
assignment-scoped presign endpoint instead)."
```

---

### Task 4: Screen — Timetable

**Files:**
- Modify: `apps/web/app/(portal)/student/timetable/page.tsx` (create — directory doesn't exist yet)

**Interfaces:**
- Consumes: `useStudentMeProfile()` (Task 2, for `currentEnrollment.sectionId`), `academicApi.getSectionTimetable(sectionId)` (already exists, `apps/web/lib/api/academic.api.ts:75-76`) — **write a new hook `useSectionTimetable(sectionId)` in `apps/web/lib/hooks/use-academic.ts`** (check the file first — if a hook already wraps `getSectionTimetable` for some other caller, e.g. the admin timetable page, reuse it verbatim instead of duplicating; if none exists, add one following the exact pattern of `useMySections`/`useMyTimetable` in `use-timetable.ts`, `enabled: !!slug && !!sectionId`).
- Produces: nothing consumed elsewhere.

**Design:** Read-only weekly grid, Sunday–Friday (Saturday, day 6, never rendered as a column — same rule Phase 3's teacher timetable follows). Mirror `apps/web/app/(portal)/teacher/timetable/page.tsx`'s table structure and visual conventions (DAYS array, table styling) — that screen is also read-only and was explicitly built as its own small component rather than reusing the admin `TimetableGrid` (which ships add/delete mutations this screen must not have). Do the same here: a new small read-only component, not a reuse of the admin grid.

- [ ] **Step 1: Confirm/add `useSectionTimetable` in `apps/web/lib/hooks/use-academic.ts`**

Read the file first. If `getSectionTimetable` has no existing hook wrapper, add:

```typescript
export function useSectionTimetable(sectionId: string | undefined) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['academic', 'section-timetable', sectionId],
    queryFn: () => academicApi.getSectionTimetable(sectionId!).then((r) => r.data.data),
    enabled: !!slug && !!sectionId,
  });
}
```

Note the `enabled: !!sectionId` — this IS the async-gate guard for this screen: `sectionId` comes from `useStudentMeProfile()`, an async fetch, so the section-timetable query must not fire before it resolves. This is the exact bug class named in Global Constraints; get it right here rather than retrofitting it later.

- [ ] **Step 2: Build `apps/web/app/(portal)/student/timetable/page.tsx`**

```tsx
'use client';

import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useStudentMeProfile } from '@/lib/hooks/use-student-me';
import { useSectionTimetable } from '@/lib/hooks/use-academic';

const DAYS = [
  { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' },
];

export default function StudentTimetablePage() {
  const { data: profile, isLoading: profileLoading } = useStudentMeProfile();
  const sectionId = profile?.currentEnrollment?.sectionId;
  const { data: timetable, isLoading, isError, refetch } = useSectionTimetable(sectionId);

  const loading = profileLoading || (!!sectionId && isLoading);

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Timetable"
        description={timetable ? `${timetable.className} · ${timetable.sectionName}` : 'Your weekly class schedule'}
      />
      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} message="Couldn't load your timetable." />
      ) : !profile?.currentEnrollment ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
          You're not enrolled in a section yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {DAYS.map((d) => (
                  <th key={d.value} className="p-3 text-left font-semibold text-gray-500 dark:text-gray-400">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="align-top">
                {DAYS.map((d) => (
                  <td key={d.value} className="p-3 space-y-2">
                    {(timetable?.schedule[String(d.value)] ?? []).map((slot) => (
                      <div
                        key={slot.slotId}
                        className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 dark:border-gray-800 dark:bg-gray-800/50"
                      >
                        <p className="text-xs font-semibold text-gray-800 dark:text-white">{slot.subject.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{slot.startTime}–{slot.endTime}</p>
                        <p className="text-xs text-gray-400">{slot.teacher.fullName}{slot.room ? ` · ${slot.room}` : ''}</p>
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

Before finalizing, read `apps/web/app/(portal)/teacher/timetable/page.tsx` and align field/key names exactly against its actual (not assumed) `schedule` indexing convention — the code above assumes `schedule` is keyed by day-of-week as a string (matching the backend's `Record<number, ...>` serialized through JSON, where object keys become strings); confirm this against the teacher screen's real code rather than trusting this draft blindly.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Live proof (positive case)**

Start the dev stack. Log in as the demo student (`student@demo.school`, shim/verify/restore per Task 11's convention). Navigate to `/student/timetable`. Confirm the grid renders real periods matching a `SELECT` against `timetable_slots` for that student's actual `section_id` (`SELECT s.section_id FROM students s WHERE s.user_id = (SELECT id FROM users WHERE email='student@demo.school')`, then `SELECT * FROM timetable_slots WHERE section_id = '<that id>'`).

- [ ] **Step 5: Live proof (IDOR — this is the one named in the user's brief)**

While still authenticated as the demo student, issue a raw HTTP request (not through the UI) to `GET /timetable/section/:sectionId` with a **different, real** section's UUID (e.g. a different class's section from the same tenant). Before Task 1's fix this would have returned 200 with that section's real schedule; confirm it now returns 403 with `FORBIDDEN_SCOPE`. This is the live proof that Task 1's backend fix actually closes the gap end-to-end, not just in the unit test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(portal\)/student/timetable/page.tsx apps/web/lib/hooks/use-academic.ts
git commit -m "feat(web-portal): add student timetable screen

Read-only weekly grid (Sun-Fri) via GET /timetable/section/:sectionId,
sectionId sourced from the student's own /students/me enrollment. Depends
on the Task 1 backend IDOR fix for correct scoping."
```

---

### Task 5: Screen — Attendance calendar

**Files:**
- Create: `apps/web/app/(portal)/student/attendance/page.tsx`

**Interfaces:**
- Consumes: `useMyAttendanceSummary()`, `useMyAttendanceHistory({fromDate,toDate})` (Task 2), `bs-calendar`'s `todayBs`, `bsToAd`, `daysInBsMonth`, `BS_MONTH_NAMES_EN`.
- Produces: nothing consumed elsewhere.

**Design decision (record this, don't silently invent a second formula):** the backend's official `attendancePercent` in `MyAttendanceSummary` is computed over the **whole current academic year's working-day set**, not a single BS month. Do NOT recompute a month-level percentage client-side from the fetched month's day rows — that would use a different, inconsistent denominator and could visibly disagree with the official number. Instead: show the year-to-date `attendancePercent` from `useMyAttendanceSummary()` in one stat card at the top of the page (sourced directly, never re-derived), and show the visible month's **raw counts** (present/absent/late/leave, plain tallies from the fetched day-level array) in the calendar's summary strip below the grid — no percentage claim there, just counts.

Desktop-appropriate BS-month grid (reference mobile's `AttendanceCalendar` component for *behavior* — which days get which status, Saturday treatment, today highlight — not its mobile-sized UI, per the phase brief):
- 7-column CSS grid, headers Sun–Sat.
- State: `{ year, month }` defaulting to `todayBs()`; Prev/Next buttons; a "Today" button that resets to the current BS month.
- Fetch range: `fromDate = formatLocalDateAd(bsToAd({year, month, day: 1}))`, `toDate = formatLocalDateAd(bsToAd({year, month, day: daysInBsMonth(year, month)}))` — check `apps/web/lib/bs-calendar`-adjacent utilities or `apps/api`'s `formatLocalDate` equivalent for how the rest of this codebase turns a `Date` into a plain `YYYY-MM-DD` string on the frontend (search for an existing helper before writing a new one — `BsDateInput`/`BsDate` components likely already have this).
- Grid cells: blank cells before day 1's weekday offset (`bsToAd({year,month,day:1}).getDay()`), then one cell per day 1..daysInBsMonth. Each cell looks up its status from the fetched `MyAttendanceHistoryItem[]` by matching `dateAd`. Color per status using the SAME semantic families `StatusBadge` already uses (`success` for PRESENT, `error` for ABSENT, `warning` for LATE, `brand` for LEAVE) as a cell background fill rather than a pill — do not invent new colors. Saturday column gets a subtle amber/muted background regardless of attendance status (non-school day). Today's cell gets a ring highlight.
- Legend row below the grid (4 color swatches + labels).

- [ ] **Step 1: Build the page**

Write `apps/web/app/(portal)/student/attendance/page.tsx` following the design above. Before writing, read `apps/web/components/shared/bs-date-input.tsx` for the established `Date` → BS-string conversion helpers already in this codebase, and reuse them rather than reimplementing `bsToAd`/formatting from scratch.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Live proof**

Log in as the demo student. Navigate to `/student/attendance`. Confirm the year-to-date percent card matches a hand-computed value from `student_attendance` rows for that student (`SELECT status, COUNT(*) FROM student_attendance WHERE student_id = '<id>' GROUP BY status` cross-checked against the section's working-day count). Navigate at least one month back and forward; confirm the grid's colored cells match the same table filtered to that month's date range. Confirm Saturday cells are visually distinct regardless of status.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(portal\)/student/attendance/page.tsx
git commit -m "feat(web-portal): add student attendance calendar screen

Desktop BS-month grid; year-to-date percent sourced directly from the
backend's official figure, visible-month cells show raw status counts
(no client-recomputed percentage, avoids a second inconsistent formula)."
```

---

### Task 6: Screen — Notices

**Files:**
- Create: `apps/web/app/(portal)/student/notices/page.tsx`

**Interfaces:**
- Consumes: `useNotices({page,limit})` (**already exists**, `apps/web/lib/hooks/use-communication.ts:6-13` — reuse verbatim, zero new hooks; the backend's `ROLE_AUDIENCES['STUDENT'] = ['ALL','STUDENTS']` filtering plus `is_published=true` is already correct for this role).
- Produces: nothing consumed elsewhere.

**Design:** Read-only feed (no create/publish/delete affordances — those stay teacher/admin-only, already decided). Card-per-notice: title, type badge (via `StatusBadge` or a small local type→label map), body (full text — the list response already includes `body`, no per-notice detail fetch needed, and `GET /communication/notices/:id` has a known unscoped-read gap that this screen must not rely on regardless), `<BsDate>` for `publishedAt`. Simple pagination footer if `meta.total > limit`.

- [ ] **Step 1: Build the page**

```tsx
'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { BsDate } from '@/components/shared/bs-date';
import { Button } from '@/components/ui/button';
import { useNotices } from '@/lib/hooks/use-communication';

const LIMIT = 10;

export default function StudentNoticesPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useNotices({ page, limit: LIMIT });
  const notices = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader title="Notices" description="School announcements" />
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : notices.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
          No notices yet.
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <div key={n.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">{n.title}</h3>
                <span className="text-xs text-gray-400"><BsDate date={n.publishedAt ?? n.createdAt} /></span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
        </div>
      )}
      {meta && meta.total > LIMIT && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-xs text-gray-400">Page {page} of {Math.ceil(meta.total / LIMIT)}</span>
          <Button variant="outline" size="sm" disabled={page * LIMIT >= meta.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Live proof**

Log in as the demo student. Navigate to `/student/notices`. Confirm the list matches `SELECT * FROM notices WHERE is_published=true AND audience IN ('ALL','STUDENTS') ORDER BY created_at DESC` for the demo tenant. If a CLASS-audience or unpublished notice exists in the demo tenant, confirm it is correctly ABSENT from this screen (documents the known ROLE_AUDIENCES gap is unaffected/consistent, not newly introduced).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(portal\)/student/notices/page.tsx
git commit -m "feat(web-portal): add student notices screen

Read-only feed reusing the existing useNotices hook as-is — backend
audience filtering (ROLE_AUDIENCES) already correctly scopes STUDENT."
```

---

### Task 7: Screen — Results + PDF

**Files:**
- Create: `apps/web/app/(portal)/student/results/page.tsx`

**Interfaces:**
- Consumes: `useMyReportCard()` (Task 2), `studentApi.downloadMyReportCardPdf()` (Task 2), `downloadBlob()` (Task 2), `ReportCard` type (existing, `types/api.types.ts:753`).
- Produces: nothing consumed elsewhere.

**Design:** Reference `apps/web/app/(school)/exams/results/page.tsx`'s existing `ReportCard` rendering (admin already renders this exact shape — per-exam-type cards with percentage/grade/gpa/rank, subject breakdown table, annual result summary) for field-level conventions; adapt to the Phase 3 teacher-portal card style (`rounded-2xl border-gray-200 shadow-theme-sm`) rather than the admin page's DataTable-heavy layout. Only render the "Download report card (PDF)" button when `examResults.length > 0` — this deliberately avoids ever triggering the backend's 409 ("no results published yet") from the UI, since the empty-state branch already covers that case with its own message.

- [ ] **Step 1: Build the page**

Structure:
- `PageHeader` title "My Results".
- Loading: skeleton. Error: `QueryErrorState`.
- Empty (`!reportCard || reportCard.examResults.length === 0`): EmptyState-style message "No results published yet." — no download button.
- Otherwise: a "Download report card (PDF)" button (top-right, next to the header) wired to an async handler:
  ```tsx
  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await studentApi.downloadMyReportCardPdf();
      downloadBlob(res.data as Blob, `report-card-${reportCard!.student.admissionNumber}.pdf`);
    } catch (err) {
      toast.error(getErrorDisplay(err).message);
    } finally {
      setDownloading(false);
    }
  }
  ```
  then one card per `examResults[]` entry (exam type name, percentage, grade, gpa, rank in section/class, a small subjects table: subject name / marks obtained / full marks / grade), then a final "Annual Result" summary card (`weightedPercentage`, `finalGrade`, `finalGpa`, `division`, pass/fail badge).

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Live proof**

Log in as the demo student. Navigate to `/student/results`. If the demo tenant has no published results for this student, confirm the empty state renders correctly (no crash, no download button) — then, using an admin session, publish results for the student's exam type (or confirm existing published data), reload as the student, and confirm the report card content matches a `SELECT` against `student_results`/`marks` for that student and exam type. Click Download; confirm a real PDF file lands (magic bytes `%PDF-`, matching the `%PDF-1.3` proof convention already used for POL-1 T3's PARENT PDF test).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(portal\)/student/results/page.tsx
git commit -m "feat(web-portal): add student results + report-card PDF screen

Per-exam-type cards + annual result summary from GET /students/me/report-card;
PDF download is a direct authenticated blob fetch (the PDF is generated
per-request server-side, not a FILE-1 stored object — no presign step)."
```

---

### Task 8: Screen — Assignments (list + detail + submission)

**Files:**
- Create: `apps/web/app/(portal)/student/assignments/page.tsx`
- Create: `apps/web/app/(portal)/student/assignments/[id]/page.tsx`
- Create: `apps/web/lib/assignment-status.ts`

**Interfaces:**
- Consumes: `useMyAssignments`, `useMySubmission`, `useSubmitAssignment` (Task 3), `uploadSubmissionFile`, `validateSubmissionFile` (Task 3), `FileDownloadLink` (existing, `components/shared/file-download-link.tsx`), `MyAssignment`/`AssignmentSubmission` types.
- Produces: `assignmentStatusConfig(assignment: MyAssignment): { label, className }` — consumed by both this task's list screen and Task 9's dashboard widget (the second real call site that justifies extracting this as a small shared file rather than inlining it once).

**Design:**
- **List** (`/student/assignments`): `useMyAssignments({ page: 1, limit: 100 })` (a BS-year's worth of assignments comfortably fits in one page — no paginator needed here). Split into two sections: "To submit" (`mySubmission === null`) and "Submitted" (`mySubmission !== null`), each a card list (title, subject/class/section, `<BsDate>` due date, a status chip from `assignment-status.ts`). Clicking a row routes to `/student/assignments/[id]`.
- **Detail** (`/student/assignments/[id]`): **there is no student-scoped `GET /assignments/:id`** (confirmed: that route is `ASSIGNMENT_MANAGER_ROLES`-only, 403s STUDENT) — derive the assignment object from the `useMyAssignments` cache exactly as mobile's `assignment-detail.tsx` does (`assignments.data?.find((a) => a.id === id)`). If not found in the cache (foreign id, or cache not yet loaded), show a "not found" state — never attempt a fallback fetch that doesn't exist for this role. Show: title, description, `<BsDate>` due date, subject/class/section, status; teacher attachments via `FileDownloadLink` for each `attachmentKeys[]` entry. Submission section driven by `useMySubmission(id)`:
  - Not yet submitted (or resubmittable — anything short of `REVIEWED`): a form (optional text answer, optional file picker using `validateSubmissionFile`/`uploadSubmissionFile`, client-side "at least one required" check mirroring the server's exact rule) → `useSubmitAssignment(id).mutateAsync({ textAnswer?, fileKey? })`. On a 409 response, show a distinct "Submission locked" message (not a generic error toast) — mirror mobile's exact branching (`err.response?.status === 409` → locked copy, not an error state).
  - `REVIEWED`: read-only — marks, feedback, own submitted text/file (via `FileDownloadLink` if `fileKey` present).

- [ ] **Step 1: Create `apps/web/lib/assignment-status.ts`**

```typescript
import type { MyAssignment } from '@/types/api.types';

export interface AssignmentStatusConfig {
  label: string;
  className: string;
}

/**
 * WEB-P Phase 4 — shared between the assignments list screen and the
 * dashboard's upcoming-assignments widget (two real call sites). Mirrors
 * mobile's lib/assignmentStatus.ts semantic-literal convention: isPastDue is
 * DISPLAY-ONLY, the server's Kathmandu end-of-day rule is authoritative for
 * what actually counts as LATE once a submission exists.
 */
export function assignmentStatusConfig(a: MyAssignment): AssignmentStatusConfig {
  if (a.mySubmission?.status === 'REVIEWED') {
    return { label: 'Reviewed', className: 'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400' };
  }
  if (a.mySubmission?.status === 'LATE') {
    return { label: 'Submitted late', className: 'bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400' };
  }
  if (a.mySubmission?.status === 'SUBMITTED') {
    return { label: 'Submitted', className: 'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400' };
  }
  const isPastDue = new Date(a.dueDate).getTime() < Date.now();
  if (a.status === 'CLOSED') {
    return { label: 'Closed', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  }
  if (isPastDue) {
    return { label: 'Overdue', className: 'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400' };
  }
  return { label: 'Open', className: 'bg-brand-50 text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-400' };
}
```

- [ ] **Step 2: Build the list page** (`apps/web/app/(portal)/student/assignments/page.tsx`) per the Design section above, using `assignmentStatusConfig` for chips and `<Link href={`/student/assignments/${a.id}`}>` rows.

- [ ] **Step 3: Build the detail page** (`apps/web/app/(portal)/student/assignments/[id]/page.tsx`) per the Design section above.

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Live proof — this is the phase's headline round trip**

Using a real Playwright-driven (or equivalent real-browser) session logged in as the demo student (shim/verify/restore per Task 11):
1. Navigate to `/student/assignments`, confirm a PUBLISHED assignment for the student's own class/section appears under "To submit".
2. Open it, submit a real text answer (and/or a real file if MinIO/storage is running in this dev environment — if not, honestly report that the file path was not exercised rather than faking it, same discipline as Phase 2 T5's honest storage-unavailable report).
3. Confirm via Postgres `SELECT * FROM assignment_submissions WHERE assignment_id=... AND student_id=...` that the row now exists with `status IN ('SUBMITTED','LATE')`.
4. Switch to a teacher session (`teacher@demo.school`, same shim convention) and open the **existing** Phase 2 `/teacher/assignments/[id]` review screen — confirm the new submission is visible there and can be reviewed (enter marks/feedback, submit review).
5. Switch back to the student session, reload the assignment detail page, confirm marks/feedback now render read-only and the status chip shows "Reviewed".
6. Confirm via Postgres that `reviewed_by`/`reviewed_at` are populated and match the teacher account.

This closes the loop Phase 2 could only test via a raw API call — both sides of the portal now round-trip through real UI.

- [ ] **Step 6: Live proof — IDOR probe (named explicitly in the phase brief)**

While authenticated as the demo student, issue a raw HTTP `POST /assignments/:id/submissions` (not through the UI) against an assignment id belonging to a **different class/section** the student is not enrolled in (a real id from the demo tenant's data, found via a direct Postgres query — not guessed). Confirm this returns 403 `FORBIDDEN_SCOPE` from `resolveEligibleAssignment`, and confirm via Postgres that no `assignment_submissions` row was created. Also confirm `GET /assignments/:id` (the staff-only single-assignment route) returns 403 for the student session, proving the detail screen's cache-lookup-only design isn't papering over a reachable leak.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/\(portal\)/student/assignments apps/web/lib/assignment-status.ts
git commit -m "feat(web-portal): add student assignments list/detail + submission flow

List (To submit / Submitted), detail derived from the /me list cache (no
student-scoped single-assignment GET exists), submit via the assignment-
scoped presign->PUT->confirm flow. Closes the round trip Phase 2's teacher
review screen could previously only be tested against via raw API calls."
```

---

### Task 9: Screen — Dashboard

**Files:**
- Modify: `apps/web/app/(portal)/student/page.tsx` (replace the Phase 1 placeholder entirely)

**Interfaces:**
- Consumes: `useStudentMeProfile`, `useMyTodayTimetable`, `useMyAttendanceSummary` (Task 2), `useMyAssignments` (Task 3), `useNotices` (existing), `assignmentStatusConfig` (Task 8).
- Produces: nothing consumed elsewhere — this is the leaf composition screen, built last so it can link to every other screen.

**Design:** Reference `apps/web/app/(portal)/teacher/page.tsx` (Phase 2 T1) for the overall dashboard composition convention (greeting header, stat/summary cards, quick-links grid) — adapt content, not layout mechanics, to student data:
- Header: `{firstName} {lastName}` greeting + today's BS date (`formatBs(todayBs(), 'en')`).
- Attendance summary card: `attendancePercent` + present/absent/late/leave counts (reuse `StatusBadge`-style chips), links to `/student/attendance`.
- Today's classes card: from `useMyTodayTimetable()` — if `!isSchoolDay`, show "No classes today" (Saturday or unassigned section); otherwise list `periods[]` (subject, time, teacher, room). Links to `/student/timetable`.
- Upcoming assignments card: from `useMyAssignments({page:1,limit:100})`, client-filtered to `mySubmission === null && status === 'PUBLISHED'` (DRAFT never appears in `/me` results per the backend's own filter), sorted by `dueDate` ascending, top 5 shown, each with `assignmentStatusConfig` chip. Links to `/student/assignments`.
- Recent notices card: `useNotices({ page: 1, limit: 3 })` (server already sorts newest-first — no client sort needed). Links to `/student/notices`.
- A results quick-link card/tile (no data fetch needed on the dashboard itself — just a link to `/student/results`), matching the "quick actions" tile convention from the admin dashboard.

- [ ] **Step 1: Build the page**, composing the five widgets above as a responsive card grid (reference `apps/web/app/(portal)/teacher/page.tsx`'s grid breakpoints).

**Watch here specifically for the async-gate bug class** (Global Constraints): `useMyTodayTimetable`/`useMyAttendanceSummary`/`useMyAssignments`/`useNotices` are all independently `enabled: !!slug`-gated (no chained dependency on `useStudentMeProfile`'s result this time — unlike the timetable screen, none of these four need `profile` to fire), so there is no cross-hook dependency to gate here. The one place a guard IS needed: the greeting header reads `profile?.firstName`/`profile?.lastName` — while `profile` is loading, render a skeleton for the greeting line specifically (not a blank/undefined string), the same `!value || isLoading` shape as every prior fix in this bug class.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Live proof**

Log in as the demo student. Confirm every widget's numbers match the same live data already verified in Tasks 4–8 (attendance percent matches Task 5's proof, today's classes matches Task 4's section timetable filtered to today's day-of-week, upcoming assignments matches Task 8's list minus already-submitted ones, notices matches Task 6's list truncated to 3). Click through all five quick-links, confirm each lands on the correct screen.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(portal\)/student/page.tsx
git commit -m "feat(web-portal): build the real student dashboard

Replaces Phase 1's placeholder. Composes attendance summary, today's
timetable, upcoming assignments, and recent notices from the screens
built in this phase — no new data-fetching logic, pure composition."
```

---

### Task 10: Nav wiring

**Files:**
- Modify: `apps/web/components/layout/portal-shell.tsx`
- Modify: `apps/web/lib/route-access.ts:89`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere — this is pure wiring.

- [ ] **Step 1: Add `STUDENT_NAV_ITEMS` to `portal-shell.tsx`**

Following the exact `TEACHER_NAV_ITEMS` pattern (array of `{href, label}`, rendered via the same active-link logic), add:

```typescript
const STUDENT_NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/student', label: 'Dashboard' },
  { href: '/student/attendance', label: 'Attendance' },
  { href: '/student/timetable', label: 'Timetable' },
  { href: '/student/notices', label: 'Notices' },
  { href: '/student/results', label: 'Results' },
  { href: '/student/assignments', label: 'Assignments' },
];
```

Change the nav's conditional render from `user?.role === 'TEACHER' ? TEACHER_NAV_ITEMS.map(...) : (<Link>Home</Link>)` to a three-way branch: `TEACHER` → `TEACHER_NAV_ITEMS`, `STUDENT` → `STUDENT_NAV_ITEMS`, else (PARENT, still Phase 5's placeholder) → the existing single `t('nav.home')` link. Do not change PARENT's behavior — that's Phase 5's scope.

- [ ] **Step 2: Update the stale `route-access.ts` comment**

At `lib/route-access.ts:89`, change:
```typescript
{ prefix: '/student', roles: ['STUDENT'], endpoint: 'WEB-P placeholder (no backend call yet — update as later phases add real screens)' },
```
to:
```typescript
{ prefix: '/student', roles: ['STUDENT'], endpoint: 'GET /students/me (WEB-P Phase 4)' },
```
No logic change — the `/student` prefix already covers every new sub-route via the existing longest-prefix matching (same as Phase 2/3 required zero `route-access.ts` logic changes).

- [ ] **Step 3: Verify it compiles and existing route-access tests still pass**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run lib/__tests__/route-access.test.ts`
Expected: 0 tsc errors; route-access tests still green (the parametrized-over-`ROUTE_ACCESS`-array test picks up the comment-only change automatically, no test edit needed).

- [ ] **Step 4: Live proof**

Log in as the demo student. Confirm all 6 nav links render, are highlighted correctly when active, and none 404. Confirm PARENT and TEACHER sessions are visually unaffected (screenshot or direct inspection).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/portal-shell.tsx apps/web/lib/route-access.ts
git commit -m "feat(web-portal): wire the 6 student screens into portal nav"
```

---

### Task 11: Whole-branch review, remaining IDOR probes, findings doc, final counts

**Files:**
- Create: `docs/web/phase-4-findings.md`

This task is verification, not new feature code — no source changes expected unless review turns up a real bug, in which case fix it in place and note it in the findings doc (same pattern as every prior phase's "final whole-branch review" step).

- [ ] **Step 1: Write `docs/web/phase-4-findings.md`**, structured like `docs/web/phase-3-ownership-findings.md` — the Task 1 IDOR finding (what was found, why the existing PARENT-only check didn't cover it, what the fix does, why TEACHER's behavior is untouched and correct) plus a short note on the two lower-severity, out-of-scope gaps found during research but not fixed:
  - `GET /communication/notices/:id` has no audience/publish filtering (any authenticated role can fetch any single notice by UUID guess) — not exercised by any Phase 4 screen (the notices list already includes full `body` text, so no screen ever calls the `:id` route), flagged for a future pass, not fixed here (out of the explicit IDOR-probe scope named in the phase brief: attendance/results/assignments/timetable).
  - Confirm and record: attendance/results endpoints are structurally IDOR-proof (student id is never accepted as a param at all, resolved only from the JWT) — there was nothing to probe-and-fix there beyond confirming the absence of a param.

- [ ] **Step 2: Re-run every regression test added in this phase** and confirm each genuinely fails against its pre-fix code (mental-revert check, same standard as Phase 2 T6 and the Phase 3 leave-balance fix):
  - Task 1's two new STUDENT ownership tests: temporarily revert the STUDENT branch, confirm both fail, restore.

- [ ] **Step 3: Full suite + tsc, both apps**

Run: `cd apps/api && npm test 2>&1 | tail -20`
Record the exact pass count (expected 667, per Task 1).

Run: `cd apps/web && npx vitest run 2>&1 | tail -20`
Record the exact pass count (expected 317, unchanged — this phase added no new web unit tests; all verification was live HTTP+Postgres proof, matching Phase 3's precedent of a pure-frontend phase needing no new test files beyond the one backend fix's tests).

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Update `CLAUDE.md`** with a "WEB-P Phase 4" entry in the same style and level of detail as the Phase 1/2/3 entries above it — what was built, the IDOR finding and fix, the live-proof summary, final test counts. Do not start Phase 5 (Parent module) — stop here and report.

- [ ] **Step 5: Commit**

```bash
git add docs/web/phase-4-findings.md CLAUDE.md
git commit -m "docs: record WEB-P Phase 4 (Student module) completion"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** all 6 screens (dashboard, attendance calendar, timetable, notices, results+PDF, assignments view+submission) map to Tasks 4/5/4/6/7/8/9 respectively (timetable and dashboard both partly Task 4/9); the IDOR probe requirement maps to Tasks 1, 4 Step 5, 8 Step 6; the async-gate watch requirement is called out explicitly in Global Constraints and re-raised at Task 4 Step 1 and Task 9 Step 1 (the two places a genuine async dependency exists in this phase); live-proof-with-shim/restore is named in every screen task; the findings-doc requirement is Task 11 Step 1; raw tsc+test-count output is Task 11 Step 3.
- **Fee/leave exclusions:** no task builds a fee screen or a leave-request screen — confirmed absent from every task's file list above.
- **Shared-test-helper question (from the Phase 3 follow-up):** this phase's only new regression tests are Task 1's backend ones (a query-branch test, same shape as the existing PARENT tests it sits next to — no new test infrastructure needed). No new render-guard/query-gate regression test is added in this phase's web code because Task 4 Step 1 and Task 9 Step 1 build the guard in *from the start* rather than fixing a shipped bug after the fact — there is nothing to regression-test retroactively. If a 5th instance of the bug class turns up as a **fix** (not a from-the-start guard) during this phase's execution, that is the point to revisit whether a shared test helper is finally warranted, per the standing instruction from Phase 3.
