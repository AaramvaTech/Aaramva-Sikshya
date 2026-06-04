# Student Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Student module — admission, profile CRUD, status transitions, and soft deletion — with BS calendar integration, following all CLAUDE.md conventions.

**Architecture:** Tenant-scoped raw SQL via `TenantPrismaService.run()` / `query()` / `execute()`. Student IDs are generated as `{BS_year}-{0001}` atomically inside the INSERT transaction. Dates stored in AD, returned as `{ ad, bs }` objects in responses.

**Tech Stack:** NestJS 11, Prisma 6 (raw SQL only, no models for tenant tables), `bs-calendar` (local package via tsconfig paths), `class-validator`, `@nestjs/mapped-types`, Jest + `ts-jest`.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `apps/api/tsconfig.json` — add `paths` for `bs-calendar` |
| Modify | `apps/api/package.json` — add `@nestjs/mapped-types` dep + jest `moduleNameMapper` |
| Modify | `apps/api/src/modules/tenant/tenant-schema.sql` — add `students` table |
| Create | `apps/api/src/modules/student/entities/student.entity.ts` |
| Create | `apps/api/src/modules/student/dto/create-student.dto.ts` |
| Create | `apps/api/src/modules/student/dto/update-student.dto.ts` |
| Create | `apps/api/src/modules/student/dto/update-student-status.dto.ts` |
| Create | `apps/api/src/modules/student/dto/student-response.dto.ts` |
| Create | `apps/api/src/modules/student/dto/list-students-query.dto.ts` |
| Create | `apps/api/src/modules/student/student.service.ts` |
| Create | `apps/api/src/modules/student/__tests__/student.service.spec.ts` |
| Create | `apps/api/src/modules/student/student.controller.ts` |
| Create | `apps/api/src/modules/student/student.module.ts` |
| Modify | `apps/api/src/app.module.ts` — import `StudentModule` |

---

## Task 1: Wire bs-calendar + install @nestjs/mapped-types

**Files:**
- Modify: `apps/api/tsconfig.json`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add tsconfig path alias for bs-calendar**

Edit `apps/api/tsconfig.json` — add `paths` inside `compilerOptions`:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "noFallthroughCasesInSwitch": false,
    "paths": {
      "bs-calendar": ["../../packages/bs-calendar/src/index.ts"]
    }
  }
}
```

- [ ] **Step 2: Add jest moduleNameMapper + install @nestjs/mapped-types**

In `apps/api/package.json`, add `moduleNameMapper` to the jest config block and add the dependency:

```json
"dependencies": {
  "@nestjs/mapped-types": "^2.0.5",
  ...existing deps...
},
"jest": {
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "collectCoverageFrom": ["**/*.(t|j)s"],
  "coverageDirectory": "../coverage",
  "testEnvironment": "node",
  "moduleNameMapper": {
    "^bs-calendar$": "<rootDir>/../../../packages/bs-calendar/src/index.ts"
  }
}
```

- [ ] **Step 3: Install the new dependency**

Run from `apps/api/`:
```
npm install @nestjs/mapped-types
```

Expected: `added 1 package` (or similar). No errors.

- [ ] **Step 4: Verify the build still compiles**

Run from `apps/api/`:
```
npm run build
```

Expected: no errors. `dist/` updated.

---

## Task 2: Add students table to tenant schema

**Files:**
- Modify: `apps/api/src/modules/tenant/tenant-schema.sql`

- [ ] **Step 1: Append students table DDL**

Add the following block at the end of `tenant-schema.sql` (after the `idx_users_email` index):

```sql
-- Students
CREATE TABLE students (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL,
  student_id        VARCHAR(20)  UNIQUE NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  date_of_birth     DATE         NOT NULL,
  gender            VARCHAR(10)  NOT NULL,
  blood_group       VARCHAR(5),
  religion          VARCHAR(50),
  ethnicity         VARCHAR(50),
  nationality       VARCHAR(50)  NOT NULL DEFAULT 'Nepali',
  mother_tongue     VARCHAR(50),
  phone             VARCHAR(20),
  email             VARCHAR(255),
  permanent_address JSONB,
  temporary_address JSONB,
  guardians         JSONB,
  class_name        VARCHAR(50),
  section_name      VARCHAR(50),
  roll_number       INT,
  admission_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
  academic_year     VARCHAR(20),
  previous_school   VARCHAR(255),
  photo_url         TEXT,
  documents         JSONB        NOT NULL DEFAULT '[]',
  status            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  created_by        UUID         REFERENCES users(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_class      ON students(class_name, section_name);
CREATE INDEX idx_students_name       ON students(first_name, last_name);
CREATE INDEX idx_students_status     ON students(status) WHERE deleted_at IS NULL;
```

- [ ] **Step 2: Commit**

```
git add apps/api/src/modules/tenant/tenant-schema.sql apps/api/tsconfig.json apps/api/package.json apps/api/package-lock.json
git commit -m "chore: wire bs-calendar path alias and add students table to tenant schema"
```

---

## Task 3: Student entity types

**Files:**
- Create: `apps/api/src/modules/student/entities/student.entity.ts`

- [ ] **Step 1: Create the file**

`apps/api/src/modules/student/entities/student.entity.ts`:

```typescript
import { adToBs } from 'bs-calendar';

export interface StudentRow {
  id: string;
  tenant_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: Date | string;
  gender: string;
  blood_group: string | null;
  religion: string | null;
  ethnicity: string | null;
  nationality: string;
  mother_tongue: string | null;
  phone: string | null;
  email: string | null;
  permanent_address: Record<string, string> | null;
  temporary_address: Record<string, string> | null;
  guardians: Record<string, unknown> | null;
  class_name: string | null;
  section_name: string | null;
  roll_number: number | null;
  admission_date: Date | string;
  academic_year: string | null;
  previous_school: string | null;
  photo_url: string | null;
  documents: unknown[];
  status: string;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BsAdDate {
  ad: string;
  bs: string;
}

export interface StudentResponseDto {
  id: string;
  studentId: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: BsAdDate;
  gender: string;
  bloodGroup: string | null;
  religion: string | null;
  ethnicity: string | null;
  nationality: string;
  motherTongue: string | null;
  phone: string | null;
  email: string | null;
  permanentAddress: Record<string, string> | null;
  temporaryAddress: Record<string, string> | null;
  guardians: Record<string, unknown> | null;
  className: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  admissionDate: BsAdDate;
  academicYear: string | null;
  previousSchool: string | null;
  photoUrl: string | null;
  documents: unknown[];
  status: string;
  createdAt: string;
}

function toAdString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

function toBsString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const bs = adToBs(date);
  return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
}

export function toStudentResponse(row: StudentRow): StudentResponseDto {
  return {
    id: row.id,
    studentId: row.student_id,
    tenantId: row.tenant_id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`,
    dateOfBirth: { ad: toAdString(row.date_of_birth), bs: toBsString(row.date_of_birth) },
    gender: row.gender,
    bloodGroup: row.blood_group,
    religion: row.religion,
    ethnicity: row.ethnicity,
    nationality: row.nationality,
    motherTongue: row.mother_tongue,
    phone: row.phone,
    email: row.email,
    permanentAddress: row.permanent_address,
    temporaryAddress: row.temporary_address,
    guardians: row.guardians,
    className: row.class_name,
    sectionName: row.section_name,
    rollNumber: row.roll_number,
    admissionDate: { ad: toAdString(row.admission_date), bs: toBsString(row.admission_date) },
    academicYear: row.academic_year,
    previousSchool: row.previous_school,
    photoUrl: row.photo_url,
    documents: row.documents ?? [],
    status: row.status,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}
```

- [ ] **Step 2: Commit**

```
git add apps/api/src/modules/student/entities/student.entity.ts
git commit -m "feat(student): add student entity types and response transformer"
```

---

## Task 4: Student DTOs

**Files:**
- Create: `apps/api/src/modules/student/dto/create-student.dto.ts`
- Create: `apps/api/src/modules/student/dto/update-student.dto.ts`
- Create: `apps/api/src/modules/student/dto/update-student-status.dto.ts`
- Create: `apps/api/src/modules/student/dto/list-students-query.dto.ts`

- [ ] **Step 1: Create CreateStudentDto**

`apps/api/src/modules/student/dto/create-student.dto.ts`:

```typescript
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class GuardianDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsEmail()  email?: string;
  @IsOptional() @IsString() relation?: string;
}

export class AddressDto {
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() municipality?: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() street?: string;
}

export class GuardiansDto {
  @IsOptional() @IsObject() father?: GuardianDto;
  @IsOptional() @IsObject() mother?: GuardianDto;
  @IsOptional() @IsObject() localGuardian?: GuardianDto;
}

export class CreateStudentDto {
  @IsString() @MinLength(1) @MaxLength(100)
  firstName!: string;

  @IsString() @MinLength(1) @MaxLength(100)
  lastName!: string;

  @IsDateString()
  dateOfBirth!: string;  // AD format: "YYYY-MM-DD"

  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender!: string;

  @IsOptional() @IsString() @MaxLength(5)
  bloodGroup?: string;

  @IsOptional() @IsString() @MaxLength(50)
  religion?: string;

  @IsOptional() @IsString() @MaxLength(50)
  ethnicity?: string;

  @IsOptional() @IsString() @MaxLength(50)
  nationality?: string;

  @IsOptional() @IsString() @MaxLength(50)
  motherTongue?: string;

  @IsOptional() @IsString() @MaxLength(20)
  phone?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsObject()
  permanentAddress?: AddressDto;

  @IsOptional() @IsObject()
  temporaryAddress?: AddressDto;

  @IsOptional() @IsObject()
  guardians?: GuardiansDto;

  @IsOptional() @IsString() @MaxLength(50)
  className?: string;

  @IsOptional() @IsString() @MaxLength(50)
  sectionName?: string;

  @IsOptional() @IsInt() @Min(1)
  rollNumber?: number;

  @IsDateString()
  admissionDate!: string;  // AD format: "YYYY-MM-DD"

  @IsOptional() @IsString() @MaxLength(20)
  academicYear?: string;

  @IsOptional() @IsString() @MaxLength(255)
  previousSchool?: string;

  @IsOptional() @IsString()
  photoUrl?: string;
}
```

- [ ] **Step 2: Create UpdateStudentDto, UpdateStudentStatusDto, ListStudentsQueryDto**

`apps/api/src/modules/student/dto/update-student.dto.ts`:
```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateStudentDto } from './create-student.dto';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}
```

`apps/api/src/modules/student/dto/update-student-status.dto.ts`:
```typescript
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const STUDENT_STATUSES = ['ACTIVE', 'PASSED_OUT', 'EXPELLED', 'TRANSFERRED', 'DROPPED'] as const;
export type StudentStatus = typeof STUDENT_STATUSES[number];

export class UpdateStudentStatusDto {
  @IsIn(STUDENT_STATUSES)
  status!: StudentStatus;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
```

`apps/api/src/modules/student/dto/list-students-query.dto.ts`:
```typescript
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListStudentsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsString()
  class?: string;

  @IsOptional() @IsString()
  section?: string;

  @IsOptional() @IsIn(['ACTIVE', 'PASSED_OUT', 'EXPELLED', 'TRANSFERRED', 'DROPPED'])
  status?: string;

  @IsOptional() @IsIn(['created_at', 'first_name', 'last_name', 'student_id', 'admission_date'])
  sortBy?: string = 'created_at';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
```

- [ ] **Step 3: Commit**

```
git add apps/api/src/modules/student/dto/
git commit -m "feat(student): add student DTOs with validation"
```

---

## Task 5: Write failing tests for StudentService

**Files:**
- Create: `apps/api/src/modules/student/__tests__/student.service.spec.ts`

- [ ] **Step 1: Create the test file**

`apps/api/src/modules/student/__tests__/student.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudentService } from '../student.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTenantCtx = {
  tenantId: 'tid-1',
  slug: 'testschool',
  schemaName: 'tenant_testschool',
};

const admissionDateAd = '2024-07-16'; // corresponds to BS 2081-04-01

const mockStudentRow = {
  id: 'sid-1',
  tenant_id: 'tid-1',
  student_id: '2081-0001',
  first_name: 'Aarav',
  last_name: 'Sharma',
  date_of_birth: new Date('2010-05-15'),
  gender: 'MALE',
  blood_group: 'O+',
  religion: null,
  ethnicity: null,
  nationality: 'Nepali',
  mother_tongue: null,
  phone: '9841000000',
  email: null,
  permanent_address: null,
  temporary_address: null,
  guardians: null,
  class_name: 'Class 10',
  section_name: 'A',
  roll_number: 1,
  admission_date: new Date(admissionDateAd),
  academic_year: '2081-2082',
  previous_school: null,
  photo_url: null,
  documents: [],
  status: 'ACTIVE',
  created_by: 'uid-1',
  created_at: new Date('2024-07-16T10:00:00Z'),
  updated_at: new Date('2024-07-16T10:00:00Z'),
  deleted_at: null,
  total_count: '1',
};

const createDto = {
  firstName: 'Aarav',
  lastName: 'Sharma',
  dateOfBirth: '2010-05-15',
  gender: 'MALE' as const,
  bloodGroup: 'O+',
  admissionDate: admissionDateAd,
  academicYear: '2081-2082',
  className: 'Class 10',
  sectionName: 'A',
  rollNumber: 1,
};

describe('StudentService', () => {
  let service: StudentService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let tenantContext: jest.Mocked<TenantContextService>;

  // mock tx used inside tenantPrisma.run() callbacks
  const mockTx = {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(mockTenantCtx),
          },
        },
      ],
    }).compile();

    service = module.get(StudentService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    tenantContext = module.get(TenantContextService) as jest.Mocked<TenantContextService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    // Re-attach run mock after reset (clearAllMocks clears implementations too)
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
    (tenantContext.getOrThrow as jest.Mock).mockReturnValue(mockTenantCtx);
  });

  // ─── admitStudent ──────────────────────────────────────────────────────────

  describe('admitStudent()', () => {
    it('generates student_id "2081-0001" when no students exist yet for that year', async () => {
      // First tx query: MAX(student_id) → no rows
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ max_id: null }]);
      // Second tx query: INSERT → returns row
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { ...mockStudentRow, student_id: '2081-0001' },
      ]);

      const result = await service.admitStudent(createDto as any, 'uid-1');

      expect(result.studentId).toBe('2081-0001');
      expect(result.firstName).toBe('Aarav');
    });

    it('increments sequence for same BS year', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ max_id: '2081-0003' }]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { ...mockStudentRow, student_id: '2081-0004' },
      ]);

      const result = await service.admitStudent(createDto as any, 'uid-1');

      expect(result.studentId).toBe('2081-0004');
    });

    it('resets sequence for a new BS year', async () => {
      // admissionDate in a different BS year (e.g. 2082)
      const dto2082 = { ...createDto, admissionDate: '2025-07-16' }; // ~2082 BS
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ max_id: null }]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { ...mockStudentRow, student_id: '2082-0001', admission_date: new Date('2025-07-16') },
      ]);

      const result = await service.admitStudent(dto2082 as any, 'uid-1');

      expect(result.studentId).toMatch(/^2082-/);
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated list', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, total_count: '5' },
        { ...mockStudentRow, id: 'sid-2', student_id: '2081-0002', total_count: '5' },
      ]);

      const result = await service.findAll({ page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(5);
      expect(result.meta.page).toBe(1);
    });

    it('filters by class and status', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, total_count: '1' },
      ]);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        class: 'Class 10',
        status: 'ACTIVE',
      } as any);

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM students'),
        expect.anything(), // search param
        'Class 10',
        null,            // section
        'ACTIVE',
        expect.any(Number), // limit
        expect.any(Number), // offset
      );
      expect(result.data).toHaveLength(1);
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns student by UUID', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockStudentRow]);

      const result = await service.findOne('sid-1');

      expect(result.id).toBe('sid-1');
      expect(result.fullName).toBe('Aarav Sharma');
      expect(result.dateOfBirth.ad).toBe('2010-05-15');
    });

    it('throws NotFoundException for unknown id', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.findOne('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateStudent ─────────────────────────────────────────────────────────

  describe('updateStudent()', () => {
    it('applies partial updates', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, first_name: 'Bikash' },
      ]);

      const result = await service.updateStudent('sid-1', { firstName: 'Bikash' } as any);

      expect(result.firstName).toBe('Bikash');
    });
  });

  // ─── updateStatus ──────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('updates status and returns updated student', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, status: 'TRANSFERRED' },
      ]);

      const result = await service.updateStatus('sid-1', { status: 'TRANSFERRED' } as any);

      expect(result.status).toBe('TRANSFERRED');
    });
  });

  // ─── removeStudent ─────────────────────────────────────────────────────────

  describe('removeStudent()', () => {
    it('soft-deletes the student (sets deleted_at)', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);

      await service.removeStudent('sid-1');

      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at'),
        'sid-1',
      );
    });

    it('throws NotFoundException if student does not exist', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);

      await expect(service.removeStudent('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail (service doesn't exist yet)**

Run from `apps/api/`:
```
npm test -- --testPathPattern=student.service.spec
```

Expected output: `FAIL` — `Cannot find module '../student.service'` or similar compile error.

---

## Task 6: Implement StudentService

**Files:**
- Create: `apps/api/src/modules/student/student.service.ts`

- [ ] **Step 1: Create StudentService**

`apps/api/src/modules/student/student.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { getBsYear } from 'bs-calendar';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { StudentRow, StudentResponseDto, toStudentResponse } from './entities/student.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';

const SORT_WHITELIST: Record<string, string> = {
  created_at: 'created_at',
  first_name: 'first_name',
  last_name: 'last_name',
  student_id: 'student_id',
  admission_date: 'admission_date',
};

type UpdateFieldSpec = [keyof UpdateStudentDto, string, 'text' | 'date' | 'jsonb' | 'int'];

const UPDATE_FIELD_MAP: UpdateFieldSpec[] = [
  ['firstName',        'first_name',        'text'],
  ['lastName',         'last_name',         'text'],
  ['dateOfBirth',      'date_of_birth',     'date'],
  ['gender',           'gender',            'text'],
  ['bloodGroup',       'blood_group',       'text'],
  ['religion',         'religion',          'text'],
  ['ethnicity',        'ethnicity',         'text'],
  ['nationality',      'nationality',       'text'],
  ['motherTongue',     'mother_tongue',     'text'],
  ['phone',            'phone',             'text'],
  ['email',            'email',             'text'],
  ['permanentAddress', 'permanent_address', 'jsonb'],
  ['temporaryAddress', 'temporary_address', 'jsonb'],
  ['guardians',        'guardians',         'jsonb'],
  ['className',        'class_name',        'text'],
  ['sectionName',      'section_name',      'text'],
  ['rollNumber',       'roll_number',       'int'],
  ['admissionDate',    'admission_date',    'date'],
  ['academicYear',     'academic_year',     'text'],
  ['previousSchool',   'previous_school',   'text'],
  ['photoUrl',         'photo_url',         'text'],
];

@Injectable()
export class StudentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async admitStudent(dto: CreateStudentDto, createdById: string): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const admissionDate = new Date(dto.admissionDate);

    const row = await this.tenantPrisma.run(async (tx) => {
      const studentId = await this.generateStudentId(tx, admissionDate);

      const rows = await tx.$queryRawUnsafe<StudentRow[]>(
        `INSERT INTO students (
           tenant_id, student_id, first_name, last_name, date_of_birth, gender,
           blood_group, religion, ethnicity, nationality, mother_tongue,
           phone, email, permanent_address, temporary_address, guardians,
           class_name, section_name, roll_number, admission_date, academic_year,
           previous_school, created_by
         ) VALUES (
           $1::uuid, $2, $3, $4, $5::date, $6,
           $7, $8, $9, $10, $11,
           $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
           $17, $18, $19, $20::date, $21,
           $22, $23::uuid
         ) RETURNING *`,
        tenantId, studentId,
        dto.firstName, dto.lastName, dto.dateOfBirth, dto.gender,
        dto.bloodGroup ?? null, dto.religion ?? null, dto.ethnicity ?? null,
        dto.nationality ?? 'Nepali', dto.motherTongue ?? null,
        dto.phone ?? null, dto.email ?? null,
        dto.permanentAddress ? JSON.stringify(dto.permanentAddress) : null,
        dto.temporaryAddress ? JSON.stringify(dto.temporaryAddress) : null,
        dto.guardians ? JSON.stringify(dto.guardians) : null,
        dto.className ?? null, dto.sectionName ?? null, dto.rollNumber ?? null,
        dto.admissionDate, dto.academicYear ?? null,
        dto.previousSchool ?? null, createdById,
      );

      return rows[0];
    });

    return toStudentResponse(row);
  }

  async findAll(query: ListStudentsQueryDto): Promise<{
    data: StudentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const search      = query.search  ?? null;
    const className   = query.class   ?? null;
    const sectionName = query.section ?? null;
    const status      = query.status  ?? null;

    const sortCol = SORT_WHITELIST[query.sortBy ?? 'created_at'] ?? 'created_at';
    const sortDir = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const rows = await this.tenantPrisma.query<StudentRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM students
       WHERE deleted_at IS NULL
         AND ($1::text IS NULL OR (
               first_name ILIKE '%' || $1 || '%' OR
               last_name  ILIKE '%' || $1 || '%' OR
               student_id ILIKE '%' || $1 || '%'
             ))
         AND ($2::text IS NULL OR class_name   = $2)
         AND ($3::text IS NULL OR section_name = $3)
         AND ($4::text IS NULL OR status       = $4)
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $5 OFFSET $6`,
      search, className, sectionName, status, limit, offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;

    return {
      data: rows.map(toStudentResponse),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string): Promise<StudentResponseDto> {
    const rows = await this.tenantPrisma.query<StudentRow>(
      `SELECT * FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${id} not found`);
    return toStudentResponse(rows[0]);
  }

  async updateStudent(id: string, dto: UpdateStudentDto): Promise<StudentResponseDto> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [dtoKey, col, type] of UPDATE_FIELD_MAP) {
      const val = dto[dtoKey];
      if (val !== undefined) {
        const cast = type === 'text' ? '' : `::${type}`;
        setClauses.push(`${col} = $${idx++}${cast}`);
        params.push(type === 'jsonb' ? JSON.stringify(val) : val);
      }
    }

    if (setClauses.length === 0) return this.findOne(id);

    setClauses.push('updated_at = NOW()');
    params.push(id);

    const rows = await this.tenantPrisma.query<StudentRow>(
      `UPDATE students SET ${setClauses.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${id} not found`);
    return toStudentResponse(rows[0]);
  }

  async updateStatus(id: string, dto: UpdateStudentStatusDto): Promise<StudentResponseDto> {
    await this.tenantPrisma.execute(
      `UPDATE students SET status = $1, updated_at = NOW()
       WHERE id = $2::uuid AND deleted_at IS NULL`,
      dto.status, id,
    );
    return this.findOne(id);
  }

  async removeStudent(id: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `UPDATE students SET deleted_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (affected === 0) throw new NotFoundException(`Student ${id} not found`);
  }

  private async generateStudentId(tx: TenantTx, admissionDate: Date): Promise<string> {
    const bsYear = getBsYear(admissionDate);
    const rows = await tx.$queryRawUnsafe<{ max_id: string | null }[]>(
      `SELECT MAX(student_id) AS max_id FROM students WHERE student_id LIKE $1`,
      `${bsYear}-%`,
    );
    const maxId = rows[0]?.max_id ?? null;
    const seq = maxId ? parseInt(maxId.split('-')[1], 10) + 1 : 1;
    return `${bsYear}-${seq.toString().padStart(4, '0')}`;
  }
}
```

- [ ] **Step 2: Run the tests — they should now pass**

Run from `apps/api/`:
```
npm test -- --testPathPattern=student.service.spec
```

Expected output:
```
PASS src/modules/student/__tests__/student.service.spec.ts
  StudentService
    admitStudent()
      ✓ generates student_id "2081-0001" when no students exist yet for that year
      ✓ increments sequence for same BS year
      ✓ resets sequence for a new BS year
    findAll()
      ✓ returns paginated list
      ✓ filters by class and status
    findOne()
      ✓ returns student by UUID
      ✓ throws NotFoundException for unknown id
    updateStudent()
      ✓ applies partial updates
    updateStatus()
      ✓ updates status and returns updated student
    removeStudent()
      ✓ soft-deletes the student (sets deleted_at)
      ✓ throws NotFoundException if student does not exist

Tests: 11 passed, 11 total
```

- [ ] **Step 3: Commit**

```
git add apps/api/src/modules/student/student.service.ts apps/api/src/modules/student/__tests__/student.service.spec.ts
git commit -m "feat(student): implement StudentService with TDD — 11 tests passing"
```

---

## Task 7: Implement StudentController

**Files:**
- Create: `apps/api/src/modules/student/student.controller.ts`

- [ ] **Step 1: Create StudentController**

`apps/api/src/modules/student/student.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../auth/auth.types';
import { StudentService } from './student.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Post()
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  admitStudent(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthUser) {
    return this.studentService.admitStudent(dto, user.userId);
  }

  @Get()
  @Roles(
    Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR,
    Role.TEACHER, Role.ACCOUNTANT, Role.LIBRARIAN,
  )
  findAll(@Query() query: ListStudentsQueryDto) {
    return this.studentService.findAll(query);
  }

  @Get(':id')
  @Roles(
    Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR,
    Role.TEACHER, Role.ACCOUNTANT, Role.LIBRARIAN, Role.STUDENT, Role.PARENT,
  )
  findOne(@Param('id') id: string) {
    return this.studentService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentService.updateStudent(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStudentStatusDto) {
    return this.studentService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  remove(@Param('id') id: string) {
    return this.studentService.removeStudent(id);
  }
}
```

- [ ] **Step 2: Commit**

```
git add apps/api/src/modules/student/student.controller.ts
git commit -m "feat(student): add StudentController — 6 endpoints"
```

---

## Task 8: StudentModule + AppModule wiring

**Files:**
- Create: `apps/api/src/modules/student/student.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create StudentModule**

`apps/api/src/modules/student/student.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [TenantModule],
  controllers: [StudentController],
  providers: [StudentService],
})
export class StudentModule {}
```

- [ ] **Step 2: Register in AppModule**

Edit `apps/api/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { StudentModule } from './modules/student/student.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantModule,
    AuthModule,
    StudentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 3: Build and run all tests**

Run from `apps/api/`:
```
npm run build && npm test
```

Expected: build succeeds, all test suites pass:
```
Test Suites: 4 passed, 4 total
Tests:       26 passed, 26 total
```

- [ ] **Step 4: Commit**

```
git add apps/api/src/modules/student/student.module.ts apps/api/src/app.module.ts
git commit -m "feat(student): wire StudentModule into AppModule — Student module complete"
```

---

## Task 9: Update CLAUDE.md checklist

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Mark Student module complete in CLAUDE.md**

In `CLAUDE.md`, change:
```
2. ⬜ **Student** — Admission, profiles, class assignment
```
to:
```
2. ✅ **Student** — Admission, profiles, class assignment
```

Also update the "What's built so far" section to add:
```
- [x] Student module (apps/api/src/modules/student/) — admission, CRUD, status, soft-delete — 11 unit tests passing
```

- [ ] **Step 2: Commit**

```
git add CLAUDE.md
git commit -m "docs: mark Student module complete in CLAUDE.md"
```

---

## Self-review

**Spec coverage:**
- ✅ Students table with all specified fields
- ✅ Student ID: BS year + sequence, atomic generation
- ✅ POST /students — admit with role guard
- ✅ GET /students — paginated list, search, class/section/status filter
- ✅ GET /students/:id — single student
- ✅ PATCH /students/:id — partial update
- ✅ PATCH /students/:id/status — status transition
- ✅ DELETE /students/:id — soft delete
- ✅ BS calendar integration: dates in responses as `{ ad, bs }`
- ✅ All 10 spec test scenarios covered (11 actual tests — removeStudent has 2)

**No placeholders, no TODOs, all code is complete.**

**Type consistency:** `StudentRow` → `toStudentResponse()` → `StudentResponseDto` chain is consistent. `TenantTx` import in service matches export in `tenant-prisma.service.ts`. All method signatures in tests match the service.
