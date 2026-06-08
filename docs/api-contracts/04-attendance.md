# Attendance Module — Claude Code Session 4 Spec
# Aaramva Shikshya

## Prerequisites
- Sessions 0–3 complete, 48 tests passing
- classes, sections, academic_years, students tables exist
- timetable_slots table exists (period schedule)
- All tenant DB access via TenantPrismaService raw SQL

## Goal
Build the Attendance module:
- Daily student attendance (present / absent / late / leave)
- Staff attendance
- Attendance summary per student, class, school
- Absent notification hook (for future SMS — just emit an event for now)

---

## Database — add to tenant-schema.sql

```sql
-- ─── STUDENT ATTENDANCE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_attendance (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID      NOT NULL REFERENCES students(id),
  section_id       UUID      NOT NULL REFERENCES sections(id),
  academic_year_id UUID      NOT NULL REFERENCES academic_years(id),
  date             DATE      NOT NULL,              -- AD date
  status           VARCHAR(10) NOT NULL,            -- PRESENT | ABSENT | LATE | LEAVE
  remarks          TEXT,
  marked_by        UUID      NOT NULL REFERENCES users(id),
  marked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One record per student per day per academic year
  UNIQUE (student_id, date, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_section_date
  ON student_attendance (section_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_student
  ON student_attendance (student_id, academic_year_id);

-- ─── STAFF ATTENDANCE ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_attendance (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID      NOT NULL REFERENCES users(id),
  date        DATE      NOT NULL,
  status      VARCHAR(10) NOT NULL,                 -- PRESENT | ABSENT | LATE | LEAVE | HOLIDAY
  check_in    TIME,
  check_out   TIME,
  remarks     TEXT,
  marked_by   UUID      NOT NULL REFERENCES users(id),
  marked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date
  ON staff_attendance (user_id, date);

-- ─── LEAVE APPLICATIONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_applications (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID      NOT NULL REFERENCES students(id),
  academic_year_id UUID      NOT NULL REFERENCES academic_years(id),
  from_date        DATE      NOT NULL,
  to_date          DATE      NOT NULL,
  reason           TEXT      NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
  applied_by       UUID      NOT NULL REFERENCES users(id), -- parent or student
  reviewed_by      UUID      REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
```

---

## API Endpoints

### Student Attendance

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /attendance/students/bulk | TEACHER+ | Mark attendance for whole section |
| GET | /attendance/students | TEACHER+ | Query attendance (filter by section, date, student) |
| GET | /attendance/students/:studentId/summary | TEACHER+ | Per-student summary for current year |
| GET | /attendance/students/section/:sectionId/report | TEACHER+ | Section attendance for a date range |
| GET | /attendance/students/school/summary | PRINCIPAL+ | School-wide attendance for today |

### Staff Attendance

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /attendance/staff/bulk | PRINCIPAL, ACADEMIC_COORDINATOR | Mark staff attendance |
| GET | /attendance/staff | PRINCIPAL+ | List staff attendance (filter by date) |
| GET | /attendance/staff/:userId/summary | PRINCIPAL+ | Per-staff summary for current month |

### Leave Applications

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /attendance/leave | PARENT, STUDENT, TEACHER+ | Apply for leave |
| GET | /attendance/leave | TEACHER+ | List leave applications |
| PATCH | /attendance/leave/:id/review | PRINCIPAL, ACADEMIC_COORDINATOR | Approve or reject |

---

## Key DTOs

```typescript
// BulkStudentAttendanceDto
{
  sectionId: string;
  academicYearId: string;
  date: string;                     // AD date "2024-04-15"
  records: {
    studentId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
    remarks?: string;
  }[];
}

// GetAttendanceQueryDto
{
  sectionId?: string;
  studentId?: string;
  date?: string;                    // exact date
  fromDate?: string;
  toDate?: string;
  academicYearId?: string;
  status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
  page?: number;
  limit?: number;
}

// ReviewLeaveDto
{
  status: 'APPROVED' | 'REJECTED';
  remarks?: string;
}
```

---

## Business logic rules

### 1. Bulk attendance — UPSERT, not INSERT
Use PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` so submitting twice is safe:

```sql
INSERT INTO student_attendance
  (student_id, section_id, academic_year_id, date, status, remarks, marked_by)
VALUES
  ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (student_id, date, academic_year_id)
DO UPDATE SET
  status     = EXCLUDED.status,
  remarks    = EXCLUDED.remarks,
  marked_by  = EXCLUDED.marked_by,
  updated_at = NOW();
```

Run all records in a single transaction.

### 2. Validate students belong to section
Before bulk insert: verify all `studentId` values in the payload are actually
enrolled in `sectionId` for the given `academicYearId`.
Throw `BadRequestException` for any studentId not in the section.

### 3. Cannot mark future dates
If `date` is after today's AD date → throw `BadRequestException('Cannot mark attendance for future dates')`.

### 4. Absent event (prepare for SMS in Session 8)
After bulk insert, collect all `ABSENT` records and emit a NestJS event:
```typescript
this.eventEmitter.emit('attendance.absent', {
  tenantSlug,
  date,
  absentStudents: [{ studentId, studentName, parentPhone }]
});
```
Install `@nestjs/event-emitter` and register `EventEmitterModule.forRoot()` in AppModule.
The listener will be wired in Session 8 (Communication module). For now just emit.

### 5. Student attendance summary response
```typescript
{
  studentId, studentName,
  academicYearId,
  totalWorkingDays: number,    // days school was open (has any attendance records for the section)
  present: number,
  absent: number,
  late: number,
  leave: number,
  attendancePercent: number,   // (present + late) / totalWorkingDays * 100, rounded to 1 decimal
  // last 30 days breakdown — array of { date (AD+BS), status }
  recentHistory: { ad: string, bs: string, status: string }[]
}
```

### 6. School-wide summary (today)
```typescript
{
  date: { ad, bs },
  totalStudents: number,
  present: number,
  absent: number,
  late: number,
  leave: number,
  notMarked: number,            // students with no record today
  attendanceRate: number,       // percent
  byClass: {
    classId, className,
    present, absent, total, rate
  }[]
}
```

### 7. Section report (date range)
Returns a 2D structure — students as rows, dates as columns:
```typescript
{
  sectionId, sectionName, className,
  fromDate: { ad, bs },
  toDate: { ad, bs },
  dates: string[],              // AD dates in range that have records
  students: {
    studentId, admissionNumber, fullName, rollNumber,
    attendance: Record<string, 'P' | 'A' | 'L' | 'LV' | '-'>
    // key = AD date string, value = single-char status or '-' if no record
    summary: { present, absent, late, leave, total, percent }
  }[]
}
```

---

## Tests to write

```typescript
// StudentAttendanceService
- bulkMark inserts N records for N students in a section
- bulkMark is idempotent — submitting same data twice keeps only one record per student
- bulkMark throws if a studentId is not enrolled in the section
- bulkMark throws BadRequestException for future date
- bulkMark emits 'attendance.absent' event for absent students
- getStudentSummary calculates attendancePercent correctly
- getStudentSummary returns correct totalWorkingDays

// StaffAttendanceService
- bulkMarkStaff upserts correctly
- getStaffSummary returns correct counts for a month

// LeaveService
- applyLeave creates PENDING record
- reviewLeave sets status to APPROVED and records reviewedBy + reviewedAt
- reviewLeave throws if leave already reviewed
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full. Confirm you have read it.
Then read docs/api-contracts/04-attendance.md in full.

Sessions 0–3 are complete. 48 tests passing. Academic module is done —
classes, sections, subjects, timetable all exist.

Session 4 task: Build the Attendance module.

Work in this exact order:

1. Add student_attendance, staff_attendance, leave_applications tables
   to tenant-schema.sql using IF NOT EXISTS.

2. Install @nestjs/event-emitter:
   cd apps/api && npm install @nestjs/event-emitter
   Register EventEmitterModule.forRoot() in AppModule.

3. Build StudentAttendanceService with:
   - bulkMark() using UPSERT (INSERT ... ON CONFLICT DO UPDATE) in a transaction
   - Validate all studentIds belong to the section before inserting
   - Reject future dates
   - Emit 'attendance.absent' event after insert
   - getByQuery() — filtered list with pagination
   - getStudentSummary() — totals + percent + last 30 days history
   - getSectionReport() — 2D date-range report (students × dates)
   - getSchoolSummary() — today's school-wide stats grouped by class

4. Build StaffAttendanceService with:
   - bulkMark() with upsert
   - getByQuery() filtered list
   - getStaffSummary() — monthly totals per staff member

5. Build LeaveService:
   - applyLeave() — creates PENDING record
   - reviewLeave() — APPROVED or REJECTED, records reviewer + timestamp
   - Throws if already reviewed

6. Wire AttendanceController with all endpoints and correct @Roles() guards.
   Mount under /attendance prefix in AttendanceModule.

7. Write all tests listed in the spec.
   Run full test suite — target: 48 existing + ~12 new = 60+ passing.

Rules (always):
- TenantPrismaService for ALL queries
- All dates: store AD, return { ad, bs } using adToBs from 'bs-calendar'
- Soft deletes only
- Standard response format via global interceptor
- Every controller method needs @Roles() guard
- List endpoints must support pagination
```

---

## Learning checkpoint for Session 4

After this session, you should be able to answer:
- What is an UPSERT and why is it better than INSERT for attendance?
- What does a database index do and why did we add indexes on attendance?
- What is an event emitter and why emit an event instead of calling SMS directly?
- What does "atomically" mean when we say bulk insert runs atomically?
