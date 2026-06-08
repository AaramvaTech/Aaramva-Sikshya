# Frontend Session 13 — Attendance UI
# Aaramva Shikshya

## Prerequisites
- Sessions 11–12 complete
- Student module UI working (list, profile, enrollment)
- classes.api.ts and academic-years.api.ts exist
- Shared components: DataTable, BsDate, StatusBadge, PageHeader, ConfirmDialog

## Goal
Build the complete Attendance module UI:
- Daily attendance marking grid (teacher's primary daily tool)
- Attendance summary per student
- Section attendance report (date range, 2D grid)
- School-wide today summary (principal's view)

The attendance marking grid is the most-used screen in the system.
A teacher opens it every morning, clicks statuses for 30–40 students,
and submits. It must be fast, clear, and forgiving of mistakes.

---

## API functions

File: `lib/api/attendance.api.ts`

```typescript
export const attendanceApi = {
  // Mark attendance for a section (bulk upsert)
  bulkMark: (data: BulkAttendanceData) =>
    api.post<ApiResponse<{ marked: number }>>('/attendance/students/bulk', data),

  // Get attendance for a section on a date
  getSectionAttendance: (params: {
    sectionId: string;
    date: string;           // AD date
    academicYearId: string;
  }) => api.get<ApiResponse<AttendanceRecord[]>>('/attendance/students', { params }),

  // Student summary (totals for the year)
  getStudentSummary: (studentId: string, params: { academicYearId: string }) =>
    api.get<ApiResponse<StudentAttendanceSummary>>(`/attendance/students/${studentId}/summary`, { params }),

  // Section report (date range — the 2D grid)
  getSectionReport: (sectionId: string, params: {
    fromDate: string; toDate: string; academicYearId: string;
  }) => api.get<ApiResponse<SectionAttendanceReport>>(`/attendance/students/section/${sectionId}/report`, { params }),

  // School-wide today summary
  getSchoolSummary: () =>
    api.get<ApiResponse<SchoolAttendanceSummary>>('/attendance/students/school/summary'),
};
```

---

## Types to add to api.types.ts

```typescript
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';

export interface AttendanceRecord {
  id?: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  rollNumber: number | null;
  status: AttendanceStatus;
  remarks?: string;
}

export interface BulkAttendanceData {
  sectionId: string;
  academicYearId: string;
  date: string;             // AD date
  records: {
    studentId: string;
    status: AttendanceStatus;
    remarks?: string;
  }[];
}

export interface StudentAttendanceSummary {
  studentId: string;
  studentName: string;
  academicYearId: string;
  totalWorkingDays: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  attendancePercent: number;
  recentHistory: {
    ad: string;
    bs: string;
    status: AttendanceStatus;
  }[];
}

export interface SectionAttendanceReport {
  sectionId: string;
  sectionName: string;
  className: string;
  fromDate: { ad: string; bs: string };
  toDate: { ad: string; bs: string };
  dates: string[];          // AD dates that have records
  students: {
    studentId: string;
    admissionNumber: string;
    fullName: string;
    rollNumber: number | null;
    attendance: Record<string, 'P' | 'A' | 'L' | 'LV' | '-'>;
    summary: {
      present: number; absent: number; late: number; leave: number;
      total: number; percent: number;
    };
  }[];
}

export interface SchoolAttendanceSummary {
  date: { ad: string; bs: string };
  totalStudents: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  notMarked: number;
  attendanceRate: number;
  byClass: {
    classId: string;
    className: string;
    present: number;
    absent: number;
    total: number;
    rate: number;
  }[];
}
```

---

## Pages to build

### 1. Attendance Hub — `app/(school)/attendance/page.tsx`

This is the entry point. Shows two sections:

**Top section — Mark Today's Attendance** (for TEACHER role)
```
[Select Class ▼]  [Select Section ▼]

[Mark Attendance →]  (button, navigates to /attendance/mark?sectionId=xxx)
```

**Bottom section — School Overview** (for PRINCIPAL+)
School-wide summary card:
```
Today: 22 Baisakh 2081

Total Students: 843    Present: 721 (85.5%)
Absent: 72             Late: 18      Not Marked: 32

[Class breakdown table]
Class     Present   Absent   Not Marked   Rate
Grade 1   45/48     2        1            93.7%
Grade 2   ...
```

---

### 2. Attendance Marking Grid — `app/(school)/attendance/mark/page.tsx`

**This is the most important screen. Design it carefully.**

URL: `/attendance/mark?sectionId=xxx&date=2024-04-22`

Layout:
```
<PageHeader
  title="Mark Attendance"
  description="Grade 10 — Section A | 22 Baisakh 2081 (Mon)"
/>

[◀ Previous Day]  [📅 Date Picker — shows BS date]  [Next Day ▶]
                  (Cannot go to future dates)

[Quick Actions]: [✓ Mark All Present]  [Clear All]

┌──────────────────────────────────────────────────────────────────┐
│ Roll │ Name              │ P │ A │ L │ LV │ Remarks              │
├──────────────────────────────────────────────────────────────────┤
│  1   │ Ram Sharma        │ ● │ ○ │ ○ │ ○  │ [_______________]   │
│  2   │ Sita Rai          │ ○ │ ● │ ○ │ ○  │                     │
│  3   │ Hari Thapa        │ ○ │ ○ │ ○ │ ●  │ Medical leave       │
│ ...  │ ...               │   │   │   │    │                     │
└──────────────────────────────────────────────────────────────────┘

Summary: Present: 28 | Absent: 3 | Late: 1 | Leave: 2

[Save Attendance]  (loading state while submitting)
```

**Key UX details:**
- Status buttons: 4 radio-style buttons per row (P / A / L / LV)
- Default status for new day: no selection (blank)
- If attendance already marked for today: pre-fill existing statuses
- "Mark All Present" fills all blank rows with PRESENT (doesn't override already-set rows)
- Summary counts update in real time as teacher clicks
- Keyboard shortcut hint: "P = Present, A = Absent, L = Late, V = Leave"
- Remarks field only shows (expands) when status is ABSENT or LEAVE
- Mobile-friendly: large tap targets (minimum 44px)
- On submit: `attendanceApi.bulkMark()` → toast success → stay on page
  (teacher might want to review before navigating away)

**Date navigation:**
- Date stored in URL: `?date=2024-04-22` (AD)
- Display in BS using adToBs()
- Previous/Next buttons update the URL date param
- Date picker: custom BS date picker OR simple shadcn DatePicker
  (show AD internally, display/input as BS)
- Disable future dates (grey out Next Day if date = today)

**Pre-fill existing attendance:**
On page load (or date change): call `attendanceApi.getSectionAttendance()`
Map returned records to the student rows by studentId.

---

### 3. Section Report Page — `app/(school)/attendance/reports/page.tsx`

Two sub-views toggled by tabs:

**Tab 1 — Section Report (date range)**
```
[Class ▼]  [Section ▼]  [From Date]  [To Date]  [Generate Report]

--- After generating ---

Section A — Grade 10 | 1 Baisakh to 30 Baisakh 2081

            1/4  2/4  3/4  4/4  ...  Summary
Ram Sharma   P    A    P    P        P:25 A:3 L:1 (87%)
Sita Rai     P    P    L    P        P:27 A:1 L:1 (93%)
...

Export to PDF (placeholder for now)
```

The 2D grid: students as rows, dates as columns.
Use a horizontally scrollable table.
Color code: P=green bg, A=red bg, L=yellow bg, LV=blue bg, -=grey bg

**Tab 2 — Student Summary**
```
[Search student]  [Academic Year ▼]

Shows: <StudentAttendanceSummaryCard> for the searched student
  - Circular progress: 87% attendance
  - Count breakdown: P:245 A:28 L:10 LV:5
  - Last 30 days: mini calendar heat map (or simple list)
```

---

## Components to build

### `components/attendance/attendance-grid.tsx`
The core grid component. Props:
```typescript
interface AttendanceGridProps {
  students: { studentId: string; fullName: string; admissionNumber: string; rollNumber: number | null }[];
  existingRecords: AttendanceRecord[];   // pre-fill from today's data
  onSubmit: (records: BulkAttendanceData['records']) => Promise<void>;
  isSubmitting: boolean;
  date: string;    // AD date
}
```

Internal state: `Map<studentId, { status: AttendanceStatus | null, remarks: string }>`

### `components/attendance/status-selector.tsx`
The 4-button radio row for one student:
```typescript
interface StatusSelectorProps {
  value: AttendanceStatus | null;
  onChange: (status: AttendanceStatus) => void;
  showRemarks: boolean;
  remarks: string;
  onRemarksChange: (remarks: string) => void;
}
```

Renders 4 buttons: [P] [A] [L] [LV]
Selected button is filled/highlighted. Others are outlined.
Remarks textarea slides in (CSS transition) when status is ABSENT or LEAVE.

### `components/attendance/attendance-summary-bar.tsx`
Live count bar below the grid:
```
Present: 28  |  Absent: 3  |  Late: 1  |  Leave: 2  |  Unmarked: 4
```
Updates as teacher clicks. Color coded (green/red/yellow/blue/grey).

### `components/attendance/section-report-grid.tsx`
The 2D date-range report grid. Horizontally scrollable.
Color-coded cells. Summary column on the right.

### `components/attendance/student-summary-card.tsx`
Circular progress ring + counts + recent history list.

---

## TanStack Query hooks

```typescript
// lib/hooks/use-attendance.ts

export function useSectionAttendance(sectionId: string, date: string, academicYearId: string) {
  return useQuery({
    queryKey: ['attendance', 'section', sectionId, date],
    queryFn: () => attendanceApi.getSectionAttendance({ sectionId, date, academicYearId })
                                .then(r => r.data.data),
    enabled: !!sectionId && !!date && !!academicYearId,
  });
}

export function useBulkMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: attendanceApi.bulkMark,
    onSuccess: (_, variables) => {
      // Invalidate the section+date cache so it refreshes
      queryClient.invalidateQueries({
        queryKey: ['attendance', 'section', variables.sectionId, variables.date]
      });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'school-summary'] });
    },
  });
}

export function useSchoolAttendanceSummary() {
  return useQuery({
    queryKey: ['attendance', 'school-summary'],
    queryFn: () => attendanceApi.getSchoolSummary().then(r => r.data.data),
    refetchInterval: 5 * 60 * 1000,   // auto-refresh every 5 minutes
  });
}

export function useSectionReport(params: SectionReportParams, enabled: boolean) {
  return useQuery({
    queryKey: ['attendance', 'report', params],
    queryFn: () => attendanceApi.getSectionReport(params.sectionId, {
      fromDate: params.fromDate,
      toDate: params.toDate,
      academicYearId: params.academicYearId,
    }).then(r => r.data.data),
    enabled,
  });
}
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full — especially the @base-ui/react note and Next.js 16 useParams.
Then read docs/api-contracts/13-attendance-ui.md in full.

Sessions 11–12 complete. Student module UI is working.
Existing shared components: DataTable, BsDate, StatusBadge,
PageHeader, EmptyState, ConfirmDialog, BsDateInput.

Session 13 task: Build the complete Attendance module UI.

Work in this exact order:

1. Add attendance types to types/api.types.ts:
   AttendanceStatus, AttendanceRecord, BulkAttendanceData,
   StudentAttendanceSummary, SectionAttendanceReport, SchoolAttendanceSummary

2. Create lib/api/attendance.api.ts with 5 API functions.

3. Create lib/hooks/use-attendance.ts with 4 TanStack Query hooks.

4. Build components/attendance/status-selector.tsx:
   4 radio-style buttons (P/A/L/LV), highlights selected,
   remarks textarea slides in for ABSENT/LEAVE.

5. Build components/attendance/attendance-grid.tsx:
   - Internal Map state: studentId → { status, remarks }
   - Pre-fills from existingRecords prop
   - "Mark All Present" fills only blank rows
   - Live summary counts passed to attendance-summary-bar

6. Build components/attendance/attendance-summary-bar.tsx:
   Live count of P/A/L/LV/Unmarked. Color coded.

7. Build the Attendance Hub page (app/(school)/attendance/page.tsx):
   - Class + Section selector → navigate to /attendance/mark
   - School-wide summary card (useSchoolAttendanceSummary)
   - byClass breakdown table

8. Build the Attendance Marking page (app/(school)/attendance/mark/page.tsx):
   - Reads sectionId + date from URL search params
   - Previous/Next day navigation (disable Next if date = today)
   - Loads existing records with useSectionAttendance
   - Renders AttendanceGrid with pre-filled data
   - Submit calls bulkMarkAttendance mutation → toast success

9. Build components/attendance/section-report-grid.tsx:
   Horizontally scrollable 2D grid. Color-coded cells.

10. Build components/attendance/student-summary-card.tsx:
    Attendance percent + count breakdown + recent history.

11. Build the Reports page (app/(school)/attendance/reports/page.tsx):
    Two tabs: Section Report + Student Summary.
    Section Report: class/section/date-range pickers → generate → SectionReportGrid.
    Student Summary: student search → StudentSummaryCard.

Frontend rules (always):
- Never localStorage for tokens
- Always <BsDate> for display, adToBs() for logic
- Always TanStack Query — no useEffect + fetch
- Tailwind only
- shadcn/ui for primitives
- Loading skeletons on all async operations
- Disable "Next Day" button when date = today (AD comparison)
- "Mark All Present" must NOT override already-set statuses
```

---

## Learning checkpoint for Session 13

After this session, you should be able to answer:
- Why does the grid use a Map internally instead of an array?
- What does refetchInterval do in TanStack Query?
- Why do we store the date in the URL instead of React state?
- What is the UX reason remarks only appear for ABSENT and LEAVE?
