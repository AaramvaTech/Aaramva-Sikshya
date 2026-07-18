# HR Lookup CRUD (Employment Types + Role Labels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give school admins real CRUD for Employment Type (promoted from a hardcoded enum to a lookup table) and a display-label override for Role, both on the existing HR Setup page — without touching auth guards or the `Role` enum itself.

**Architecture:** `EmploymentTypeService`/`RoleLabelService` follow the exact `DepartmentService` pattern already in `apps/api/src/modules/hr/` (raw SQL via `TenantPrismaService`, soft delete, paginated list). `staff_profiles.employment_type` (VARCHAR enum) is migrated to `employment_type_id` (FK to a new `employment_types` table) in one forward-only tenant migration. `role_labels` is a small override table keyed by the fixed `Role` enum value — no seed rows, absent row = computed default label. Web adds two tabs to the existing `hr/setup` page and swaps every hardcoded role/employment-type label in the HR UI for the new API-backed data.

**Tech Stack:** NestJS + raw SQL (`TenantPrismaService`), Postgres tenant-schema migrations (forward-only, canary-first), Next.js 14 + TanStack Query + Zod, Jest.

**Spec:** `docs/superpowers/specs/2026-07-18-hr-lookup-crud-design.md`

## Global Constraints

- Every tenant-scoped write goes through `TenantPrismaService`, never a bare Prisma client — this module already only uses `TenantPrismaService`.
- Soft deletes only: `UPDATE ... SET deleted_at = NOW()`, never a hard `DELETE` (role_labels rows are the one exception noted per-task — they are override rows, not primary records, so a hard `DELETE` on `reset()` is correct, mirroring how `device_tokens` is hard-deleted by documented exception).
- API responses: return plain data from services — `ResponseInterceptor` wraps it in `{ success, data }` automatically; do not wrap manually.
- Pagination convention: `?page=1&limit=20&search=` — mirror `DepartmentQueryDto` exactly for `EmploymentTypeQueryDto`.
- `@Roles(...)` guard required on every new controller method.
- Tenant migrations: forward-only, no down migration, `{{schema}}`-free bare table names (current convention — see `apps/api/migrations/tenant/0013_backfill_phone_e164.sql`), canary on `demo` before rolling to all tenants (`apps/api/migrations/tenant/README.md`).
- Web: TanStack Query only for server state (no `useEffect` + `fetch`), Tailwind only, verify with `npx tsc --noEmit` (must exit 0) — this repo has no web unit-test runner, so "test cycle" for web tasks is a clean `tsc` plus the manual check listed in each task.
- Naming: `kebab-case.ts` files, `PascalCase` classes, `CreateXDto`/`UpdateXDto`/`XResponseDto` DTO naming.

---

## Task 1: Tenant migration — `employment_types` table + backfill

**Files:**
- Create: `apps/api/migrations/tenant/0016_employment_types.sql`

**Interfaces:**
- Produces: table `employment_types(id UUID, name VARCHAR(50), created_at, updated_at, deleted_at)`; `staff_profiles.employment_type_id UUID NOT NULL REFERENCES employment_types(id)`; `staff_profiles.employment_type` column is dropped.

- [ ] **Step 1: Confirm the next migration number is still free**

Run: `ls apps/api/migrations/tenant/ | sort | tail -5`
Expected: highest file is `0015_credential_delivery_template_type.sql` — if a higher number now exists, use the next free number instead of 0016 throughout this task (and Task 5).

- [ ] **Step 2: Write the migration file**

```sql
-- 0016_employment_types.sql
-- Promotes staff_profiles.employment_type from a hardcoded 4-value enum to a
-- real per-school lookup table, mirroring the existing departments/designations
-- pattern (admin-manageable via HR Setup). Forward-only: seeds the 4 existing
-- enum values as rows, backfills every staff_profiles row onto the new FK, then
-- drops the legacy VARCHAR column — all in this one transaction, so the backfill
-- is guaranteed to complete before the column is dropped (same guarantee as
-- 0002_drop_students_guardians.sql).

CREATE TABLE IF NOT EXISTS employment_types (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50)  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- (1) Seed the 4 default rows, matching the old enum's values. Idempotent.
INSERT INTO employment_types (name)
SELECT v.name FROM (VALUES ('Permanent'), ('Temporary'), ('Part Time'), ('Contract')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM employment_types et WHERE et.name = v.name);

-- (2) Add the FK column (nullable for now — populated by the backfill below).
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS employment_type_id UUID REFERENCES employment_types(id);

-- (3) Backfill: map each staff row's old enum string to the matching new row.
UPDATE staff_profiles sp
   SET employment_type_id = et.id
  FROM employment_types et
 WHERE et.name = CASE sp.employment_type
                    WHEN 'PERMANENT' THEN 'Permanent'
                    WHEN 'TEMPORARY' THEN 'Temporary'
                    WHEN 'PART_TIME' THEN 'Part Time'
                    WHEN 'CONTRACT' THEN 'Contract'
                    ELSE NULL
                  END
   AND sp.employment_type_id IS NULL;

-- (4) Lock it down and drop the legacy column.
ALTER TABLE staff_profiles ALTER COLUMN employment_type_id SET NOT NULL;
ALTER TABLE staff_profiles DROP COLUMN IF EXISTS employment_type;
```

- [ ] **Step 3: Canary — apply to `demo` only**

Run: `cd apps/api && npm run migrate:tenants -- --tenant demo`
Expected: structured log line `tenant=demo migration=0016_employment_types status=applied ...`

- [ ] **Step 4: Verify the canary**

Run:
```
npm run migrate:tenants -- --status
```
Expected: the `demo` row shows `0016_employment_types` as latest applied. Then spot-check with `psql` (or your DB client) against `tenant_demo`:
```sql
SELECT name FROM employment_types ORDER BY name;
-- expect: Contract, Part Time, Permanent, Temporary
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'tenant_demo' AND table_name = 'staff_profiles'
   AND column_name IN ('employment_type', 'employment_type_id');
-- expect: only employment_type_id
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/tenant/0016_employment_types.sql
git commit -m "feat(api): tenant migration for employment_types lookup table"
```

(Do **not** run `npm run migrate:tenants` without `--tenant` yet — full rollout to all tenants happens once in Task 15, after the API code that depends on the new column shape is also merged.)

---

## Task 2: Backend — `EmploymentTypeService` + DTOs + controller routes

**Files:**
- Create: `apps/api/src/modules/hr/dto/employment-type.dto.ts`
- Create: `apps/api/src/modules/hr/employment-type.service.ts`
- Create: `apps/api/src/modules/hr/__tests__/employment-type.service.spec.ts`
- Modify: `apps/api/src/modules/hr/entities/hr.entity.ts` (add `EmploymentTypeRow`, `EmploymentTypeResponseDto`, `toEmploymentTypeResponse`)
- Modify: `apps/api/src/modules/hr/hr.controller.ts` (add routes)
- Modify: `apps/api/src/modules/hr/hr.module.ts` (register service)

**Interfaces:**
- Consumes: `TenantPrismaService.query<T>(sql, ...params)` / `.execute(sql, ...params)` (both already used by `DepartmentService`).
- Produces: `EmploymentTypeService.create(dto): Promise<EmploymentTypeResponseDto>`, `.findAll(query): Promise<{data, meta}>`, `.update(id, dto): Promise<EmploymentTypeResponseDto>`, `.softDelete(id): Promise<void>`. Routes: `POST/GET /hr/employment-types`, `PATCH/DELETE /hr/employment-types/:id`. Task 3 consumes `EmploymentTypeResponseDto` shape (`{id, name, staffCount, createdAt}`) only by table name (`employment_types`), not by importing this service.

- [ ] **Step 1: Write the DTOs**

```ts
// apps/api/src/modules/hr/dto/employment-type.dto.ts
import { IsNotEmpty, IsOptional, IsString, MaxLength, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmploymentTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}

export class UpdateEmploymentTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @IsOptional()
  name?: string;
}

export class EmploymentTypeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['name', 'createdAt'])
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: string;
}
```

- [ ] **Step 2: Add row/response types + mapper to `hr.entity.ts`**

Add after the `DesignationRow` interface (near line 24):

```ts
export interface EmploymentTypeRow {
  id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
  staff_count?: string;
}
```

Add after the `DesignationResponseDto` interface (near line 174):

```ts
export interface EmploymentTypeResponseDto {
  id: string;
  name: string;
  staffCount: number;
  createdAt: string;
}
```

Add after the `toDesignationResponse` function (near line 324):

```ts
export function toEmploymentTypeResponse(row: EmploymentTypeRow): EmploymentTypeResponseDto {
  return {
    id: row.id,
    name: row.name,
    staffCount: row.staff_count ? parseInt(row.staff_count, 10) : 0,
    createdAt: toIsoString(row.created_at),
  };
}
```

- [ ] **Step 3: Write the failing test**

```ts
// apps/api/src/modules/hr/__tests__/employment-type.service.spec.ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EmploymentTypeService } from '../employment-type.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const baseRow = {
  id: 'et-1',
  name: 'Permanent',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  deleted_at: null,
  staff_count: '3',
  total_count: '1',
};

describe('EmploymentTypeService', () => {
  let service: EmploymentTypeService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmploymentTypeService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(EmploymentTypeService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('inserts and returns the mapped response', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...baseRow, staff_count: '0' }]);

      const result = await service.create({ name: 'Permanent' });

      expect(result).toEqual({ id: 'et-1', name: 'Permanent', staffCount: 0, createdAt: expect.any(String) });
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO employment_types'),
        'Permanent',
      );
    });
  });

  describe('findAll()', () => {
    it('returns paginated data with staff counts', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseRow]);

      const result = await service.findAll({});

      expect(result.data).toEqual([{ id: 'et-1', name: 'Permanent', staffCount: 3, createdAt: expect.any(String) }]);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
    });
  });

  describe('update()', () => {
    it('throws NotFoundException when the row is missing', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.update('missing-id', { name: 'New Name' })).rejects.toThrow(NotFoundException);
    });

    it('renames an existing row', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([baseRow])
        .mockResolvedValueOnce([{ ...baseRow, name: 'Contractual' }]);

      const result = await service.update('et-1', { name: 'Contractual' });

      expect(result.name).toBe('Contractual');
    });
  });

  describe('softDelete()', () => {
    it('throws NotFoundException when the row is missing', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.softDelete('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('marks the row deleted', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'et-1' }]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(undefined);

      await service.softDelete('et-1');

      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE employment_types SET deleted_at'),
        'et-1',
      );
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/api && npx jest employment-type.service.spec.ts`
Expected: FAIL — `Cannot find module '../employment-type.service'`

- [ ] **Step 5: Write the service**

```ts
// apps/api/src/modules/hr/employment-type.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { EmploymentTypeRow, toEmploymentTypeResponse, EmploymentTypeResponseDto } from './entities/hr.entity';
import { CreateEmploymentTypeDto, UpdateEmploymentTypeDto, EmploymentTypeQueryDto } from './dto/employment-type.dto';

@Injectable()
export class EmploymentTypeService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateEmploymentTypeDto): Promise<EmploymentTypeResponseDto> {
    const rows = await this.tenantPrisma.query<EmploymentTypeRow>(
      `INSERT INTO employment_types (name) VALUES ($1) RETURNING *, 0 AS staff_count`,
      dto.name,
    );
    return toEmploymentTypeResponse(rows[0]);
  }

  async findAll(query: EmploymentTypeQueryDto): Promise<{
    data: EmploymentTypeResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['et.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search) {
      conditions.push(`et.name ILIKE $${idx++}`);
      params.push(`%${query.search}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<EmploymentTypeRow & { total_count: string }>(
      `SELECT et.*,
              COUNT(sp.id) FILTER (WHERE sp.deleted_at IS NULL) AS staff_count,
              COUNT(*) OVER() AS total_count
         FROM employment_types et
         LEFT JOIN staff_profiles sp ON sp.employment_type_id = et.id
         ${where}
         GROUP BY et.id
         ORDER BY et.name ASC
         LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toEmploymentTypeResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateEmploymentTypeDto): Promise<EmploymentTypeResponseDto> {
    const existing = await this.tenantPrisma.query<EmploymentTypeRow>(
      `SELECT * FROM employment_types WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Employment type ${id} not found`);

    const rows = await this.tenantPrisma.query<EmploymentTypeRow>(
      `UPDATE employment_types SET name = $1, updated_at = NOW()
         WHERE id = $2::uuid
         RETURNING *, 0 AS staff_count`,
      dto.name ?? existing[0].name,
      id,
    );
    return toEmploymentTypeResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.tenantPrisma.query<EmploymentTypeRow>(
      `SELECT id FROM employment_types WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Employment type ${id} not found`);
    await this.tenantPrisma.execute(
      `UPDATE employment_types SET deleted_at = NOW() WHERE id = $1::uuid`,
      id,
    );
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/api && npx jest employment-type.service.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Wire the controller routes**

In `apps/api/src/modules/hr/hr.controller.ts`, add to the imports block:

```ts
import { EmploymentTypeService } from './employment-type.service';
import { CreateEmploymentTypeDto, UpdateEmploymentTypeDto, EmploymentTypeQueryDto } from './dto/employment-type.dto';
```

Add `employmentTypeService` to the constructor:

```ts
  constructor(
    private readonly departmentService: DepartmentService,
    private readonly designationService: DesignationService,
    private readonly employmentTypeService: EmploymentTypeService,
    private readonly staffService: StaffService,
    private readonly leaveService: LeaveService,
    private readonly payrollService: PayrollService,
  ) {}
```

Insert this block right before the `// ─── Staff Profiles ───` comment:

```ts
  // ─── Employment Types ──────────────────────────────────────────────────────

  @Post('employment-types')
  @Roles(...PRINCIPAL_AND_ABOVE)
  createEmploymentType(@Body() dto: CreateEmploymentTypeDto) {
    return this.employmentTypeService.create(dto);
  }

  @Get('employment-types')
  @Roles(...TEACHER_AND_ABOVE)
  listEmploymentTypes(@Query() query: EmploymentTypeQueryDto) {
    return this.employmentTypeService.findAll(query);
  }

  @Patch('employment-types/:id')
  @Roles(...PRINCIPAL_AND_ABOVE)
  updateEmploymentType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmploymentTypeDto,
  ) {
    return this.employmentTypeService.update(id, dto);
  }

  @Delete('employment-types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteEmploymentType(@Param('id', ParseUUIDPipe) id: string) {
    return this.employmentTypeService.softDelete(id);
  }

```

- [ ] **Step 8: Register the service in `hr.module.ts`**

```ts
import { EmploymentTypeService } from './employment-type.service';
```

```ts
  providers: [
    DepartmentService,
    DesignationService,
    EmploymentTypeService,
    StaffService,
    LeaveService,
    PayrollService,
  ],
```

- [ ] **Step 9: Run the full HR test suite**

Run: `cd apps/api && npx jest src/modules/hr`
Expected: PASS, all suites green

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/hr/dto/employment-type.dto.ts \
        apps/api/src/modules/hr/employment-type.service.ts \
        apps/api/src/modules/hr/__tests__/employment-type.service.spec.ts \
        apps/api/src/modules/hr/entities/hr.entity.ts \
        apps/api/src/modules/hr/hr.controller.ts \
        apps/api/src/modules/hr/hr.module.ts
git commit -m "feat(api): EmploymentTypeService + /hr/employment-types CRUD routes"
```

---

## Task 3: Backend — wire `employment_type_id` through `StaffService`

**Files:**
- Modify: `apps/api/src/modules/hr/dto/staff.dto.ts`
- Modify: `apps/api/src/modules/hr/staff.service.ts`
- Modify: `apps/api/src/modules/hr/entities/hr.entity.ts`
- Modify: `apps/api/src/modules/hr/__tests__/staff.service.spec.ts`

**Interfaces:**
- Consumes: `employment_types` table from Task 1 (by name only, no service import — this task talks to the table directly via raw SQL, same as it already does for `departments`/`designations`).
- Produces: `StaffResponseDto.employmentTypeId: string`, `.employmentTypeName: string | null` (replaces `employmentType: string`). Task 9/10/11 (web) consume these two field names.

- [ ] **Step 1: Update `staff.dto.ts`**

Remove the `EmploymentType` enum (lines 12–17) and remove `IsEnum` from the `class-validator` import (no longer used elsewhere in this file).

In `CreateStaffDto`, replace:

```ts
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;
```

with:

```ts
  // Mandatory at the HTTP boundary (no @IsOptional) — same pattern as `phone`
  // above. TS-optional only so internal callers that bypass the ValidationPipe
  // (seeds/tests) still compile.
  @IsUUID()
  employmentTypeId?: string;
```

In `UpdateStaffDto`, replace:

```ts
  @IsOptional()
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;
```

with:

```ts
  @IsOptional()
  @IsUUID()
  employmentTypeId?: string;
```

- [ ] **Step 2: Update `hr.entity.ts` — `StaffProfileRow` and `StaffResponseDto`**

In `StaffProfileRow`, replace `employment_type: string;` with:

```ts
  employment_type_id: string;
```

and add to the "// joined" section (alongside `department_name?`/`designation_title?`):

```ts
  employment_type_name?: string | null;
```

In `StaffResponseDto`, replace `employmentType: string;` with:

```ts
  employmentTypeId: string;
  employmentTypeName: string | null;
```

In `toStaffResponse`, replace `employmentType: row.employment_type,` with:

```ts
    employmentTypeId: row.employment_type_id,
    employmentTypeName: row.employment_type_name ?? null,
```

- [ ] **Step 3: Update `staff.service.ts` — `createStaff()`**

Replace the INSERT (currently listing `employment_type` and using `dto.employmentType ?? 'PERMANENT'`):

```ts
      const [prof] = await tx.$queryRawUnsafe<StaffProfileRow[]>(
        `INSERT INTO staff_profiles
           (user_id, employee_id, department_id, designation_id,
            date_of_birth, gender, phone, join_date, employment_type_id,
            base_salary, pan_number, bank_name, bank_account,
            permanent_address, emergency_contact_name, emergency_contact_phone)
         VALUES
           ($1::uuid, $2, $3::uuid, $4::uuid,
            $5::date, $6, $7, $8::date, $9::uuid,
            $10, $11, $12, $13,
            $14, $15, $16)
         RETURNING *`,
        user.id,
        employeeId,
        dto.departmentId ?? null,
        dto.designationId ?? null,
        dto.dateOfBirth ?? null,
        dto.gender ?? null,
        phoneE164,
        dto.joinDate,
        dto.employmentTypeId,
        dto.baseSalary,
        dto.panNumber ?? null,
        dto.bankName ?? null,
        dto.bankAccount ?? null,
        dto.permanentAddress ?? null,
        dto.emergencyContactName ?? null,
        dto.emergencyContactPhone ?? null,
      );
```

A few lines below, in the object built for the return value, replace `department_name: null,\n        designation_title: null,` with:

```ts
        department_name: null,
        designation_title: null,
        employment_type_name: null,
```

- [ ] **Step 4: Update the three SELECT queries (`listStaff`, `getStaffDetail`, `getMyProfile`)**

In each of the three queries, add the join and the selected column. E.g. `listStaff`'s query becomes:

```ts
    const rows = await this.tenantPrisma.query<StaffProfileRow & { total_count: string }>(
      `SELECT sp.*, u.email, u.first_name, u.last_name, u.role, u.is_active,
              d.name AS department_name, des.title AS designation_title,
              et.name AS employment_type_name,
              COUNT(*) OVER() AS total_count
         FROM staff_profiles sp
         JOIN users u ON u.id = sp.user_id
         LEFT JOIN departments d ON d.id = sp.department_id AND d.deleted_at IS NULL
         LEFT JOIN designations des ON des.id = sp.designation_id AND des.deleted_at IS NULL
         LEFT JOIN employment_types et ON et.id = sp.employment_type_id AND et.deleted_at IS NULL
         ${where}
         ORDER BY u.first_name ASC, u.last_name ASC
         LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );
```

In `getStaffDetail`, replace:

```ts
    const rows = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT sp.*, u.email, u.first_name, u.last_name, u.role, u.is_active,
              d.name AS department_name, des.title AS designation_title
         FROM staff_profiles sp
         JOIN users u ON u.id = sp.user_id
         LEFT JOIN departments d ON d.id = sp.department_id AND d.deleted_at IS NULL
         LEFT JOIN designations des ON des.id = sp.designation_id AND des.deleted_at IS NULL
         WHERE sp.id = $1::uuid AND sp.deleted_at IS NULL`,
      id,
    );
```

with:

```ts
    const rows = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT sp.*, u.email, u.first_name, u.last_name, u.role, u.is_active,
              d.name AS department_name, des.title AS designation_title,
              et.name AS employment_type_name
         FROM staff_profiles sp
         JOIN users u ON u.id = sp.user_id
         LEFT JOIN departments d ON d.id = sp.department_id AND d.deleted_at IS NULL
         LEFT JOIN designations des ON des.id = sp.designation_id AND des.deleted_at IS NULL
         LEFT JOIN employment_types et ON et.id = sp.employment_type_id AND et.deleted_at IS NULL
         WHERE sp.id = $1::uuid AND sp.deleted_at IS NULL`,
      id,
    );
```

In `getMyProfile`, replace:

```ts
    const rows = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT sp.*, u.email, u.first_name, u.last_name, u.role, u.is_active,
              d.name AS department_name, des.title AS designation_title
         FROM staff_profiles sp
         JOIN users u ON u.id = sp.user_id
         LEFT JOIN departments d ON d.id = sp.department_id AND d.deleted_at IS NULL
         LEFT JOIN designations des ON des.id = sp.designation_id AND des.deleted_at IS NULL
         WHERE sp.user_id = $1::uuid AND sp.deleted_at IS NULL`,
      userId,
    );
```

with:

```ts
    const rows = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT sp.*, u.email, u.first_name, u.last_name, u.role, u.is_active,
              d.name AS department_name, des.title AS designation_title,
              et.name AS employment_type_name
         FROM staff_profiles sp
         JOIN users u ON u.id = sp.user_id
         LEFT JOIN departments d ON d.id = sp.department_id AND d.deleted_at IS NULL
         LEFT JOIN designations des ON des.id = sp.designation_id AND des.deleted_at IS NULL
         LEFT JOIN employment_types et ON et.id = sp.employment_type_id AND et.deleted_at IS NULL
         WHERE sp.user_id = $1::uuid AND sp.deleted_at IS NULL`,
      userId,
    );
```

- [ ] **Step 5: Update `updateStaff()`**

Replace the UPDATE statement's `employment_type = $4,` with `employment_type_id = $4::uuid,`, and replace the corresponding param:

```ts
      dto.employmentTypeId ?? p.employment_type_id,
```

(replacing `dto.employmentType ?? p.employment_type,`)

- [ ] **Step 6: Update the test fixture**

In `apps/api/src/modules/hr/__tests__/staff.service.spec.ts`, in `baseProfileRow`, replace:

```ts
  employment_type: 'PERMANENT',
```

with:

```ts
  employment_type_id: 'et-1',
  employment_type_name: 'Permanent',
```

- [ ] **Step 7: Write a new failing test for the `employment_type_id` update wiring**

Add a new `describe('updateStaff()', ...)` block (there is currently no test coverage for `updateStaff()` at all — this adds the first, scoped to the field this task changes):

```ts
  describe('updateStaff()', () => {
    it('updates employment_type_id from the DTO', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([baseProfileRow]) // existing-row lookup
        .mockResolvedValueOnce([{ ...baseProfileRow, employment_type_id: 'et-2' }]) // UPDATE ... RETURNING
        .mockResolvedValueOnce([{ ...baseProfileRow, employment_type_id: 'et-2', employment_type_name: 'Contract' }]); // getStaffDetail refetch

      const result = await service.updateStaff('profile-1', { employmentTypeId: 'et-2' } as any);

      const updateCall = (tenantPrisma.query as jest.Mock).mock.calls[1];
      expect(updateCall[0]).toContain('employment_type_id = $4');
      expect(updateCall).toContain('et-2');
      expect(result.employmentTypeName).toBe('Contract');
    });
  });
```

Place it right after the `getMyProfile()` describe block.

- [ ] **Step 8: Run the test to verify the new test fails, then passes**

Run: `cd apps/api && npx jest staff.service.spec.ts`
Expected first run (before Steps 3–5 are saved): FAIL. After Steps 3–5: PASS, all suites in the file green (createStaff/getMyProfile/addDocument/softDeleteStaff tests keep passing unmodified since they only reference `baseProfileRow` by spread).

- [ ] **Step 9: Run the full API test suite to check for fallout**

Run: `cd apps/api && npm test`
Expected: PASS. (`staff.dto.spec.ts` does not reference `employmentType` at all per a prior grep, so it needs no changes.)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/hr/dto/staff.dto.ts \
        apps/api/src/modules/hr/staff.service.ts \
        apps/api/src/modules/hr/entities/hr.entity.ts \
        apps/api/src/modules/hr/__tests__/staff.service.spec.ts
git commit -m "feat(api): wire staff_profiles.employment_type_id through StaffService"
```

---

## Task 4: Backend — update `seed-motherland.ts` for `employment_type_id`

**Files:**
- Modify: `apps/api/src/prisma/seed-motherland.ts`

**Interfaces:**
- Consumes: `employment_types` table (Task 1), row named `'Permanent'`.

**Note:** this script requires tenant migration `0016_employment_types` to already be applied to `tenant_motherland_school` before it is run. That happens once Task 15 rolls migrations out to all tenants — this task only edits the script, it does not run it.

- [ ] **Step 1: Resolve the `Permanent` row id**

In `apps/api/src/prisma/seed-motherland.ts`, right after the `desigIds` loop (after the line `log.push(\`departments: ${Object.keys(deptIds).length}, designations: ${Object.keys(desigIds).length}\`);`), add:

```ts
      const [permanentType] = await q<{ id: string }>(
        `SELECT id FROM employment_types WHERE name = 'Permanent' AND deleted_at IS NULL`,
      );
```

- [ ] **Step 2: Use it in the teacher-pool INSERT**

Replace:

```ts
        await e(
          `INSERT INTO staff_profiles (user_id, employee_id, department_id, designation_id, gender, join_date, employment_type, base_salary)
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6::date, 'PERMANENT', $7)`,
          u.id, empId, deptIds[t.dept], desigIds[t.desig], t.gender, iso(today), t.salary,
        );
```

with:

```ts
        await e(
          `INSERT INTO staff_profiles (user_id, employee_id, department_id, designation_id, gender, join_date, employment_type_id, base_salary)
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6::date, $7::uuid, $8)`,
          u.id, empId, deptIds[t.dept], desigIds[t.desig], t.gender, iso(today), permanentType.id, t.salary,
        );
```

- [ ] **Step 3: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/prisma/seed-motherland.ts
git commit -m "fix(api): seed-motherland.ts resolves employment_type_id after the lookup-table migration"
```

---

## Task 5: Tenant migration — `role_labels` table

**Files:**
- Create: `apps/api/migrations/tenant/0017_role_labels.sql`

**Interfaces:**
- Produces: table `role_labels(role VARCHAR(30) PRIMARY KEY, label VARCHAR(50), updated_at)`.

- [ ] **Step 1: Write the migration file**

```sql
-- 0017_role_labels.sql
-- Per-school override for how staff-facing role names are displayed (e.g.
-- "Academic Coordinator" -> "Vice Principal"). Purely a display layer: the
-- underlying Role enum, @Roles() guards, and RolesGuard are completely
-- untouched. No seed rows — an absent row means "use the default" (Title Case
-- of the enum value), computed in RoleLabelService, not here.

CREATE TABLE IF NOT EXISTS role_labels (
  role        VARCHAR(30)  PRIMARY KEY,
  label       VARCHAR(50)  NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Canary — apply to `demo` only**

Run: `cd apps/api && npm run migrate:tenants -- --tenant demo`
Expected: `tenant=demo migration=0017_role_labels status=applied ...`

- [ ] **Step 3: Verify**

Run: `npm run migrate:tenants -- --status`
Expected: `demo` shows `0017_role_labels` as latest applied.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/tenant/0017_role_labels.sql
git commit -m "feat(api): tenant migration for role_labels override table"
```

---

## Task 6: Backend — `RoleLabelService` + DTO + controller routes

**Files:**
- Create: `apps/api/src/modules/hr/dto/role-label.dto.ts`
- Create: `apps/api/src/modules/hr/role-label.service.ts`
- Create: `apps/api/src/modules/hr/__tests__/role-label.service.spec.ts`
- Modify: `apps/api/src/modules/hr/entities/hr.entity.ts` (add `RoleLabelRow`, `RoleLabelResponseDto`)
- Modify: `apps/api/src/modules/hr/hr.controller.ts` (add routes)
- Modify: `apps/api/src/modules/hr/hr.module.ts` (register service)

**Interfaces:**
- Consumes: `role_labels` table (Task 5), `Role` enum from `apps/api/src/modules/common/enums/role.enum.ts`.
- Produces: `RoleLabelService.findAll(): Promise<RoleLabelResponseDto[]>` (6 entries, one per editable role), `.upsert(role, label): Promise<RoleLabelResponseDto>`, `.reset(role): Promise<RoleLabelResponseDto>`, all throwing `BadRequestException` for a role outside `EDITABLE_ROLES`. Routes: `GET /hr/role-labels`, `PUT/DELETE /hr/role-labels/:role`. Task 12 (web) consumes the response shape `{role: string, label: string, isOverridden: boolean}`.

- [ ] **Step 1: Write the DTO**

```ts
// apps/api/src/modules/hr/dto/role-label.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpsertRoleLabelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label: string;
}
```

- [ ] **Step 2: Add row/response types to `hr.entity.ts`**

Add after the `EmploymentTypeResponseDto` interface added in Task 2:

```ts
export interface RoleLabelRow {
  role: string;
  label: string;
  updated_at: Date | string;
}

export interface RoleLabelResponseDto {
  role: string;
  label: string;
  isOverridden: boolean;
}
```

(No mapper function needed — the merge-with-defaults logic lives in the service, since it needs the fixed 6-role list, not just one row.)

- [ ] **Step 3: Write the failing test**

```ts
// apps/api/src/modules/hr/__tests__/role-label.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RoleLabelService } from '../role-label.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

describe('RoleLabelService', () => {
  let service: RoleLabelService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RoleLabelService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(RoleLabelService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  describe('findAll()', () => {
    it('falls back to the computed default label when no override exists', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.findAll();

      expect(result).toContainEqual({ role: 'ACADEMIC_COORDINATOR', label: 'Academic Coordinator', isOverridden: false });
      expect(result).toHaveLength(6);
    });

    it('uses the override label and flags isOverridden when a row exists', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { role: 'ACCOUNTANT', label: 'Finance Officer', updated_at: new Date('2024-01-01') },
      ]);

      const result = await service.findAll();

      expect(result).toContainEqual({ role: 'ACCOUNTANT', label: 'Finance Officer', isOverridden: true });
    });
  });

  describe('upsert()', () => {
    it('rejects a role outside the editable set', async () => {
      await expect(service.upsert('STUDENT', 'Learner')).rejects.toThrow(BadRequestException);
      await expect(service.upsert('PLATFORM_ADMIN', 'Owner')).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.execute).not.toHaveBeenCalled();
    });

    it('upserts a label for an editable role', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await service.upsert('TEACHER', 'Facilitator');

      expect(result).toEqual({ role: 'TEACHER', label: 'Facilitator', isOverridden: true });
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO role_labels'),
        'TEACHER',
        'Facilitator',
      );
    });
  });

  describe('reset()', () => {
    it('rejects a role outside the editable set', async () => {
      await expect(service.reset('PARENT')).rejects.toThrow(BadRequestException);
    });

    it('deletes the override and returns the default label', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await service.reset('LIBRARIAN');

      expect(result).toEqual({ role: 'LIBRARIAN', label: 'Librarian', isOverridden: false });
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/api && npx jest role-label.service.spec.ts`
Expected: FAIL — `Cannot find module '../role-label.service'`

- [ ] **Step 5: Write the service**

```ts
// apps/api/src/modules/hr/role-label.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { RoleLabelRow, RoleLabelResponseDto } from './entities/hr.entity';
import { Role } from '../common/enums/role.enum';

export const EDITABLE_ROLES: Role[] = [
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.ACCOUNTANT,
  Role.LIBRARIAN,
  Role.TEACHER,
];

function defaultLabelFor(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

@Injectable()
export class RoleLabelService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async findAll(): Promise<RoleLabelResponseDto[]> {
    const rows = await this.tenantPrisma.query<RoleLabelRow>(`SELECT * FROM role_labels`);
    const overrides = new Map(rows.map((r) => [r.role, r.label]));

    return EDITABLE_ROLES.map((role) => ({
      role,
      label: overrides.get(role) ?? defaultLabelFor(role),
      isOverridden: overrides.has(role),
    }));
  }

  async upsert(role: string, label: string): Promise<RoleLabelResponseDto> {
    if (!EDITABLE_ROLES.includes(role as Role)) {
      throw new BadRequestException(`Role ${role} is not editable`);
    }
    await this.tenantPrisma.execute(
      `INSERT INTO role_labels (role, label) VALUES ($1, $2)
         ON CONFLICT (role) DO UPDATE SET label = $2, updated_at = NOW()`,
      role,
      label,
    );
    return { role, label, isOverridden: true };
  }

  async reset(role: string): Promise<RoleLabelResponseDto> {
    if (!EDITABLE_ROLES.includes(role as Role)) {
      throw new BadRequestException(`Role ${role} is not editable`);
    }
    await this.tenantPrisma.execute(`DELETE FROM role_labels WHERE role = $1`, role);
    return { role, label: defaultLabelFor(role), isOverridden: false };
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/api && npx jest role-label.service.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Wire the controller routes**

In `apps/api/src/modules/hr/hr.controller.ts`:

Add `Put` to the `@nestjs/common` import list (currently `Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards`):

```ts
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
```

Add to the imports block:

```ts
import { RoleLabelService } from './role-label.service';
import { UpsertRoleLabelDto } from './dto/role-label.dto';
```

Add `roleLabelService` to the constructor (alongside `employmentTypeService` from Task 2):

```ts
  constructor(
    private readonly departmentService: DepartmentService,
    private readonly designationService: DesignationService,
    private readonly employmentTypeService: EmploymentTypeService,
    private readonly roleLabelService: RoleLabelService,
    private readonly staffService: StaffService,
    private readonly leaveService: LeaveService,
    private readonly payrollService: PayrollService,
  ) {}
```

Insert this block right after the Employment Types block added in Task 2 (still before `// ─── Staff Profiles ───`):

```ts
  // ─── Role Labels ───────────────────────────────────────────────────────────

  @Get('role-labels')
  @Roles(...TEACHER_AND_ABOVE)
  listRoleLabels() {
    return this.roleLabelService.findAll();
  }

  @Put('role-labels/:role')
  @Roles(...PRINCIPAL_AND_ABOVE)
  upsertRoleLabel(@Param('role') role: string, @Body() dto: UpsertRoleLabelDto) {
    return this.roleLabelService.upsert(role, dto.label);
  }

  @Delete('role-labels/:role')
  @Roles(...PRINCIPAL_AND_ABOVE)
  resetRoleLabel(@Param('role') role: string) {
    return this.roleLabelService.reset(role);
  }

```

- [ ] **Step 8: Register the service in `hr.module.ts`**

```ts
import { RoleLabelService } from './role-label.service';
```

```ts
  providers: [
    DepartmentService,
    DesignationService,
    EmploymentTypeService,
    RoleLabelService,
    StaffService,
    LeaveService,
    PayrollService,
  ],
```

- [ ] **Step 9: Run the full API test suite**

Run: `cd apps/api && npm test`
Expected: PASS, all suites green

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/hr/dto/role-label.dto.ts \
        apps/api/src/modules/hr/role-label.service.ts \
        apps/api/src/modules/hr/__tests__/role-label.service.spec.ts \
        apps/api/src/modules/hr/entities/hr.entity.ts \
        apps/api/src/modules/hr/hr.controller.ts \
        apps/api/src/modules/hr/hr.module.ts
git commit -m "feat(api): RoleLabelService + /hr/role-labels routes"
```

---

## Task 7: Frontend — Employment Type types, API client, hooks

**Files:**
- Modify: `apps/web/types/api.types.ts`
- Modify: `apps/web/lib/api/hr.api.ts`
- Modify: `apps/web/lib/hooks/use-hr.ts`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /hr/employment-types(/:id)` (Task 2).
- Produces: `EmploymentType { id: string; name: string; }` type; `useEmploymentTypes()`, `useCreateEmploymentType()`, `useUpdateEmploymentType()`, `useDeleteEmploymentType()` hooks. Tasks 8/9/10/11 consume these hook names directly.

- [ ] **Step 1: Add the `EmploymentType` type and update `StaffSummary`/`CreateStaffData`**

In `apps/web/types/api.types.ts`, add right after the `Designation` line:

```ts
export interface EmploymentType { id: string; name: string; }
```

In `StaffSummary`, replace `employmentType: string;` with:

```ts
  employmentTypeId: string;
  employmentTypeName: string | null;
```

In `CreateStaffData`, replace `joinDate: string; employmentType?: string;` with:

```ts
  joinDate: string; employmentTypeId: string;
```

- [ ] **Step 2: Add API client functions**

In `apps/web/lib/api/hr.api.ts`, add `EmploymentType` to the type import list, and add these functions right after the `deleteDesignation` line:

```ts
  listEmploymentTypes: () => api.get<ApiResponse<PaginatedResponse<EmploymentType>>>('/hr/employment-types'),
  createEmploymentType: (data: { name: string }) =>
    api.post<ApiResponse<EmploymentType>>('/hr/employment-types', data),
  updateEmploymentType: (id: string, data: { name: string }) =>
    api.patch<ApiResponse<EmploymentType>>(`/hr/employment-types/${id}`, data),
  deleteEmploymentType: (id: string) => api.delete(`/hr/employment-types/${id}`),
```

- [ ] **Step 3: Add hooks**

In `apps/web/lib/hooks/use-hr.ts`, add these functions right after `useDeleteDesignation`:

```ts
export function useEmploymentTypes() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'employment-types'],
    queryFn: () => hrApi.listEmploymentTypes().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useCreateEmploymentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => hrApi.createEmploymentType(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'employment-types'] }); },
  });
}

export function useUpdateEmploymentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      hrApi.updateEmploymentType(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'employment-types'] }); },
  });
}

export function useDeleteEmploymentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrApi.deleteEmploymentType(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'employment-types'] }); },
  });
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: **fails** — `StaffSummary.employmentTypeId`/`CreateStaffData.employmentTypeId` are now required but nothing produces or consumes them yet (Tasks 9–11 fix this). This is expected at this point in the plan; confirm the errors are only in `hr/staff/page.tsx`, `hr/staff/[id]/page.tsx`, `hr/staff/[id]/edit/page.tsx`, and `components/onboarding/staff-step.tsx` (the four files Tasks 9–11 touch) — not in `api.types.ts`, `hr.api.ts`, or `use-hr.ts` themselves.

- [ ] **Step 5: Commit**

```bash
git add apps/web/types/api.types.ts apps/web/lib/api/hr.api.ts apps/web/lib/hooks/use-hr.ts
git commit -m "feat(web): employment-type API client + hooks"
```

---

## Task 8: Frontend — HR Setup page: Employment Types tab

**Files:**
- Modify: `apps/web/app/(school)/hr/setup/page.tsx`

**Interfaces:**
- Consumes: `useEmploymentTypes`, `useCreateEmploymentType`, `useUpdateEmploymentType`, `useDeleteEmploymentType` (Task 7); shared `ConfigSection`/`ConfigRow`/`EmptyState` components already in this file.

- [ ] **Step 1: Import the new hooks and type**

In the `use-hr` import block, add `useEmploymentTypes, useCreateEmploymentType, useUpdateEmploymentType, useDeleteEmploymentType,` (after the designation hooks, before the leave-type hooks). Add `EmploymentType` to the `import type { Department, Designation, LeaveType }` line.

- [ ] **Step 2: Add the tab entry**

Replace:

```ts
type Tab = 'departments' | 'designations' | 'leave-types';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'departments', label: 'Departments', icon: <Users className="h-4 w-4" /> },
  { key: 'designations', label: 'Designations', icon: <Settings className="h-4 w-4" /> },
  { key: 'leave-types', label: 'Leave Types', icon: <Calendar className="h-4 w-4" /> },
];
```

with:

```ts
type Tab = 'departments' | 'designations' | 'employment-types' | 'leave-types';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'departments', label: 'Departments', icon: <Users className="h-4 w-4" /> },
  { key: 'designations', label: 'Designations', icon: <Settings className="h-4 w-4" /> },
  { key: 'employment-types', label: 'Employment Types', icon: <Briefcase className="h-4 w-4" /> },
  { key: 'leave-types', label: 'Leave Types', icon: <Calendar className="h-4 w-4" /> },
];
```

Add `Briefcase` to the `lucide-react` import line.

Add the render line right after `{activeTab === 'designations' && <DesignationsTab />}`:

```tsx
      {activeTab === 'employment-types' && <EmploymentTypesTab />}
```

- [ ] **Step 3: Add the `EmploymentTypesTab` component**

Insert this new component right after the `DesignationsTab` function's closing brace (before the `// ── Leave Types Tab ──` comment):

```tsx
// ── Employment Types Tab ──────────────────────────────────────────────────────

function EmploymentTypesTab() {
  const { data: employmentTypes, isLoading } = useEmploymentTypes();
  const create = useCreateEmploymentType();
  const update = useUpdateEmploymentType();
  const remove = useDeleteEmploymentType();

  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await create.mutateAsync({ name });
      setNewName('');
      toast.success('Employment type created');
    } catch {
      toast.error('Failed to create employment type');
    }
  }

  async function handleUpdate(id: string) {
    const name = editName.trim();
    if (!name) return;
    try {
      await update.mutateAsync({ id, data: { name } });
      setEditId(null);
      toast.success('Employment type updated');
    } catch {
      toast.error('Failed to update employment type');
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Employment type deleted');
    } catch {
      toast.error('Failed to delete employment type');
    }
  }

  return (
    <ConfigSection
      title="Employment Types"
      description="Categories of staff employment (e.g. Permanent, Part Time, Visiting Faculty)"
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2">
          <Input
            placeholder="Employment type name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            className="max-w-xs"
          />
          <Button
            size="sm"
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={handleCreate}
            disabled={!newName.trim() || create.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      }
    >
      {employmentTypes && employmentTypes.length === 0 && (
        <EmptyState message="No employment types yet. Add one above." />
      )}
      {employmentTypes?.map((et: EmploymentType) => (
        <ConfigRow
          key={et.id}
          isEditing={editId === et.id}
          editValue={editName}
          onEditChange={setEditName}
          onStartEdit={() => { setEditId(et.id); setEditName(et.name); }}
          onSave={() => handleUpdate(et.id)}
          onCancel={() => setEditId(null)}
          onDelete={() => handleDelete(et.id)}
          isSaving={update.isPending}
        >
          <span className="font-medium text-sm text-gray-800 dark:text-white">{et.name}</span>
        </ConfigRow>
      ))}
    </ConfigSection>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: same pre-existing failures as the end of Task 7 (staff pages/onboarding), nothing new from this file.

- [ ] **Step 5: Manual check**

Start the dev server (`npm run dev` in `apps/web`, API running), log in as a PRINCIPAL-or-above user, go to HR → Setup → "Employment Types" tab. Add a type, rename it, delete it — confirm each toasts success and the list updates without a page reload.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(school)/hr/setup/page.tsx"
git commit -m "feat(web): Employment Types tab on HR Setup page"
```

---

## Task 9: Frontend — Staff list page: employment type + role wiring (add dialog, filters, CSV)

**Files:**
- Modify: `apps/web/app/(school)/hr/staff/page.tsx`

**Interfaces:**
- Consumes: `useEmploymentTypes` (Task 7).

- [ ] **Step 1: Replace the hardcoded `EMPLOYMENT_TYPES` constant with the hook**

Remove the line `const EMPLOYMENT_TYPES = ['PERMANENT', 'TEMPORARY', 'PART_TIME', 'CONTRACT'];`.

Add `useEmploymentTypes` to the `use-hr` import list.

Inside `StaffListPage()`, right after `const { data: designations } = useDesignations();`, add:

```ts
  const { data: employmentTypes } = useEmploymentTypes();
```

- [ ] **Step 2: Make `employmentTypeId` the form field**

Replace the form's initial state:

```ts
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', role: '',
    departmentId: '', designationId: '',
    joinDate: '', baseSalary: '', employmentType: '',
    phone: '', gender: '', dateOfBirth: '',
  });
```

with:

```ts
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', role: '',
    departmentId: '', designationId: '',
    joinDate: '', baseSalary: '', employmentTypeId: '',
    phone: '', gender: '', dateOfBirth: '',
  });
```

- [ ] **Step 3: Require it in `handleAddStaff()` and send the right field**

Replace the required-fields check:

```ts
    if (!form.firstName || !form.lastName || !form.email || !form.role || !form.joinDate || !form.baseSalary) {
```

with:

```ts
    if (!form.firstName || !form.lastName || !form.email || !form.role || !form.joinDate || !form.baseSalary || !form.employmentTypeId) {
```

Replace `employmentType: form.employmentType || undefined,` with `employmentTypeId: form.employmentTypeId,` in the `createStaff.mutateAsync({...})` call.

Replace the form-reset call:

```ts
      setForm({ firstName: '', lastName: '', email: '', role: '', departmentId: '', designationId: '', joinDate: '', baseSalary: '', employmentType: '', phone: '', gender: '', dateOfBirth: '' });
```

with:

```ts
      setForm({ firstName: '', lastName: '', email: '', role: '', departmentId: '', designationId: '', joinDate: '', baseSalary: '', employmentTypeId: '', phone: '', gender: '', dateOfBirth: '' });
```

- [ ] **Step 4: Replace the Employment Type dropdown in the Add Staff dialog**

Replace:

```tsx
            <div className="space-y-1.5">
              <Label>Employment Type</Label>
              <Select value={form.employmentType || 'NONE'} onValueChange={(v) => setField('employmentType', (v ?? '') === 'NONE' ? '' : (v ?? ''))}>
                <SelectTrigger>
                  <span className="truncate">{form.employmentType ? form.employmentType.replace(/_/g, ' ') : 'Select type'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
```

with:

```tsx
            <div className="space-y-1.5">
              <Label>Employment Type *</Label>
              <Select value={form.employmentTypeId} onValueChange={(v) => setField('employmentTypeId', v ?? '')}>
                <SelectTrigger>
                  <span className="truncate">
                    {employmentTypes?.find((t) => t.id === form.employmentTypeId)?.name ?? 'Select type'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {employmentTypes?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
```

(No more "None" option — employment type is now required, matching the DTO change in Task 3.)

- [ ] **Step 5: Update the CSV export**

In the `getData: () => staffList.map(...)` block, replace `Department: s.departmentName ?? '',` 's neighboring line — specifically, the CSV row builder currently has no `Employment Type` column; the list table itself doesn't show one either, so no change is needed here beyond what Task 14 does for `Role`. (No `employmentType` reference exists in the CSV export — confirmed by the earlier grep; this step is a no-op check, not an edit.)

- [ ] **Step 6: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: errors remaining only in `hr/staff/[id]/page.tsx`, `hr/staff/[id]/edit/page.tsx`, and `components/onboarding/staff-step.tsx` (Tasks 10–11).

- [ ] **Step 7: Manual check**

On the Staff list page, open "Add Staff", confirm Employment Type is now sourced from the real list (matches what Task 8 manages), submitting without selecting one shows the "fill all required fields" toast.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/(school)/hr/staff/page.tsx"
git commit -m "feat(web): staff list + add-staff dialog use employmentTypeId"
```

---

## Task 10: Frontend — Staff detail + edit page: employment type wiring

**Files:**
- Modify: `apps/web/app/(school)/hr/staff/[id]/page.tsx`
- Modify: `apps/web/app/(school)/hr/staff/[id]/edit/page.tsx`
- Modify: `apps/web/lib/schemas/staff.schema.ts`

**Interfaces:**
- Consumes: `useEmploymentTypes` (Task 7).

- [ ] **Step 1: Update the Zod schema**

In `apps/web/lib/schemas/staff.schema.ts`, replace:

```ts
  employmentType: z.enum(['PERMANENT', 'TEMPORARY', 'PART_TIME', 'CONTRACT']).optional(),
```

with:

```ts
  employmentTypeId: z.string().optional(),
```

- [ ] **Step 2: Update the detail page's two display sites**

In `apps/web/app/(school)/hr/staff/[id]/page.tsx`, replace both occurrences of:

```tsx
{staff.employmentType.replace(/_/g, ' ')}
```

with:

```tsx
{staff.employmentTypeName ?? '—'}
```

(One occurrence is at line ~352 in the hero card, one at line ~410 in the Employment Details `InfoRow` — both get the same replacement.)

- [ ] **Step 3: Update the edit page**

In `apps/web/app/(school)/hr/staff/[id]/edit/page.tsx`:

Add `useEmploymentTypes` to the `use-hr` import list. Remove the line `const EMPLOYMENT_TYPES = ['PERMANENT', 'TEMPORARY', 'PART_TIME', 'CONTRACT'];`.

Inside `EditStaffPage()`, right after `const { data: designations } = useDesignations();`, add:

```ts
  const { data: employmentTypes } = useEmploymentTypes();
```

Find the `form.reset({...})` call inside the `useEffect` and replace `employmentType: staff.employmentType as EditStaffFormValues['employmentType'],` with:

```ts
      employmentTypeId: staff.employmentTypeId,
```

In `onSubmit`, replace `employmentType: values.employmentType,` with `employmentTypeId: values.employmentTypeId,`.

Replace the `FormField` block:

```tsx
                <FormField
                  control={form.control}
                  name="employmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employment Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <span className="truncate">
                              {field.value
                                ? field.value.replace(/_/g, ' ')
                                : 'Select type'}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EMPLOYMENT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
```

with:

```tsx
                <FormField
                  control={form.control}
                  name="employmentTypeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employment Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <span className="truncate">
                              {employmentTypes?.find((t) => t.id === field.value)?.name ?? 'Select type'}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employmentTypes?.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: errors remaining only in `components/onboarding/staff-step.tsx` (Task 11).

- [ ] **Step 5: Manual check**

Open an existing staff member's detail page — confirm "Employment" and "Employment Type" now show a real name (e.g. "Permanent"), not a raw enum string. Open their edit page, change the Employment Type via the dropdown, save, confirm the detail page reflects it.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(school)/hr/staff/[id]/page.tsx" \
        "apps/web/app/(school)/hr/staff/[id]/edit/page.tsx" \
        apps/web/lib/schemas/staff.schema.ts
git commit -m "feat(web): staff detail + edit page use employmentTypeId"
```

---

## Task 11: Frontend — Onboarding staff step: required Employment Type field

**Files:**
- Modify: `apps/web/components/onboarding/staff-step.tsx`

**Interfaces:**
- Consumes: `useEmploymentTypes` (Task 7).

**Context:** `CreateStaffData.employmentTypeId` became required in Task 7, but this form currently never sends `employmentType` at all (it relied on the old server-side `'PERMANENT'` default, which Task 3 removed). This task adds the missing field.

- [ ] **Step 1: Import the hook**

Add `useEmploymentTypes` to the `@/lib/hooks/use-hr` import (currently only `useCreateStaff`).

- [ ] **Step 2: Add state, default it to "Permanent" once loaded**

Inside `StaffStep()`, add:

```ts
  const { data: employmentTypes } = useEmploymentTypes();
  const [employmentTypeId, setEmploymentTypeId] = useState('');
```

Add a `useEffect` right after the existing `useState` declarations (import `useEffect` from `'react'` alongside the existing `useState` import) to default to "Permanent" once the list loads, without overwriting a user's manual choice:

```ts
  useEffect(() => {
    if (!employmentTypeId && employmentTypes?.length) {
      const permanent = employmentTypes.find((t) => t.name === 'Permanent');
      setEmploymentTypeId(permanent?.id ?? employmentTypes[0].id);
    }
  }, [employmentTypes, employmentTypeId]);
```

- [ ] **Step 3: Require it and include it in the payload**

In `add()`, replace:

```ts
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error('First name, last name and email are required');
      return;
    }
```

with:

```ts
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !employmentTypeId) {
      toast.error('First name, last name, email, and employment type are required');
      return;
    }
```

Add `employmentTypeId,` to the `payload: CreateStaffData = {...}` object (after `baseSalary: Number(baseSalary) || 0,`).

- [ ] **Step 4: Reset it after a successful add**

In `reset()`, add:

```ts
    setEmploymentTypeId(employmentTypes?.find((t) => t.name === 'Permanent')?.id ?? '');
```

(after `setBaseSalary('0');`)

- [ ] **Step 5: Add the field to the form UI**

Add a new `Field` block right after the "Role" field's closing `</Field>` (before the "Phone (optional)" field):

```tsx
          <Field label="Employment Type">
            <Select value={employmentTypeId} onValueChange={(v) => v && setEmploymentTypeId(v)}>
              <SelectTrigger className="w-full">
                <span>{employmentTypes?.find((t) => t.id === employmentTypeId)?.name ?? 'Select type'}</span>
              </SelectTrigger>
              <SelectContent>
                {employmentTypes?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
```

- [ ] **Step 6: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exits 0 — this was the last remaining site from Task 7's pre-existing-failure list.

- [ ] **Step 7: Manual check**

Go through school onboarding's staff step (or re-visit it if already onboarded — it's reachable from the setup flow), confirm Employment Type defaults to "Permanent" once the list loads and a staff member can be added successfully.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/components/onboarding/staff-step.tsx"
git commit -m "feat(web): onboarding staff step sends employmentTypeId"
```

---

## Task 12: Frontend — Role Label types, API client, hooks, lookup helper

**Files:**
- Modify: `apps/web/types/api.types.ts`
- Modify: `apps/web/lib/api/hr.api.ts`
- Modify: `apps/web/lib/hooks/use-hr.ts`
- Create: `apps/web/lib/role-labels.ts`

**Interfaces:**
- Consumes: `GET/PUT/DELETE /hr/role-labels(/:role)` (Task 6).
- Produces: `RoleLabel { role: Role; label: string; isOverridden: boolean; }` type; `useRoleLabels()`, `useUpdateRoleLabel()`, `useResetRoleLabel()` hooks; `roleLabelLookup(labels, role): string` helper. Tasks 13/14 consume these directly.

- [ ] **Step 1: Add the `RoleLabel` type**

In `apps/web/types/api.types.ts`, add right after the `Role` type definition:

```ts
export interface RoleLabel { role: Role; label: string; isOverridden: boolean; }
```

- [ ] **Step 2: Add API client functions**

In `apps/web/lib/api/hr.api.ts`, add `RoleLabel` to the type import list, and add these functions right after `deleteEmploymentType` (added in Task 7):

```ts
  listRoleLabels: () => api.get<ApiResponse<RoleLabel[]>>('/hr/role-labels'),
  updateRoleLabel: (role: string, data: { label: string }) =>
    api.put<ApiResponse<RoleLabel>>(`/hr/role-labels/${role}`, data),
  resetRoleLabel: (role: string) => api.delete<ApiResponse<RoleLabel>>(`/hr/role-labels/${role}`),
```

- [ ] **Step 3: Add hooks**

In `apps/web/lib/hooks/use-hr.ts`, add right after `useDeleteEmploymentType` (added in Task 7):

```ts
export function useRoleLabels() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'role-labels'],
    queryFn: () => hrApi.listRoleLabels().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useUpdateRoleLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ role, label }: { role: string; label: string }) =>
      hrApi.updateRoleLabel(role, { label }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'role-labels'] }); },
  });
}

export function useResetRoleLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: string) => hrApi.resetRoleLabel(role),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'role-labels'] }); },
  });
}
```

- [ ] **Step 4: Write the lookup helper**

```ts
// apps/web/lib/role-labels.ts
import type { RoleLabel } from '@/types/api.types';

/** Given the fetched role-labels list, resolve a role string to its display
 *  label. Falls back to the old underscore-replace behavior for any role not
 *  in the editable set (e.g. PLATFORM_ADMIN/STUDENT/PARENT never appear in HR
 *  staff lists, but this keeps the function total). */
export function roleLabelLookup(labels: RoleLabel[] | undefined, role: string): string {
  return labels?.find((l) => l.role === role)?.label ?? role.replace(/_/g, ' ');
}
```

- [ ] **Step 5: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exits 0 (this task only adds new exports, nothing consumes them yet — Task 14 does).

- [ ] **Step 6: Commit**

```bash
git add apps/web/types/api.types.ts apps/web/lib/api/hr.api.ts apps/web/lib/hooks/use-hr.ts apps/web/lib/role-labels.ts
git commit -m "feat(web): role-label API client + hooks + lookup helper"
```

---

## Task 13: Frontend — HR Setup page: Role Labels tab

**Files:**
- Modify: `apps/web/app/(school)/hr/setup/page.tsx`

**Interfaces:**
- Consumes: `useRoleLabels`, `useUpdateRoleLabel`, `useResetRoleLabel` (Task 12).

- [ ] **Step 1: Import the new hooks and type**

In the `use-hr` import block, add `useRoleLabels, useUpdateRoleLabel, useResetRoleLabel,` (after the employment-type hooks added in Task 8). Add `RoleLabel` to the `import type { Department, Designation, LeaveType, EmploymentType }` line (the `EmploymentType` import was added in Task 8).

- [ ] **Step 2: Add the tab entry**

Replace:

```ts
type Tab = 'departments' | 'designations' | 'employment-types' | 'leave-types';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'departments', label: 'Departments', icon: <Users className="h-4 w-4" /> },
  { key: 'designations', label: 'Designations', icon: <Settings className="h-4 w-4" /> },
  { key: 'employment-types', label: 'Employment Types', icon: <Briefcase className="h-4 w-4" /> },
  { key: 'leave-types', label: 'Leave Types', icon: <Calendar className="h-4 w-4" /> },
];
```

with:

```ts
type Tab = 'departments' | 'designations' | 'employment-types' | 'role-labels' | 'leave-types';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'departments', label: 'Departments', icon: <Users className="h-4 w-4" /> },
  { key: 'designations', label: 'Designations', icon: <Settings className="h-4 w-4" /> },
  { key: 'employment-types', label: 'Employment Types', icon: <Briefcase className="h-4 w-4" /> },
  { key: 'role-labels', label: 'Role Labels', icon: <Tag className="h-4 w-4" /> },
  { key: 'leave-types', label: 'Leave Types', icon: <Calendar className="h-4 w-4" /> },
];
```

Add `Tag` to the `lucide-react` import line.

Add the render line right after `{activeTab === 'employment-types' && <EmploymentTypesTab />}`:

```tsx
      {activeTab === 'role-labels' && <RoleLabelsTab />}
```

- [ ] **Step 3: Add the `RoleLabelsTab` component**

Insert this new component right after the `EmploymentTypesTab` function's closing brace (before the `// ── Leave Types Tab ──` comment). This tab has no "add" affordance (the row set is fixed at 6) and no delete (only rename / reset-to-default):

```tsx
// ── Role Labels Tab ───────────────────────────────────────────────────────────

function RoleLabelsTab() {
  const { data: roleLabels, isLoading } = useRoleLabels();
  const update = useUpdateRoleLabel();
  const reset = useResetRoleLabel();

  const [editRole, setEditRole] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  async function handleUpdate(role: string) {
    const label = editLabel.trim();
    if (!label) return;
    try {
      await update.mutateAsync({ role, label });
      setEditRole(null);
      toast.success('Role label updated');
    } catch {
      toast.error('Failed to update role label');
    }
  }

  async function handleReset(role: string) {
    try {
      await reset.mutateAsync(role);
      toast.success('Role label reset to default');
    } catch {
      toast.error('Failed to reset role label');
    }
  }

  return (
    <ConfigSection
      title="Role Labels"
      description="Rename how staff roles are displayed for your school (e.g. Academic Coordinator -> Vice Principal). The underlying permissions never change."
      isLoading={isLoading}
      addSlot={
        <p className="text-xs text-gray-500">
          Renaming a role only changes its display text — it does not add a new role or change what that role can access.
        </p>
      }
    >
      {roleLabels?.map((rl: RoleLabel) => (
        <div
          key={rl.role}
          className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
        >
          {editRole === rl.role ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(rl.role); if (e.key === 'Escape') setEditRole(null); }}
                className="max-w-xs h-8 text-sm"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(rl.role)} disabled={update.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditRole(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm text-gray-800 dark:text-white">{rl.label}</span>
                {rl.isOverridden && <Badge variant="outline" className="text-xs">Customized</Badge>}
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-gray-400 hover:text-gray-600"
                  onClick={() => { setEditRole(rl.role); setEditLabel(rl.label); }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                {rl.isOverridden && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-gray-400 hover:text-gray-600"
                    onClick={() => handleReset(rl.role)}
                    title="Reset to default"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </ConfigSection>
  );
}
```

Add `RotateCcw` to the `lucide-react` import line (alongside `Tag`).

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 5: Manual check**

Go to HR → Setup → "Role Labels" tab. Confirm all 6 roles show with Title-Case default labels, none marked "Customized". Rename one (e.g. "Accountant" → "Finance Officer"), confirm it toasts success, shows the "Customized" badge, and a "Reset to default" button appears; click it, confirm it reverts to "Accountant" and the badge disappears.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(school)/hr/setup/page.tsx"
git commit -m "feat(web): Role Labels tab on HR Setup page"
```

---

## Task 14: Frontend — wire role-label lookups into staff list/detail/onboarding

**Files:**
- Modify: `apps/web/app/(school)/hr/staff/page.tsx`
- Modify: `apps/web/app/(school)/hr/staff/[id]/page.tsx`
- Modify: `apps/web/components/onboarding/staff-step.tsx`

**Interfaces:**
- Consumes: `useRoleLabels` (Task 12 hook), `roleLabelLookup` (Task 12 helper).

- [ ] **Step 1: Staff list page — role filter, add-dialog role select, CSV export**

In `apps/web/app/(school)/hr/staff/page.tsx`, add `useRoleLabels` to the `use-hr` import list, and `roleLabelLookup` from `@/lib/role-labels`. Inside `StaffListPage()`, add:

```ts
  const { data: roleLabels } = useRoleLabels();
```

Replace the role-filter `SelectTrigger`/`SelectContent` block:

```tsx
          <span className="truncate">
            {roleFilter ? roleFilter.replace(/_/g, ' ') : 'All Roles'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Roles</SelectItem>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
          ))}
        </SelectContent>
```

with:

```tsx
          <span className="truncate">
            {roleFilter ? roleLabelLookup(roleLabels, roleFilter) : 'All Roles'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Roles</SelectItem>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>{roleLabelLookup(roleLabels, r)}</SelectItem>
          ))}
        </SelectContent>
```

Replace the CSV export's `Role: s.role.replace(/_/g, ' '),` with `Role: roleLabelLookup(roleLabels, s.role),`.

Replace the Add Staff dialog's Role field:

```tsx
              <Select value={form.role} onValueChange={(v) => setField('role', v ?? '')}>
                <SelectTrigger>
                  <span className="truncate">{form.role ? form.role.replace(/_/g, ' ') : 'Select role'}</span>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
```

with:

```tsx
              <Select value={form.role} onValueChange={(v) => setField('role', v ?? '')}>
                <SelectTrigger>
                  <span className="truncate">{form.role ? roleLabelLookup(roleLabels, form.role) : 'Select role'}</span>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabelLookup(roleLabels, r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
```

- [ ] **Step 2: Staff detail page — role display**

In `apps/web/app/(school)/hr/staff/[id]/page.tsx`, add `useRoleLabels` to the `use-hr` import and `roleLabelLookup` from `@/lib/role-labels`. Inside the page component, add:

```ts
  const { data: roleLabels } = useRoleLabels();
```

Replace:

```tsx
                <InfoRow
                  label="Role"
                  value={staff.role.replace(/_/g, ' ')}
                />
```

with:

```tsx
                <InfoRow
                  label="Role"
                  value={roleLabelLookup(roleLabels, staff.role)}
                />
```

- [ ] **Step 3: Onboarding staff step — role select labels**

In `apps/web/components/onboarding/staff-step.tsx`, add `useRoleLabels` to the `use-hr` import and `roleLabelLookup` from `@/lib/role-labels`. Inside `StaffStep()`, add:

```ts
  const { data: roleLabels } = useRoleLabels();
```

Replace:

```ts
  const roleLabel = ROLES.find((r) => r.value === role)?.label ?? role;
```

with:

```ts
  const roleLabel = roleLabelLookup(roleLabels, role);
```

(The local `ROLES: {value, label}[]` array's hardcoded `label` fields are no longer read anywhere after this change — leave the array in place since `.value` still defines the offered role set, and its `label` fields now only serve as a fallback shape hint; do not delete the array, only its consumption of `.label` changes.)

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 5: Manual check**

With "Finance Officer" saved as the Accountant override (from Task 13's manual check — or set it again), confirm: the staff list's role filter dropdown shows "Finance Officer" for that role; an existing Accountant's detail page shows "Finance Officer"; the onboarding staff-add form's role dropdown shows "Finance Officer" too. Reset the override afterward via HR Setup → Role Labels, confirm all three revert to "Accountant".

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(school)/hr/staff/page.tsx" \
        "apps/web/app/(school)/hr/staff/[id]/page.tsx" \
        "apps/web/components/onboarding/staff-step.tsx"
git commit -m "feat(web): staff list/detail/onboarding read role labels from the API"
```

---

## Task 15: Rollout — migrate all tenants, full verification

**Files:** none (operational task)

- [ ] **Step 1: Run the full API test suite**

Run: `cd apps/api && npm test`
Expected: PASS, all suites green (should read as "was 511, now +N" per the CLAUDE.md running total — confirm the new count: 511 + 7 (employment-type) + 6 (role-label) + 1 (updateStaff addition) = 525).

- [ ] **Step 2: Run the full web type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 3: Take a backup before rolling to all tenants**

Per `docs/ops/RUNBOOK.md` / the migration README: take a `pg_dump` backup before rolling a migration to all tenants (recovery is restore-from-backup, there is no down migration).

Run: `bash scripts/backup-db.sh` (or the project's documented backup command)

- [ ] **Step 4: Roll both migrations out to all tenants**

Run: `cd apps/api && npm run migrate:tenants -- --dry-run`
Expected: shows `0016_employment_types` and `0017_role_labels` as pending for every tenant except `demo`.

Run: `npm run migrate:tenants`
Expected: both migrations apply cleanly to every remaining tenant; structured log lines show `status=applied` for each.

- [ ] **Step 5: Verify**

Run: `npm run migrate:tenants -- --status`
Expected: every tenant's latest applied migration is `0017_role_labels`.

- [ ] **Step 6: Re-run the motherland seed (optional, dev-only) to confirm Task 4's fix works against real migrated data**

Run: `cd apps/api && npx ts-node src/prisma/seed-motherland.ts`
Expected: completes without error; the new-teachers INSERT succeeds using the resolved `employment_type_id`.

- [ ] **Step 7: End-to-end manual smoke test**

As a PRINCIPAL-or-above user on the `demo` tenant:
1. HR → Setup → Employment Types: add "Visiting Faculty", confirm it appears in the Staff → Add Staff dialog's Employment Type dropdown immediately.
2. HR → Setup → Role Labels: rename "Librarian" to "Media Coordinator", confirm the Staff list's role filter and CSV export reflect it.
3. Add a new staff member end-to-end (Staff list page's Add Staff dialog), selecting the new "Visiting Faculty" employment type and confirming the role dropdown shows the renamed label.
4. Reset the "Librarian" label back to default; delete the "Visiting Faculty" employment type — confirm both actions succeed and nothing else on the Staff pages breaks (the staff member created in step 3 keeps their `employmentTypeId`, since delete is a soft delete that doesn't cascade).

- [ ] **Step 8: Update CLAUDE.md's "What's built so far" section**

Add a new entry under the HR & Staff module bullet (or as a new bullet, matching the existing session-log style in `CLAUDE.md`) summarizing: Employment Type promoted from enum to lookup table (migration 0016), Role display-label override (migration 0017), both exposed via new HR Setup tabs — and update the running API test count.

- [ ] **Step 9: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: log HR lookup CRUD (employment types + role labels) completion"
```
