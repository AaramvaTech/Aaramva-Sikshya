# Frontend Session 15 — Academic & Examination UI
# Aaramva Shikshya

## Prerequisites
- Sessions 11–14 complete
- Student, Attendance, Finance UIs all working
- Shared components: DataTable, BsDate, StatusBadge, PageHeader, EmptyState, ConfirmDialog, BsDateInput, AmountDisplay

## Goal
Build two modules in one session (both are medium complexity):

**Academic module:**
- Class & section management
- Subject management
- Timetable viewer

**Examination module:**
- Exam schedule setup
- Marks entry grid (similar pattern to attendance grid)
- Result viewer
- Report card

---

## API functions

File: `lib/api/academic.api.ts`
```typescript
export const academicApi = {
  // Classes
  listClasses: () => api.get<ApiResponse<ClassWithSections[]>>('/classes'),
  createClass: (data: { name: string; alias?: string; orderIndex: number }) =>
    api.post<ApiResponse<ClassWithSections>>('/classes', data),
  updateClass: (id: string, data: Partial<{ name: string; alias: string; orderIndex: number }>) =>
    api.patch<ApiResponse<ClassWithSections>>(`/classes/${id}`, data),
  deleteClass: (id: string) => api.delete(`/classes/${id}`),

  // Sections
  createSection: (classId: string, data: { name: string; capacity?: number; classTeacherId?: string }) =>
    api.post<ApiResponse<Section>>(`/classes/${classId}/sections`, data),
  updateSection: (classId: string, sectionId: string, data: Partial<{ name: string; capacity: number; classTeacherId: string }>) =>
    api.patch<ApiResponse<Section>>(`/classes/${classId}/sections/${sectionId}`, data),
  deleteSection: (classId: string, sectionId: string) =>
    api.delete(`/classes/${classId}/sections/${sectionId}`),

  // Subjects
  listSubjects: () => api.get<ApiResponse<Subject[]>>('/subjects'),
  createSubject: (data: { name: string; code?: string; type?: string }) =>
    api.post<ApiResponse<Subject>>('/subjects', data),
  updateSubject: (id: string, data: Partial<{ name: string; code: string; type: string }>) =>
    api.patch<ApiResponse<Subject>>(`/subjects/${id}`, data),
  deleteSubject: (id: string) => api.delete(`/subjects/${id}`),

  // Class-subject assignments
  assignSubject: (classId: string, data: { subjectId: string; academicYearId: string; fullMarks?: number; passMarks?: number }) =>
    api.post<ApiResponse<ClassSubject>>(`/classes/${classId}/subjects`, data),
  getClassSubjects: (classId: string, params?: { academicYearId?: string }) =>
    api.get<ApiResponse<ClassSubject[]>>(`/classes/${classId}/subjects`, { params }),
  removeSubject: (classId: string, subjectId: string) =>
    api.delete(`/classes/${classId}/subjects/${subjectId}`),

  // Timetable
  getSectionTimetable: (sectionId: string) =>
    api.get<ApiResponse<SectionTimetable>>(`/timetable/section/${sectionId}`),
  getTeacherTimetable: (teacherId: string) =>
    api.get<ApiResponse<TeacherTimetable>>(`/timetable/teacher/${teacherId}`),
  createSlot: (data: TimetableSlotData) =>
    api.post<ApiResponse<TimetableSlot>>('/timetable', data),
  deleteSlot: (slotId: string) => api.delete(`/timetable/${slotId}`),
};
```

File: `lib/api/examination.api.ts`
```typescript
export const examinationApi = {
  // Exam types
  listExamTypes: (params?: { academicYearId?: string }) =>
    api.get<ApiResponse<ExamType[]>>('/exams/types', { params }),
  createExamType: (data: CreateExamTypeData) =>
    api.post<ApiResponse<ExamType>>('/exams/types', data),

  // Schedules
  listSchedules: (params: { examTypeId?: string; classId?: string }) =>
    api.get<ApiResponse<ExamSchedule[]>>('/exams/schedules', { params }),
  bulkCreateSchedules: (data: BulkCreateScheduleData) =>
    api.post<ApiResponse<ExamSchedule[]>>('/exams/schedules/bulk', data),

  // Marks
  getMarksForSchedule: (scheduleId: string) =>
    api.get<ApiResponse<MarkRecord[]>>(`/exams/marks?examScheduleId=${scheduleId}`),
  bulkEnterMarks: (data: BulkMarksData) =>
    api.post<ApiResponse<{ saved: number }>>('/exams/marks/bulk', data),

  // Results
  computeResults: (data: { examTypeId: string; classId: string; sectionId?: string }) =>
    api.post<ApiResponse<ComputeResultSummary>>('/exams/results/compute', data),
  getClassResults: (classId: string, params: { examTypeId: string }) =>
    api.get<ApiResponse<ClassResultRow[]>>(`/exams/results/class/${classId}`, { params }),
  getReportCard: (studentId: string) =>
    api.get<ApiResponse<ReportCard>>(`/exams/results/report-card/${studentId}`),

  // Grading scales
  listGradingScales: () =>
    api.get<ApiResponse<GradingScale[]>>('/exams/grading-scales'),
};
```

---

## Types to add to api.types.ts

```typescript
export interface Section {
  id: string;
  classId: string;
  name: string;
  capacity: number;
  classTeacherId: string | null;
  classTeacherName: string | null;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  type: 'THEORY' | 'PRACTICAL' | 'BOTH';
}

export interface ClassSubject {
  id: string;
  subjectId: string;
  subjectName: string;
  fullMarks: number;
  passMarks: number;
  academicYearId: string;
}

export interface TimetableSlot {
  slotId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: { id: string; name: string; code: string | null };
  teacher: { id: string; fullName: string };
  room: string | null;
}

export interface SectionTimetable {
  sectionId: string;
  sectionName: string;
  className: string;
  schedule: Record<string, TimetableSlot[]>; // key: "0"–"6" (day of week)
}

export interface TeacherTimetable {
  teacherId: string;
  teacherName: string;
  schedule: Record<string, (TimetableSlot & { section: string; className: string })[]>;
}

export interface ExamType {
  id: string;
  name: string;
  weightPercent: number;
  academicYearId: string;
  orderIndex: number;
  totalWeight: number;
  isComplete: boolean;
}

export interface ExamSchedule {
  id: string;
  examTypeId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  examDate: { ad: string; bs: string };
  startTime: string;
  endTime: string;
  fullMarks: number;
  passMarks: number;
  room: string | null;
}

export interface MarkRecord {
  id?: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  rollNumber: number | null;
  marksObtained: number | null;
  isAbsent: boolean;
  remarks: string | null;
}

export interface ClassResultRow {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  rankInSection: number;
  rankInClass: number;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  isPassed: boolean;
  status: string;
}

export interface ReportCard {
  student: {
    id: string; admissionNumber: string; fullName: string;
    rollNumber: number | null; className: string; sectionName: string; academicYear: string;
  };
  examResults: {
    examType: { id: string; name: string; weightPercent: number; orderIndex: number };
    percentage: number; grade: string; gpa: number | null;
    rankInSection: number; rankInClass: number; isPassed: boolean; status: string;
    subjects: {
      subjectId: string; subjectName: string; fullMarks: number;
      marksObtained: number | null; percentage: number | null;
      grade: string | null; isPassed: boolean; isAbsent: boolean;
    }[];
  }[];
  annualResult: {
    weightedPercentage: number; finalGrade: string;
    finalGpa: number | null; division: string; isPassed: boolean;
  };
}

export interface GradingScale {
  id: string; name: string; isDefault: boolean;
  thresholds: { grade: string; minPercent: number; maxPercent: number; gpaPoint: number | null; remarks: string | null }[];
}

export interface ComputeResultSummary {
  computed: number; passed: number; failed: number; absent: number;
}

// DTOs
export interface CreateExamTypeData {
  name: string; weightPercent: number; academicYearId: string; orderIndex: number;
}

export interface BulkCreateScheduleData {
  examTypeId: string; classId: string;
  subjects: {
    subjectId: string; examDate: string; startTime: string; endTime: string;
    fullMarks: number; passMarks: number; room?: string;
  }[];
}

export interface BulkMarksData {
  examScheduleId: string;
  marks: { studentId: string; marksObtained?: number; isAbsent?: boolean; remarks?: string }[];
}

export interface TimetableSlotData {
  sectionId: string; subjectId: string; teacherId: string; academicYearId: string;
  dayOfWeek: number; periodNumber: number; startTime: string; endTime: string; room?: string;
}
```

---

## Pages to build

### ACADEMIC MODULE

### 1. Academic Hub — `app/(school)/academic/page.tsx`
Three cards linking to sub-sections:
- Classes & Sections → /academic/classes
- Subjects → /academic/subjects
- Timetable → /academic/timetable

### 2. Classes Page — `app/(school)/academic/classes/page.tsx`
```
<PageHeader title="Classes & Sections" action={<Button>+ Add Class</Button>} />

Accordion list — each class expands to show sections:
▼ Grade 10  (3 sections, 120 students)
    Section A  |  Class Teacher: Ram Sir  |  40 students  [Edit] [Delete]
    Section B  |  Class Teacher: Sita Ma'am  |  38 students  [Edit] [Delete]
    [+ Add Section]

▼ Grade 9  (2 sections)
    ...

[+ Add Class] at bottom
```

Add/Edit Class: inline form or small dialog — Name, Alias, Order Index.
Add/Edit Section: dialog — Name, Capacity, Class Teacher (staff dropdown).

### 3. Subjects Page — `app/(school)/academic/subjects/page.tsx`
```
<PageHeader title="Subjects" action={<Button>+ Add Subject</Button>} />

[Class filter ▼] [Academic Year ▼]

Two-column layout:
Left: All subjects (DataTable: Name | Code | Type | Actions)
Right: Subjects assigned to selected class
       [+ Assign Subject ▼] dropdown
       Each row shows Full Marks | Pass Marks | [Remove]
```

### 4. Timetable Page — `app/(school)/academic/timetable/page.tsx`

```
[Class ▼]  [Section ▼]  [Academic Year ▼]

Weekly grid:
         Sun   Mon   Tue   Wed   Thu   Fri
Period 1  Math  Eng   Sci   Math  Nep   Eng
Period 2  Eng   Sci   Math  Eng   Math  Sci
...

Each cell shows: Subject name + Teacher initials
Empty cell: [+ Add] button
Click on filled cell: tooltip with full details + [Delete] option
```

Nepal school week: Sunday–Friday (6 days).
Day labels: SUN, MON, TUE, WED, THU, FRI.

---

### EXAMINATION MODULE

### 5. Exams Hub — `app/(school)/exams/page.tsx`
Cards for each exam type (First Terminal, Half Yearly, Final):
```
┌──────────────────────────────┐
│ First Terminal               │
│ Weight: 20%                  │
│ Subjects scheduled: 8/10     │
│                              │
│ [View Schedule] [Enter Marks]│
│ [View Results]               │
└──────────────────────────────┘
```

Header action: "+ Create Exam Type"

### 6. Exam Schedule Page — `app/(school)/exams/schedule/page.tsx`

```
<PageHeader title="Exam Schedule" />

[Exam Type ▼]  [Class ▼]

Table: Subject | Date | Time | Full Marks | Pass Marks | Room

[+ Bulk Add Subjects] button opens dialog:
  For each subject in the class, a row:
  Subject | Date input | Start | End | Full | Pass | Room
  [Save All]
```

### 7. Marks Entry Page — `app/(school)/exams/marks/page.tsx`

Very similar to attendance marking grid. Same forwardRef + useImperativeHandle pattern.

```
<PageHeader title="Enter Marks" />

[Exam Type ▼]  [Class ▼]  [Subject ▼]

--- After selecting ---

Schedule: Mathematics | Grade 10 | 15 Baisakh 2081
Full Marks: 100 | Pass Marks: 40

┌────────────────────────────────────────────┐
│ Roll │ Name         │ Marks  │ Absent │ Remarks│
├────────────────────────────────────────────┤
│  1   │ Ram Sharma   │ [___]  │ [ ]    │ [___]  │
│  2   │ Sita Rai     │ [___]  │ [✓]    │ [___]  │
└────────────────────────────────────────────┘

Validation: marks cannot exceed full marks.
Absent checkbox clears marks field.

[Save Marks]
```

### 8. Results Page — `app/(school)/exams/results/page.tsx`

Two tabs:

**Tab 1 — Class Rank List**
```
[Exam Type ▼]  [Class ▼]  [Compute Results] (button triggers POST)

After computing:
Rank | Name | Obtained | Total | % | Grade | Pass/Fail
1    | Ram  | 485/500  | 97%   | A+| ✓ Pass
...
```

"Compute Results" shows a loading spinner, then success toast with summary counts.

**Tab 2 — Report Card**
```
[Search student]

Shows full report card:
Student: Ram Sharma | Grade 10-A | Roll: 1 | 2081-82

            First Terminal  Half Yearly  Final    Annual
            (20%)           (30%)        (50%)
Nepali       72              78           82       79.8
Mathematics  85              90           88       88.1
...
Total        78.5%  A        84%  A+      85%  A+  83.3% A+

Division: First Division ✓
Annual Grade: A+  GPA: 3.8
Rank: 3rd in Section, 7th in Class
```

---

## Components to build

### `components/academic/class-accordion.tsx`
Expandable class list with sections. Inline add section form.

### `components/academic/timetable-grid.tsx`
6×N grid (Sun–Fri, N periods). Cells show subject + teacher.
Empty cells show + button. Click opens slot creation dialog.

### `components/exams/marks-grid.tsx`
Same pattern as AttendanceGrid — forwardRef + useImperativeHandle.
Internal state: Map<studentId, { marks: number | null, isAbsent: boolean, remarks: string }>
Validation: marks <= fullMarks, marks null if isAbsent.

### `components/exams/report-card.tsx`
The formatted report card view. Print-friendly layout.
Add a `<Button onClick={window.print}>Print</Button>` — browser print handles the rest.
Add `@media print` CSS: hide sidebar, header, buttons when printing.

---

## TanStack Query hooks

```typescript
// lib/hooks/use-academic.ts
export function useClasses() {
  return useQuery({ queryKey: ['classes'], queryFn: () => academicApi.listClasses().then(r => r.data.data) });
}
export function useSubjects() {
  return useQuery({ queryKey: ['subjects'], queryFn: () => academicApi.listSubjects().then(r => r.data.data) });
}
export function useSectionTimetable(sectionId: string) {
  return useQuery({
    queryKey: ['timetable', 'section', sectionId],
    queryFn: () => academicApi.getSectionTimetable(sectionId).then(r => r.data.data),
    enabled: !!sectionId,
  });
}

// lib/hooks/use-examination.ts
export function useExamTypes(academicYearId: string) {
  return useQuery({
    queryKey: ['exam-types', academicYearId],
    queryFn: () => examinationApi.listExamTypes({ academicYearId }).then(r => r.data.data),
    enabled: !!academicYearId,
  });
}
export function useMarksForSchedule(scheduleId: string) {
  return useQuery({
    queryKey: ['marks', scheduleId],
    queryFn: () => examinationApi.getMarksForSchedule(scheduleId).then(r => r.data.data),
    enabled: !!scheduleId,
  });
}
export function useReportCard(studentId: string) {
  return useQuery({
    queryKey: ['report-card', studentId],
    queryFn: () => examinationApi.getReportCard(studentId).then(r => r.data.data),
    enabled: !!studentId,
  });
}
export function useComputeResults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: examinationApi.computeResults,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['results', 'class', variables.classId] });
    },
  });
}
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full.
Then read docs/api-contracts/15-academic-exam-ui.md in full.

Sessions 11–14 complete. Student, Attendance, Finance UIs working.
This session builds TWO modules: Academic and Examination.

Work in this exact order:

PART A — Academic module:

1. Add academic types to types/api.types.ts:
   Section, Subject, ClassSubject, TimetableSlot, SectionTimetable,
   TeacherTimetable, TimetableSlotData

2. Create lib/api/academic.api.ts (classes, sections, subjects,
   class-subjects, timetable endpoints)

3. Create lib/hooks/use-academic.ts

4. Build components/academic/class-accordion.tsx:
   Expandable per class, inline sections, add/edit dialogs

5. Build app/(school)/academic/classes/page.tsx

6. Build app/(school)/academic/subjects/page.tsx:
   Two-column: all subjects left, class assignments right

7. Build components/academic/timetable-grid.tsx:
   6-day (Sun–Fri) × N periods. Click empty = add slot dialog.
   Click filled = show details + delete.

8. Build app/(school)/academic/timetable/page.tsx:
   Class + Section selectors → TimetableGrid

PART B — Examination module:

9. Add exam types to types/api.types.ts:
   ExamType, ExamSchedule, MarkRecord, ClassResultRow, ReportCard,
   GradingScale, ComputeResultSummary and all DTOs

10. Create lib/api/examination.api.ts

11. Create lib/hooks/use-examination.ts

12. Build components/exams/marks-grid.tsx:
    Same forwardRef + useImperativeHandle pattern as AttendanceGrid.
    Internal Map state. Validation: marks <= fullMarks.
    Absent checkbox clears marks.

13. Build app/(school)/exams/page.tsx:
    Exam type cards with schedule progress + action buttons

14. Build app/(school)/exams/schedule/page.tsx:
    Table of scheduled exams + bulk add dialog

15. Build app/(school)/exams/marks/page.tsx:
    Exam type + class + subject selectors → MarksGrid → save

16. Build components/exams/report-card.tsx:
    Formatted report card with print support (@media print hides shell)

17. Build app/(school)/exams/results/page.tsx:
    Tab 1: Class rank list + Compute button
    Tab 2: Student search → ReportCard component

Frontend rules (always):
- Never localStorage for tokens
- Always <BsDate> for dates
- Always TanStack Query
- Tailwind only
- shadcn/ui for primitives
- MarksGrid uses same forwardRef pattern as AttendanceGrid
- Print button: window.print(), hide shell with @media print CSS
```

---

## Learning checkpoint for Session 15

After this session, you should be able to answer:
- Why does the timetable use a Record<string, TimetableSlot[]> shape instead of an array?
- What does @media print do and why is it better than a separate print page?
- Why does the MarksGrid use the same forwardRef pattern as AttendanceGrid?
- What does "weighted percentage" mean on the report card?
