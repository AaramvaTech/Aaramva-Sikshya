# Examination Module — Claude Code Session 7 Spec
# Aaramva Shikshya

## Prerequisites
- Sessions 0–6 complete, 95 tests passing (96 after fixing pre-existing bug)
- classes, sections, subjects, class_subjects, students, academic_years all exist
- staff_profiles exists (for exam invigilators)
- EventEmitterModule registered in AppModule

## Goal
Build the Examination module:
- Exam types (Terminal, Half-Yearly, Final, Unit Test)
- Exam schedules (which subject, which date, which room)
- Marks entry (per student per subject)
- Grade calculation (with configurable grading scales)
- Report card generation (structured data — PDF rendering is Session 9 frontend)
- Rank lists

---

## How exams work in Nepal (important context)

Most Nepal schools run 3 exam cycles per year:
  1. First Terminal (around Bhadra/Ashwin — Aug/Sep)
  2. Second Terminal / Half-Yearly (around Poush/Magh — Dec/Jan)
  3. Final / Annual (around Chaitra/Baisakh — Mar/Apr)

Each exam cycle covers all subjects for all classes.
Marks from all three cycles combine into a final result
(weightings vary by school — e.g. 20% + 30% + 50%).

Grading follows NEB (National Examination Board) style for higher classes,
and simpler percentage/division systems for lower classes.

---

## Database — add to tenant-schema.sql

```sql
-- ─── GRADING SCALES ───────────────────────────────────────────────────────────
-- A school can define multiple grading scales (NEB style, percentage, GPA)
CREATE TABLE IF NOT EXISTS grading_scales (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) NOT NULL,      -- "NEB Grade Scale", "Primary Scale"
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS grade_thresholds (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  grading_scale_id UUID        NOT NULL REFERENCES grading_scales(id),
  grade            VARCHAR(5)  NOT NULL,  -- "A+", "A", "B+", "B", "C", "D", "NG"
  gpa_point        NUMERIC(3,2),          -- 4.0, 3.6, 3.2 ... (NULL for non-GPA scales)
  min_percent      NUMERIC(5,2) NOT NULL, -- 90, 80, 70 ...
  max_percent      NUMERIC(5,2) NOT NULL, -- 100, 89.99, 79.99 ...
  remarks          VARCHAR(50),           -- "Outstanding", "Excellent", "Very Good"
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── EXAM TYPES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_types (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(50) NOT NULL,  -- "First Terminal", "Half Yearly", "Final"
  weight_percent   NUMERIC(5,2) NOT NULL DEFAULT 100,
                               -- contribution to annual result (20, 30, 50 etc.)
  academic_year_id UUID        NOT NULL REFERENCES academic_years(id),
  grading_scale_id UUID        REFERENCES grading_scales(id),
  order_index      SMALLINT    NOT NULL,  -- 1, 2, 3 for sorting
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (name, academic_year_id)
);

-- ─── EXAM SCHEDULES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_schedules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type_id     UUID        NOT NULL REFERENCES exam_types(id),
  class_id         UUID        NOT NULL REFERENCES classes(id),
  subject_id       UUID        NOT NULL REFERENCES subjects(id),
  exam_date        DATE        NOT NULL,  -- AD
  start_time       TIME        NOT NULL,
  end_time         TIME        NOT NULL,
  full_marks       NUMERIC(6,2) NOT NULL,
  pass_marks       NUMERIC(6,2) NOT NULL,
  theory_marks     NUMERIC(6,2),          -- if split theory/practical
  practical_marks  NUMERIC(6,2),
  room             VARCHAR(50),
  invigilator_id   UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (exam_type_id, class_id, subject_id)
);

-- ─── MARKS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marks (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_schedule_id   UUID        NOT NULL REFERENCES exam_schedules(id),
  student_id         UUID        NOT NULL REFERENCES students(id),
  marks_obtained     NUMERIC(6,2),        -- NULL = absent
  theory_marks       NUMERIC(6,2),
  practical_marks    NUMERIC(6,2),
  is_absent          BOOLEAN     NOT NULL DEFAULT false,
  is_expelled        BOOLEAN     NOT NULL DEFAULT false,  -- removed from exam
  remarks            TEXT,
  entered_by         UUID        NOT NULL REFERENCES users(id),
  entered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_schedule_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_exam    ON marks(exam_schedule_id);

-- ─── RESULTS (computed + stored for performance) ──────────────────────────────
-- Computed once after all marks are entered, stored for fast report cards
CREATE TABLE IF NOT EXISTS student_results (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID        NOT NULL REFERENCES students(id),
  exam_type_id        UUID        NOT NULL REFERENCES exam_types(id),
  academic_year_id    UUID        NOT NULL REFERENCES academic_years(id),
  total_marks         NUMERIC(8,2) NOT NULL,
  obtained_marks      NUMERIC(8,2) NOT NULL,
  percentage          NUMERIC(5,2) NOT NULL,
  gpa                 NUMERIC(3,2),
  grade               VARCHAR(5),
  division            VARCHAR(20),   -- "First Division", "Second Division", etc.
  rank_in_section     INT,
  rank_in_class       INT,
  is_pass             BOOLEAN     NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'PASS',
                                  -- PASS | FAIL | ABSENT | EXPELLED
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, exam_type_id)
);

-- Per-subject result breakdown (for report card subject rows)
CREATE TABLE IF NOT EXISTS student_subject_results (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_result_id UUID        NOT NULL REFERENCES student_results(id) ON DELETE CASCADE,
  subject_id        UUID        NOT NULL REFERENCES subjects(id),
  subject_name      VARCHAR(100) NOT NULL,  -- snapshot
  full_marks        NUMERIC(6,2) NOT NULL,
  marks_obtained    NUMERIC(6,2),
  theory_marks      NUMERIC(6,2),
  practical_marks   NUMERIC(6,2),
  is_absent         BOOLEAN     NOT NULL DEFAULT false,
  percentage        NUMERIC(5,2),
  grade             VARCHAR(5),
  is_pass           BOOLEAN     NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## API Endpoints

### Grading Scales

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /exams/grading-scales | PRINCIPAL+ | Create scale with thresholds |
| GET | /exams/grading-scales | TEACHER+ | List scales |
| GET | /exams/grading-scales/:id | TEACHER+ | Detail with thresholds |
| PATCH | /exams/grading-scales/:id/set-default | PRINCIPAL+ | Set as school default |

### Exam Types

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /exams/types | PRINCIPAL, ACADEMIC_COORDINATOR | Create exam type |
| GET | /exams/types | TEACHER+ | List for current academic year |
| PATCH | /exams/types/:id | ACADEMIC_COORDINATOR+ | Update |
| DELETE | /exams/types/:id | PRINCIPAL+ | Soft delete |

### Exam Schedules

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /exams/schedules | ACADEMIC_COORDINATOR+ | Create one schedule entry |
| POST | /exams/schedules/bulk | ACADEMIC_COORDINATOR+ | Bulk create for a class |
| GET | /exams/schedules | TEACHER+ | List schedules (filter by class, exam type) |
| PATCH | /exams/schedules/:id | ACADEMIC_COORDINATOR+ | Update |
| DELETE | /exams/schedules/:id | PRINCIPAL+ | Soft delete |

### Marks

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /exams/marks/bulk | TEACHER+ | Bulk enter marks for a schedule |
| GET | /exams/marks | TEACHER+ | Get marks for a schedule |
| PATCH | /exams/marks/:id | TEACHER+ | Update single mark entry |

### Results

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /exams/results/compute | ACADEMIC_COORDINATOR+ | Compute results for an exam type + class |
| GET | /exams/results/class/:classId | TEACHER+ | Class result sheet (rank list) |
| GET | /exams/results/student/:studentId | TEACHER+ | Student result across all exam types |
| GET | /exams/results/report-card/:studentId | TEACHER+ | Full report card data |

---

## Key DTOs

```typescript
// CreateGradingScaleDto
{
  name: string;
  thresholds: {
    grade: string;           // "A+", "A", "B+" ...
    gpaPoint?: number;
    minPercent: number;
    maxPercent: number;
    remarks?: string;
  }[];
}

// CreateExamTypeDto
{
  name: string;
  weightPercent: number;     // must sum to 100 across all exam types in a year
  academicYearId: string;
  gradingScaleId?: string;
  orderIndex: number;
}

// BulkCreateScheduleDto
{
  examTypeId: string;
  classId: string;
  subjects: {
    subjectId: string;
    examDate: string;        // AD
    startTime: string;
    endTime: string;
    fullMarks: number;
    passMarks: number;
    theoryMarks?: number;
    practicalMarks?: number;
    room?: string;
    invigilatorId?: string;
  }[];
}

// BulkEnterMarksDto
{
  examScheduleId: string;
  marks: {
    studentId: string;
    marksObtained?: number;  // NULL if absent
    theoryMarks?: number;
    practicalMarks?: number;
    isAbsent?: boolean;
    remarks?: string;
  }[];
}

// ComputeResultsDto
{
  examTypeId: string;
  classId: string;
  sectionId?: string;        // if omitted, compute for whole class
}
```

---

## Business logic rules

### 1. Marks validation
- `marks_obtained` cannot exceed `exam_schedules.full_marks`
- If `is_absent = true`, `marks_obtained` must be NULL
- If theory + practical split: `theory_marks + practical_marks` must equal `marks_obtained`
- Throw `BadRequestException` for violations

### 2. Grade calculation
```typescript
function calculateGrade(percentage: number, scale: GradingScale): string {
  // Find threshold where min_percent <= percentage <= max_percent
  // Return that threshold's grade
  // If no threshold found → return 'NG' (Not Graded)
}
```

### 3. Pass/fail determination
- A student passes if `marks_obtained >= pass_marks` for ALL subjects
- If any subject is failed → overall status = 'FAIL'
- If absent in any subject → status = 'ABSENT' (can still pass remaining subjects)

### 4. Result computation — steps
```
ComputeResults for examTypeId + classId:
  1. Get all exam_schedules for this examTypeId + classId
  2. For each enrolled student in the class:
     a. Get all marks rows for this student across all schedules
     b. For each subject:
        - Calculate percentage = marks_obtained / full_marks * 100
        - Look up grade from grading scale
        - is_pass = marks_obtained >= pass_marks
     c. Sum total_marks = SUM(full_marks for all subjects)
     d. Sum obtained_marks = SUM(marks_obtained, treat absent as 0)
     e. Overall percentage = obtained_marks / total_marks * 100
     f. Overall grade from grading scale
     g. is_pass = all subjects passed
     h. UPSERT into student_results
     i. UPSERT all subject rows into student_subject_results
  3. After all students computed — calculate ranks:
     - Sort by obtained_marks DESC
     - Assign rank_in_section (among students in same section)
     - Assign rank_in_class (among all students in class)
     - UPDATE student_results with ranks
  4. Return summary: { computed: N, passed: N, failed: N, absent: N }
```

### 5. Report card data shape
```typescript
{
  student: {
    id, admissionNumber, fullName, rollNumber,
    className, sectionName, academicYear
  },
  examResults: {           // one per exam type (Terminal 1, Terminal 2, Final)
    examType: { id, name, weightPercent, orderIndex },
    percentage, grade, gpa, rankInSection, rankInClass, isPassed, status,
    subjects: {
      subjectId, subjectName, fullMarks, marksObtained,
      theoryMarks, practicalMarks, percentage, grade, isPassed, isAbsent
    }[]
  }[],
  annualResult: {          // weighted combination of all exam types
    weightedPercentage: number,
    finalGrade: string,
    finalGpa: number,
    division: string,      // "First", "Second", "Third", "Fail"
    isPassed: boolean
  }
}
```

### 6. Annual result — weighted combination
```
weightedTotal = SUM(examType.weightPercent * result.percentage / 100)
               for each exam type result

division:
  weightedTotal >= 60 → "First Division"
  weightedTotal >= 45 → "Second Division"
  weightedTotal >= 32 → "Third Division"
  else               → "Fail"
```

### 7. Exam type weights validation
When creating exam types for a year, warn (don't block) if total weight ≠ 100%.
Add a field in response: `{ totalWeight: 80, isComplete: false }`.

---

## Tests to write

```typescript
// GradingScaleService
- calculateGrade returns 'A+' for 95% on NEB scale
- calculateGrade returns 'NG' for percentage outside all thresholds

// MarksService
- bulkEnterMarks throws if marksObtained > fullMarks
- bulkEnterMarks throws if isAbsent=true and marksObtained provided
- bulkEnterMarks uses UPSERT (safe to submit twice)

// ResultService
- computeResults sets is_pass=false if any subject failed
- computeResults sets status='ABSENT' if any subject absent
- computeResults calculates percentage correctly
- computeResults assigns rank_in_section correctly (1st, 2nd, 3rd)
- computeResults is idempotent (safe to run twice — updates existing)
- getReportCard returns all exam types with subject breakdown
- annualResult weightedPercentage calculated correctly (20%+30%+50%)
```

---

## Fix for pre-existing bug (do this FIRST in Session 7)

Before building the Examination module, fix the failing test:

The student-attendance "future date" test is failing.
Likely cause: the test is using a fixed date that is now in the past,
OR the timezone comparison is off (Nepal is UTC+5:45).

Fix approach:
```typescript
// In student-attendance.service.ts, the future date check should use:
const today = new Date();
today.setHours(0, 0, 0, 0);
const inputDate = new Date(date);
inputDate.setHours(0, 0, 0, 0);
if (inputDate > today) {
  throw new BadRequestException('Cannot mark attendance for future dates');
}

// In the test, use a date that is ALWAYS in the future:
const futureDate = new Date();
futureDate.setFullYear(futureDate.getFullYear() + 1);
const futureDateStr = futureDate.toISOString().split('T')[0];
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full. Confirm you have read it.
Then read docs/api-contracts/07-examination.md in full.

Sessions 0–6 complete. 95 tests passing (1 known pre-existing failure
in student-attendance future-date test).

Session 7 has TWO parts:

PART A — Fix the pre-existing failing test first:
The student-attendance "future date" test fails because the test uses
a hardcoded future date that may be in the past, or the timezone
comparison is off.
Fix the test to use: new Date() + 1 year as the future date.
Fix the service to compare dates at midnight (strip time component).
Run npm test — confirm 96 tests passing before starting Part B.

PART B — Build the Examination module:

Work in this order:

1. Add exam tables to tenant-schema.sql with IF NOT EXISTS:
   grading_scales, grade_thresholds, exam_types, exam_schedules,
   marks, student_results, student_subject_results

2. Build GradingScaleService:
   - createScale with thresholds (single transaction)
   - calculateGrade(percentage, scaleId) — core utility used everywhere
   - setDefault (unset previous default first)

3. Build ExamTypeService:
   - CRUD + weight validation warning
   - getExamTypesForYear() always sorted by order_index

4. Build ExamScheduleService:
   - createSchedule + bulkCreate
   - Validate no duplicate subject for same exam_type + class

5. Build MarksService:
   - bulkEnterMarks() — UPSERT with full validation
   - getMarksForSchedule() — returns all students with their marks

6. Build ResultService:
   - computeResults() — full pipeline from spec (marks → grade → rank)
   - Must be idempotent (UPSERT student_results)
   - Ranks computed after all students in class are processed
   - getReportCard() — nested full report card data
   - getClassRankList() — sorted by obtained_marks DESC

7. Wire ExaminationController with all endpoints + correct @Roles() guards.

8. Write all tests. Run full suite.
   Target: 96 (after fix) + ~11 new = 107+ passing.

Rules (same as always):
- TenantPrismaService for ALL queries
- Dates: store AD, return { ad, bs }
- Money/marks as NUMERIC — no JS floats
- Soft deletes only
- Standard response format
- Every controller method needs @Roles() guard
- computeResults must run in a transaction (marks read + results write)
```

---

## Learning checkpoint for Session 7

After this session, you should be able to answer:
- What is a "computed/stored" column in PostgreSQL and when is it useful?
- Why do we store results in a separate table instead of computing them on every request?
- What does "weighted average" mean in the context of terminal exams?
- Why is rank calculation done after all students are processed, not per-student?
