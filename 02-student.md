# Student Module — Claude Code Session 2 Spec

## Prerequisites
- Foundation module complete (session 1)
- TenantPrismaService working and tested
- Auth + RBAC guards working

## Goal
Build the Student module: admission, profiles, class assignment, document storage.

---

## Database schema additions (add to tenant schema SQL)

```sql
-- Academic years
CREATE TABLE academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,          -- "2081-82" (BS year)
  start_date DATE NOT NULL,           -- stored as AD
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Classes (Grade 1, Grade 2, ... Grade 12, Nursery, KG)
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,           -- "Grade 10", "Nursery"
  order_index INT NOT NULL,            -- for sorting
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Sections (A, B, C per class)
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id),
  name VARCHAR(10) NOT NULL,           -- "A", "B", "Science", "Management"
  capacity INT DEFAULT 40,
  class_teacher_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Students
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),   -- NULL until student has app access
  admission_number VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,         -- stored as AD
  gender VARCHAR(10) NOT NULL,         -- MALE, FEMALE, OTHER
  nationality VARCHAR(50) DEFAULT 'Nepali',
  religion VARCHAR(50),
  blood_group VARCHAR(5),
  photo_url TEXT,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, TRANSFERRED, GRADUATED
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Guardian / parent info
CREATE TABLE guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),   -- if guardian has app access
  relation VARCHAR(30) NOT NULL,        -- FATHER, MOTHER, GUARDIAN
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  occupation VARCHAR(100),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Class enrollments (a student in a class+section for an academic year)
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  roll_number INT,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, academic_year_id)  -- one enrollment per student per year
);

-- Student documents (birth cert, citizenship, previous marksheet, etc.)
CREATE TABLE student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL,   -- BIRTH_CERTIFICATE, TRANSFER_CERT, etc.
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API endpoints

### Students

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | /students | PRINCIPAL, ACADEMIC_COORDINATOR | Admit new student |
| GET | /students | TEACHER and above | List students (paginated, filterable) |
| GET | /students/:id | TEACHER and above | Get student detail |
| PATCH | /students/:id | ACADEMIC_COORDINATOR and above | Update student info |
| DELETE | /students/:id | PRINCIPAL and above | Soft delete (mark inactive) |
| POST | /students/:id/enroll | ACADEMIC_COORDINATOR | Enroll in class/section |
| GET | /students/:id/enrollments | TEACHER and above | Enrollment history |
| POST | /students/:id/documents | ACADEMIC_COORDINATOR | Upload document (S3 presigned URL flow) |
| GET | /students/:id/documents | TEACHER and above | List student documents |

### Classes & sections

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | /classes | PRINCIPAL | Create class |
| GET | /classes | TEACHER and above | List classes with sections |
| POST | /classes/:id/sections | PRINCIPAL | Add section to class |
| GET | /classes/:id/students | TEACHER and above | Students in a class (current year) |

### Academic years

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | /academic-years | SCHOOL_OWNER, PRINCIPAL | Create academic year |
| GET | /academic-years | All authenticated | List years |
| PATCH | /academic-years/:id/set-current | PRINCIPAL | Mark as current year |

---

## Key DTOs

```typescript
// CreateStudentDto
{
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;          // ISO date string (AD), convert to BS for display
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  admissionNumber?: string;     // auto-generate if not provided
  phone?: string;
  email?: string;
  address?: string;
  bloodGroup?: string;
  religion?: string;
  guardians: CreateGuardianDto[]; // at least one required
}

// EnrollStudentDto
{
  classId: string;
  sectionId: string;
  academicYearId: string;
  rollNumber?: number;
}
```

---

## Auto-generate admission number

Format: `<YEAR>-<SEQUENCE>` e.g. `2081-0042` (BS year + 4-digit sequence)
- Query max sequence for current BS year, increment by 1
- Use a DB function or transaction to avoid race conditions

---

## S3 document upload flow

1. Client calls `POST /students/:id/documents/presign` with `{ fileName, documentType, contentType }`
2. API generates a presigned S3 PUT URL (expires in 5 min)
3. Client uploads directly to S3
4. Client calls `POST /students/:id/documents/confirm` with `{ fileUrl, fileName, documentType }`
5. API saves record to `student_documents`

---

## Exact Claude Code prompt for session 2

```
Read CLAUDE.md fully first.
Read docs/api-contracts/02-student.md.

The foundation from session 1 is complete. TenantPrismaService is working.

Your task: Build the Student module.

Order:
1. Add the student-related tables to the tenant schema SQL file
2. Create the StudentModule folder structure under apps/api/src/modules/student/
3. Write the Prisma-equivalent raw SQL queries in StudentService (we use raw SQL for tenant schemas, not Prisma models — use TenantPrismaService.$queryRaw and $executeRaw)
4. Build ClassService and AcademicYearService
5. Build StudentController with all endpoints from the spec
6. Add S3 presigned URL service (UploadService) in common/
7. Write unit tests for StudentService

Key reminder: All dates stored as AD in DB. Add a note in every service method that touches dates: "// Display layer converts to BS using BsCalendarService"
```
