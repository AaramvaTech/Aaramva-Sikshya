# Student Module — Design Spec

**Date:** 2026-06-04
**Module:** Student (Session 2)
**Depends on:** Foundation (Session 1 — Auth, RBAC, TenantPrismaService)
**Blocks:** Academic module (Session 3) will add FK constraints to class_id/section_id

---

## Overview

The Student module covers the full lifecycle of a student at a school tenant: admission, profile management, status transitions, and soft deletion. Class/section assignment is stored as plain text now; Session 3 will replace these with FK references to the `classes` and `sections` tables.

---

## Database

### New table: `students` (added to `tenant-schema.sql`)

```sql
CREATE TABLE students (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL,
  student_id        VARCHAR(20)  UNIQUE NOT NULL,  -- e.g. "2081-0001"

  -- Personal info
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  date_of_birth     DATE         NOT NULL,          -- stored as AD
  gender            VARCHAR(10)  NOT NULL,           -- MALE | FEMALE | OTHER
  blood_group       VARCHAR(5),
  religion          VARCHAR(50),
  ethnicity         VARCHAR(50),
  nationality       VARCHAR(50)  DEFAULT 'Nepali',
  mother_tongue     VARCHAR(50),

  -- Contact
  phone             VARCHAR(20),
  email             VARCHAR(255),

  -- Addresses (JSONB: { province, district, municipality, ward, street })
  permanent_address JSONB,
  temporary_address JSONB,

  -- Guardians (JSONB)
  -- {
  --   father:         { name, phone, occupation, email },
  --   mother:         { name, phone, occupation, email },
  --   local_guardian: { name, phone, occupation, email, relation }
  -- }
  guardians         JSONB,

  -- Academic (text for now; FK'd in Session 3)
  class_name        VARCHAR(50),
  section_name      VARCHAR(50),
  roll_number       INT,
  admission_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
  academic_year     VARCHAR(20),        -- "2081-2082"
  previous_school   VARCHAR(255),

  -- Documents
  photo_url         TEXT,
  documents         JSONB        DEFAULT '[]',
  -- [{ type: "birth_certificate"|"character_certificate"|"transfer_certificate"|"other",
  --    url: "...", name: "...", uploaded_at: "..." }]

  -- Status
  status            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | PASSED_OUT | EXPELLED | TRANSFERRED | DROPPED

  -- Audit
  created_by        UUID         REFERENCES users(id),
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_students_student_id  ON students(student_id);
CREATE INDEX idx_students_class       ON students(class_name, section_name);
CREATE INDEX idx_students_name        ON students(first_name, last_name);
CREATE INDEX idx_students_status      ON students(status) WHERE deleted_at IS NULL;
```

---

## Student ID Generation

- Use `packages/bs-calendar` to get the current BS year (e.g. `2081`).
- Query: `SELECT MAX(student_id) FROM students WHERE student_id LIKE '2081-%'`
- Parse the sequence number, increment by 1, zero-pad to 4 digits.
- First student of the year gets `2081-0001`.
- Generation runs inside the same transaction as the INSERT to avoid races under concurrent admissions.

---

## API Endpoints

Base path: `/api/v1/students`

### POST `/students` — Admit a new student

**Roles:** SCHOOL_OWNER, PRINCIPAL, ACADEMIC_COORDINATOR

**Request body (`CreateStudentDto`):**
```json
{
  "firstName": "Aarav",
  "lastName": "Sharma",
  "dateOfBirth": "2010-05-15",        // AD date string
  "gender": "MALE",
  "bloodGroup": "O+",
  "phone": "9841000000",
  "email": "aarav@example.com",
  "permanentAddress": {
    "province": "Bagmati",
    "district": "Kathmandu",
    "municipality": "Kathmandu Metropolitan City",
    "ward": "10",
    "street": "Baluwatar"
  },
  "temporaryAddress": null,
  "guardians": {
    "father": { "name": "Ram Sharma", "phone": "9841111111", "occupation": "Business" },
    "mother": { "name": "Sita Sharma", "phone": "9841222222", "occupation": "Homemaker" },
    "localGuardian": null
  },
  "className": "Class 10",
  "sectionName": "A",
  "rollNumber": 15,
  "admissionDate": "2081-04-01",      // BS date string (converted to AD before storing)
  "academicYear": "2081-2082",
  "previousSchool": "ABC School"
}
```

**Response:** `StudentResponseDto` (see below) with generated `studentId`.

---

### GET `/students` — List students

**Roles:** SCHOOL_OWNER, PRINCIPAL, ACADEMIC_COORDINATOR, TEACHER, ACCOUNTANT, LIBRARIAN

**Query params:**
```
page=1&limit=20
search=<name or studentId>
class=<class_name>
section=<section_name>
status=ACTIVE
sortBy=createdAt&sortOrder=desc
```

**Response:**
```json
{
  "success": true,
  "data": [ <StudentResponseDto>, ... ],
  "meta": { "page": 1, "limit": 20, "total": 150 }
}
```

---

### GET `/students/:id` — Get one student

**Roles:** Staff roles + STUDENT (own record only), PARENT (linked student only)

**Response:** Full `StudentResponseDto`.

---

### PATCH `/students/:id` — Update profile

**Roles:** SCHOOL_OWNER, PRINCIPAL, ACADEMIC_COORDINATOR

All fields from `CreateStudentDto` are optional in `UpdateStudentDto`.

---

### PATCH `/students/:id/status` — Change status

**Roles:** SCHOOL_OWNER, PRINCIPAL

**Request body (`UpdateStudentStatusDto`):**
```json
{
  "status": "TRANSFERRED",
  "reason": "Family relocated"
}
```

Valid transitions:
- `ACTIVE` → any
- Any non-ACTIVE → `ACTIVE` (re-admission)

---

### DELETE `/students/:id` — Soft delete

**Roles:** SCHOOL_OWNER, PRINCIPAL

Sets `deleted_at = NOW()`. Does not destroy data.

---

## Response DTO

`StudentResponseDto` — all dates appear in both AD and BS:

```json
{
  "id": "uuid",
  "studentId": "2081-0001",
  "tenantId": "uuid",
  "firstName": "Aarav",
  "lastName": "Sharma",
  "fullName": "Aarav Sharma",
  "dateOfBirth": { "ad": "2010-05-15", "bs": "2067-02-01" },
  "gender": "MALE",
  "bloodGroup": "O+",
  "phone": "9841000000",
  "email": "aarav@example.com",
  "permanentAddress": { "province": "Bagmati", ... },
  "temporaryAddress": null,
  "guardians": { "father": { ... }, "mother": { ... }, "localGuardian": null },
  "className": "Class 10",
  "sectionName": "A",
  "rollNumber": 15,
  "admissionDate": { "ad": "2024-07-16", "bs": "2081-04-01" },
  "academicYear": "2081-2082",
  "previousSchool": "ABC School",
  "photoUrl": null,
  "documents": [],
  "status": "ACTIVE",
  "createdAt": "2024-07-16T10:00:00Z"
}
```

---

## Module File Structure

```
apps/api/src/modules/student/
├── student.module.ts
├── student.controller.ts
├── student.service.ts
├── dto/
│   ├── create-student.dto.ts
│   ├── update-student.dto.ts
│   ├── update-student-status.dto.ts
│   └── student-response.dto.ts
├── entities/
│   └── student.entity.ts
└── __tests__/
    └── student.service.spec.ts
```

---

## Authorization Matrix

| Action | Allowed Roles |
|--------|--------------|
| Admit (POST) | SCHOOL_OWNER, PRINCIPAL, ACADEMIC_COORDINATOR |
| List (GET) | SCHOOL_OWNER, PRINCIPAL, ACADEMIC_COORDINATOR, TEACHER, ACCOUNTANT, LIBRARIAN |
| View single (GET /:id) | All staff + STUDENT (own only), PARENT (linked only) |
| Update profile (PATCH) | SCHOOL_OWNER, PRINCIPAL, ACADEMIC_COORDINATOR |
| Change status (PATCH /status) | SCHOOL_OWNER, PRINCIPAL |
| Soft delete (DELETE) | SCHOOL_OWNER, PRINCIPAL |

---

## Validation Rules

- `dateOfBirth`: must be in the past; student must be between 3 and 25 years old
- `admissionDate`: accepts either AD (`YYYY-MM-DD`) or BS date string; stored as AD
- `gender`: must be one of `MALE`, `FEMALE`, `OTHER`
- `status`: must be one of `ACTIVE`, `PASSED_OUT`, `EXPELLED`, `TRANSFERRED`, `DROPPED`
- `firstName`, `lastName`: 1–100 chars, required
- `email`: valid email format if provided
- `phone`: 10-digit Nepal format if provided

---

## BS Calendar Integration

- Import `adToBs`, `bsToBsString`, `bsToAd` from `packages/bs-calendar`.
- `admissionDate` input: if user sends a BS date string (e.g. `"2081-04-01"`), convert to AD before storing.
- All date fields in responses: return both `.ad` (ISO string) and `.bs` (formatted BS string).
- `studentId` year prefix: derived from BS year of admission date.

---

## Tests

`student.service.spec.ts` covers:
1. `admitStudent` — creates student, returns correct `studentId` format
2. `admitStudent` — increments sequence for same BS year
3. `admitStudent` — resets sequence for new BS year
4. `findAll` — returns paginated list
5. `findAll` — filters by class and status
6. `findOne` — returns student by UUID
7. `findOne` — throws 404 for missing student
8. `updateStudent` — applies partial updates
9. `updateStatus` — valid transition succeeds
10. `removeStudent` — sets `deleted_at`, does not hard-delete
