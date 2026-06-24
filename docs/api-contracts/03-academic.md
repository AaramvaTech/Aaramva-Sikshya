# Academic Module — Claude Code Session 3 Spec
# Aaramva Shikshya

## Prerequisites
- Sessions 0–2 complete
- students table has class_name VARCHAR, section_name VARCHAR (text columns from Session 2)
- TenantPrismaService, RBAC guards, BS calendar all working
- 30 tests passing

## Goal
Build the Academic module: classes, sections, subjects, timetable.
Wire up proper FK references from the students table to the new classes/sections tables.

---

## Database — add to tenant-schema.sql

```sql
-- ─── ACADEMIC YEAR ────────────────────────────────────────────────────────────
-- (may already exist from Session 2 — add IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS academic_years (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(20)  NOT NULL,       -- "2081-82"
  year_bs      INT          NOT NULL,       -- 2081 (start BS year)
  start_date   DATE         NOT NULL,       -- AD
  end_date     DATE         NOT NULL,       -- AD
  is_current   BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- Only one academic year can be current at a time
CREATE UNIQUE INDEX IF NOT EXISTS uniq_current_academic_year
  ON academic_years (is_current) WHERE is_current = true AND deleted_at IS NULL;

-- ─── CLASSES ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50)  NOT NULL,      -- "Grade 10", "Nursery", "KG", "Class 5"
  alias         VARCHAR(20),               -- "X", "5" — short form for timetable display
  order_index   INT          NOT NULL,      -- for sorting (Nursery=0, KG=1, Grade1=2 …)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (name, deleted_at)               -- unique name per school (among non-deleted)
);

-- ─── SECTIONS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id          UUID         NOT NULL REFERENCES classes(id),
  name              VARCHAR(20)  NOT NULL,  -- "A", "B", "Science", "Management"
  capacity          INT          NOT NULL DEFAULT 40,
  class_teacher_id  UUID         REFERENCES users(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (class_id, name, deleted_at)
);

-- ─── SUBJECTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,        -- "Mathematics", "Nepali", "Science"
  code        VARCHAR(20),                 -- "MTH", "NEP", "SCI"
  type        VARCHAR(20)  NOT NULL DEFAULT 'THEORY',  -- THEORY | PRACTICAL | BOTH
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─── CLASS–SUBJECT MAPPING ────────────────────────────────────────────────────
-- Which subjects are taught in which class (for an academic year)
CREATE TABLE IF NOT EXISTS class_subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id         UUID NOT NULL REFERENCES classes(id),
  subject_id       UUID NOT NULL REFERENCES subjects(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  full_marks       INT  NOT NULL DEFAULT 100,
  pass_marks       INT  NOT NULL DEFAULT 40,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, subject_id, academic_year_id)
);

-- ─── TIMETABLE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable_slots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id       UUID         NOT NULL REFERENCES sections(id),
  subject_id       UUID         NOT NULL REFERENCES subjects(id),
  teacher_id       UUID         NOT NULL REFERENCES users(id),
  academic_year_id UUID         NOT NULL REFERENCES academic_years(id),
  day_of_week      SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
                                          -- 0=Sunday, 1=Monday ... 6=Saturday
                                          -- Nepal schools: Sunday–Friday
  period_number    SMALLINT     NOT NULL, -- 1, 2, 3 ... 8
  start_time       TIME         NOT NULL, -- "10:00"
  end_time         TIME         NOT NULL, -- "10:45"
  room             VARCHAR(50),           -- "Room 12", "Lab 1"
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,

  -- A teacher can't be in two places at once
  UNIQUE (teacher_id, academic_year_id, day_of_week, period_number),
  -- A section can't have two subjects at the same time
  UNIQUE (section_id, academic_year_id, day_of_week, period_number)
);

-- ─── MIGRATE existing students.class_name / section_name ─────────────────────
-- Add FK columns (nullable — filled by migration logic in app code)
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS class_id   UUID REFERENCES classes(id),
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id);
-- NOTE: Do NOT drop class_name / section_name yet.
-- They remain as fallback until all students are migrated.
-- Drop them in Session 4 after confirming migration integrity.
```

---

## API Endpoints

All endpoints prefixed with `/api/v1/` — handled by global prefix in main.ts.

### Academic Years

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /academic-years | SCHOOL_OWNER, PRINCIPAL | Create new year |
| GET | /academic-years | All authenticated | List all years |
| GET | /academic-years/current | All authenticated | Get current year |
| PATCH | /academic-years/:id | PRINCIPAL+ | Update name/dates |
| PATCH | /academic-years/:id/set-current | PRINCIPAL+ | Make this the current year (unsets previous) |
| DELETE | /academic-years/:id | SCHOOL_OWNER | Soft delete |

### Classes

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /classes | PRINCIPAL+ | Create class |
| GET | /classes | All authenticated | List all classes with section count |
| GET | /classes/:id | All authenticated | Class detail with sections |
| PATCH | /classes/:id | PRINCIPAL+ | Update |
| DELETE | /classes/:id | SCHOOL_OWNER | Soft delete |
| POST | /classes/:id/sections | PRINCIPAL+ | Add section to class |
| GET | /classes/:id/sections | All authenticated | List sections of a class |
| PATCH | /classes/:id/sections/:sectionId | PRINCIPAL+ | Update section |
| DELETE | /classes/:id/sections/:sectionId | SCHOOL_OWNER | Soft delete section |

### Subjects

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /subjects | ACADEMIC_COORDINATOR+ | Create subject |
| GET | /subjects | All authenticated | List all subjects |
| PATCH | /subjects/:id | ACADEMIC_COORDINATOR+ | Update |
| DELETE | /subjects/:id | PRINCIPAL+ | Soft delete |
| POST | /classes/:id/subjects | ACADEMIC_COORDINATOR+ | Assign subject to class for current year |
| GET | /classes/:id/subjects | All authenticated | Subjects for a class (current year) |
| DELETE | /classes/:id/subjects/:subjectId | PRINCIPAL+ | Remove subject from class |

### Timetable

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /timetable | ACADEMIC_COORDINATOR+ | Add one slot |
| GET | /timetable/section/:sectionId | All authenticated | Full week timetable for a section |
| GET | /timetable/teacher/:teacherId | TEACHER+ | Teacher's personal timetable |
| PUT | /timetable/section/:sectionId/bulk | ACADEMIC_COORDINATOR+ | Replace entire week for a section |
| DELETE | /timetable/:slotId | ACADEMIC_COORDINATOR+ | Delete a slot |

---

## Key DTOs

```typescript
// CreateAcademicYearDto
{
  name: string;        // "2081-82"
  yearBs: number;      // 2081
  startDate: string;   // ISO AD date e.g. "2024-04-14"
  endDate: string;     // ISO AD date e.g. "2025-04-13"
}

// CreateClassDto
{
  name: string;        // "Grade 10"
  alias?: string;      // "X"
  orderIndex: number;  // 10
}

// CreateSectionDto
{
  name: string;          // "A"
  capacity?: number;     // default 40
  classTeacherId?: string;
}

// CreateSubjectDto
{
  name: string;    // "Mathematics"
  code?: string;   // "MTH"
  type?: 'THEORY' | 'PRACTICAL' | 'BOTH';  // default THEORY
}

// AssignSubjectToClassDto
{
  subjectId: string;
  academicYearId: string;
  fullMarks?: number;   // default 100
  passMarks?: number;   // default 40
}

// CreateTimetableSlotDto
{
  sectionId: string;
  subjectId: string;
  teacherId: string;
  academicYearId: string;
  dayOfWeek: number;     // 0–6
  periodNumber: number;  // 1–8
  startTime: string;     // "10:00"
  endTime: string;       // "10:45"
  room?: string;
}

// BulkTimetableDto
{
  academicYearId: string;
  slots: Omit<CreateTimetableSlotDto, 'sectionId' | 'academicYearId'>[];
}
```

---

## Business logic rules (enforce these in service layer)

1. **set-current academic year**: wrap in a transaction —
   `UPDATE academic_years SET is_current = false` (all rows),
   then `UPDATE academic_years SET is_current = true WHERE id = :id`.

2. **Timetable conflict detection**: before inserting a slot, check:
   - Does this teacher already have a slot on the same day + period? → throw `ConflictException`
   - Does this section already have a slot on the same day + period? → throw `ConflictException`

3. **Bulk timetable**: delete all existing slots for the section+year first (soft delete),
   then insert the new set — all in one transaction.

4. **Class deletion guard**: if a class has enrolled students in the current academic year,
   throw `BadRequestException('Cannot delete class with active enrollments')`.

5. **Section deletion guard**: same check — any students currently in this section?

6. **orderIndex auto-sort**: `GET /classes` always returns sorted by `order_index ASC`.

---

## Response shapes

```typescript
// GET /classes (list)
{
  id, name, alias, orderIndex,
  sectionCount: number,        // count of non-deleted sections
  studentCount: number,        // count of students enrolled in current year
  sections: [{ id, name, capacity, classTeacherName }]
}

// GET /timetable/section/:sectionId
{
  sectionId, sectionName, className,
  schedule: {
    0: [],   // Sunday
    1: [     // Monday
      {
        slotId, periodNumber, startTime, endTime,
        subject: { id, name, code },
        teacher: { id, fullName },
        room
      }
    ],
    ...6
  }
}

// GET /timetable/teacher/:teacherId
// Same structure but grouped differently — shows all sections this teacher teaches
{
  teacherId, teacherName,
  schedule: {
    1: [{ periodNumber, startTime, endTime, subject, section, class, room }],
    ...
  }
}
```

---

## Migration service — wire up existing students

Create `AcademicMigrationService` with one method:
`migrateStudentClassReferences(tenantSlug: string): Promise<{ migrated: number, failed: number }>`

Logic:
```
For each student where class_id IS NULL and class_name IS NOT NULL:
  1. Find or create a class record matching class_name
  2. Find or create a section record matching section_name under that class
  3. UPDATE students SET class_id = ?, section_id = ? WHERE id = ?
```

Expose as: `POST /academic/migrate-student-refs` — role: SCHOOL_OWNER only.
This is a one-time migration endpoint, not part of normal operations.

---

## Tests to write

```typescript
// AcademicYearService
- createAcademicYear creates record correctly
- setCurrentYear unsets previous current year in same transaction
- setCurrentYear throws if year not found

// ClassService
- createClass creates with correct orderIndex
- deleteClass throws if students enrolled
- getSectionsForClass returns only non-deleted sections

// SubjectService
- assignSubjectToClass creates class_subject record
- assignSubjectToClass throws on duplicate (same class + subject + year)

// TimetableService
- createSlot throws ConflictException if teacher already busy (same day + period)
- createSlot throws ConflictException if section already busy (same day + period)
- bulkReplaceTimetable soft-deletes old slots before inserting new ones
- getTeacherTimetable groups slots by day correctly

// AcademicMigrationService
- migrateStudentClassReferences creates classes/sections from text columns
- migrateStudentClassReferences is idempotent (safe to run twice)
```

---

## Exact prompt to paste into Claude Code

```
Read CLAUDE.md in full first. Confirm you've read it before starting.
Then read docs/api-contracts/03-academic.md in full.

Sessions 0–2 are complete. What exists:
- TenantPrismaService with schema switching (all DB access goes through this)
- Auth, RBAC guards, @Roles(), @CurrentUser() all working
- Student module with 30 passing tests
- students table has class_name VARCHAR and section_name VARCHAR as text columns

Session 3 task: Build the Academic module.

Work in this exact order:

1. Add all new tables to tenant-schema.sql (from the spec):
   academic_years, classes, sections, subjects, class_subjects, timetable_slots
   Also add the ALTER TABLE to add class_id and section_id FK columns to students.
   Use IF NOT EXISTS on all CREATE TABLE statements.

2. Build AcademicYearModule — service + controller + DTOs + tests.
   Key: setCurrentYear must use a transaction to unset previous, then set new.

3. Build ClassModule — classes + sections together in one module.
   Key: deleteClass must guard against active enrollments.

4. Build SubjectModule — subjects + class_subject assignments.

5. Build TimetableModule — slots + conflict detection + bulk replace.
   Key: conflict detection must check BOTH teacher conflicts AND section conflicts.

6. Build AcademicMigrationService — migrate students.class_name text → class_id FK.
   Must be idempotent (safe to run multiple times).

7. Wire all controllers with correct @Roles() guards (see spec for each endpoint).

8. Run all tests — both the existing 30 AND the new academic tests.
   Report final count. Target: 30 existing + ~15 new = 45+ passing.

Rules (same as always):
- TenantPrismaService for ALL queries — never default PrismaService
- All dates: store AD, return { ad, bs } using adToBs from 'bs-calendar'
- Soft deletes only — never hard DELETE
- Standard response format via global interceptor
- Every controller method needs @Roles() guard
- List endpoints: always paginate with ?page and ?limit
```

---

## Learning checkpoint for Session 3

After this session, you should be able to answer:
- What is a database transaction and why does setCurrentYear need one?
- What is a unique constraint and how does it prevent duplicate timetable slots?
- What is a foreign key and how does class_id in students point to classes?
- What does "idempotent" mean and why is it important for migration scripts?
