# HR lookup CRUD: Employment Types + Role Labels

**Date:** 2026-07-18
**Status:** Approved design, pending implementation plan

## Context

The user asked for admin-panel CRUD on "values of attributes like Role, Department,
Designation, Employment" used in the HR/staff module, describing them as important
and currently unmanageable.

Investigation found the request was only half green-field:

- **Department** and **Designation** already have full CRUD — table, service,
  controller, DTOs, and a working web UI (`apps/web/app/(school)/hr/setup/page.tsx`,
  `DepartmentsTab`/`DesignationsTab`). No work needed.
- **Employment Type** is a hardcoded TS enum (`PERMANENT | TEMPORARY | PART_TIME |
  CONTRACT`) constraining a plain `VARCHAR(20)` column on `staff_profiles`. No table,
  no CRUD, no admin UI.
- **Role** is a compile-time enum (`apps/api/src/modules/common/enums/role.enum.ts`)
  wired into `@Roles()` guards across ~60 backend files and several frontend files.
  It is the access-control mechanism itself, not "data" in the sense Department is.

This spec covers the two genuinely missing pieces: **Employment Type** (promoted to a
real lookup table, matching the Department/Designation pattern) and **Role** (display
label override only — the underlying 9-role enum and every guard stay untouched).

**Explicitly out of scope**, decided during brainstorming and not to be re-litigated:

- Rebuilding Department/Designation UI — already done.
- Letting schools create brand-new roles with custom permission sets. That would mean
  replacing the compile-time `@Roles()` guard system with a runtime permission system
  across both API and web, and would not automatically extend role-specific business
  logic (student self-service, guardian linkage, teacher scoping) to a new role. This
  is a separate, much larger RBAC redesign to consider only if a concrete need arises
  later — not part of this feature.
- Toggling which of the 9 fixed roles are "in use" per school — rejected as low-value
  cosmetic-only unless also backend-enforced, which would require the same guard
  changes as full custom roles.

## Section A: Employment Type — promote to a real lookup table

### Data model

New tenant migration `apps/api/migrations/tenant/0016_employment_types.sql` (next
available number; verify at implementation time in case other migrations land first).
Shape copied exactly from `departments` (`apps/api/src/modules/tenant/tenant-schema.sql`):

```sql
CREATE TABLE employment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
```

In the same migration:

1. Seed 4 rows per tenant: `Permanent`, `Temporary`, `Part Time`, `Contract` —
   matching the current enum values so nothing changes for existing data by default.
2. Add `employment_type_id UUID REFERENCES employment_types(id)` to `staff_profiles`.
3. Backfill: for each `staff_profiles` row, set `employment_type_id` by matching the
   existing `employment_type` string to the seeded row's name (`PERMANENT` → row
   named `Permanent`, etc.).
4. Set `employment_type_id NOT NULL` once backfilled.
5. Drop the old `employment_type` VARCHAR column.

This follows the established pattern of normalize-then-drop-legacy-column in one
migration (e.g. MIG-2/MIG-3 for guardians), with no down migration — recovery is
restore-from-backup, per this repo's existing convention. Apply to the `demo` tenant
first (canary), verify, then roll to all tenants via `npm run migrate:tenants`.

Confirmed via grep across `apps/api/src`: `employment_type` is read/written only in
`staff_profiles` INSERT/UPDATE/SELECT paths (`staff.service.ts`, `hr.entity.ts`,
`seed-motherland.ts`) — it does not drive payroll calculation or any other business
logic. The promotion is a mechanical storage-shape change, not a behavior change.

### API

New `EmploymentTypeService` (`apps/api/src/modules/hr/employment-type.service.ts`),
copied field-for-field from `DepartmentService`:

- `create(dto)` → `INSERT INTO employment_types (name) VALUES ($1) RETURNING *`
- `findAll(query)` → paginated, `ILIKE` search on `name`, `deleted_at IS NULL`
- `update(id, dto)` → rename
- `softDelete(id)` → `UPDATE employment_types SET deleted_at = NOW()`. Matches
  Department's behavior exactly: no guard against in-use rows (Department doesn't
  block deleting a department with designations under it either) — a deleted
  employment type simply stops appearing in the picker; existing staff rows keep
  their `employment_type_id` FK (no cascade, no historical data loss).

New routes on `HrController`, same role gating as Department:

| Route | Method | Roles |
|---|---|---|
| `/hr/employment-types` | POST | PRINCIPAL_AND_ABOVE |
| `/hr/employment-types` | GET | TEACHER_AND_ABOVE |
| `/hr/employment-types/:id` | PATCH | PRINCIPAL_AND_ABOVE |
| `/hr/employment-types/:id` | DELETE | OWNER_ONLY |

`apps/api/src/modules/hr/dto/staff.dto.ts`: remove the `EmploymentType` enum and its
`@IsEnum` decorators. `CreateStaffDto` gains a **required** `employmentTypeId: string`
(`@IsUUID()`, no `@IsOptional()`) — the old code's implicit `?? 'PERMANENT'` default
is dropped rather than ported, since silently defaulting to a specific admin-managed
row is fragile (that row could be renamed or soft-deleted later). The staff-create
form's dropdown always has a value to submit, since it's populated from this same
lookup table. `UpdateStaffDto` keeps `employmentTypeId` optional (`@IsOptional()
@IsUUID()`), unchanged semantics — omit to leave as-is. `staff.service.ts`'s raw SQL (currently at
lines ~91, 108, 278, 294) swaps the `employment_type` column/param for
`employment_type_id`. `hr.entity.ts`'s `StaffProfileRow`/response DTO swap
`employment_type: string` for `employmentTypeId: string` (+ optionally a joined
`employmentTypeName` for display, mirroring how designation responses join
`department_name`).

### Web UI

Fourth tab ("Employment Types") on `apps/web/app/(school)/hr/setup/page.tsx`,
component copied from `DepartmentsTab`. New `useEmploymentTypes()` /
`useCreateEmploymentType()` / `useUpdateEmploymentType()` /
`useDeleteEmploymentType()` hooks in `apps/web/lib/hooks/use-hr.ts`, API client
functions in `apps/web/lib/api/hr.api.ts`, mirroring the department hooks exactly.

The hardcoded `EMPLOYMENT_TYPES` array in `apps/web/app/(school)/hr/staff/page.tsx`
(line 45) is replaced by `useEmploymentTypes()`; the staff create/edit dropdowns
submit `employmentTypeId` instead of the enum string.

## Section B: Role — display-label override only

### Data model

New tenant migration `apps/api/migrations/tenant/0017_role_labels.sql`:

```sql
CREATE TABLE role_labels (
  role VARCHAR(30) PRIMARY KEY,
  label VARCHAR(50) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No seed rows. An absent row for a role means "use the default" — Title Case of the
enum value (e.g. `ACADEMIC_COORDINATOR` → `Academic Coordinator`), computed the same
way the current `.replace(/_/g, ' ')` call effectively does.

Only the 6 `WEB_STAFF_ROLES` (`apps/web/lib/route-access.ts`) are editable:
`SCHOOL_OWNER`, `PRINCIPAL`, `ACADEMIC_COORDINATOR`, `ACCOUNTANT`, `LIBRARIAN`,
`TEACHER`. `PLATFORM_ADMIN` (super-admin only) and `STUDENT`/`PARENT` (mobile-only,
never staff-created) can never get a row — enforced server-side (400 on an
out-of-set role), not merely hidden in the UI.

This is deliberately not a full CRUD: the row-set is fixed at 6 possible keys, so
there is no create/delete-arbitrary-row — only "set a label" and "reset to default."
The underlying `Role` enum, every `@Roles()` guard, and `RolesGuard` itself are
completely untouched by this change.

### API

New `RoleLabelService` (`apps/api/src/modules/hr/role-label.service.ts`):

- `findAll()` → returns all 6 editable roles merged with any override:
  `{ role: Role, label: string, isOverridden: boolean }[]`
- `upsert(role, label)` → validates `role` is one of the editable 6 (else 400),
  `INSERT ... ON CONFLICT (role) DO UPDATE`
- `reset(role)` → `DELETE FROM role_labels WHERE role = $1`

Routes on `HrController`:

| Route | Method | Roles |
|---|---|---|
| `/hr/role-labels` | GET | TEACHER_AND_ABOVE |
| `/hr/role-labels/:role` | PUT | PRINCIPAL_AND_ABOVE |
| `/hr/role-labels/:role` | DELETE (reset) | PRINCIPAL_AND_ABOVE |

`GET` is readable by TEACHER_AND_ABOVE because it feeds the staff-role picker, which
non-admin staff-management flows may also render.

### Web UI

Fifth tab ("Role Labels") on `hr/setup/page.tsx`: one row per editable role, inline
rename input, "Reset to default" action shown only when `isOverridden`. New
`useRoleLabels()` / `useUpdateRoleLabel()` / `useResetRoleLabel()` hooks.

Consumers switched to read from `useRoleLabels()` instead of hardcoding label text:

- `apps/web/app/(school)/hr/staff/page.tsx` — the `ROLES` array (line 44) and both
  `.replace(/_/g, ' ')` call sites (lines 291, 328)
- `apps/web/app/(school)/hr/staff/[id]/page.tsx` — `.replace(/_/g, ' ')` (line 401)
- `apps/web/components/onboarding/staff-step.tsx` — its local hardcoded `ROLES:
  {value, label}[]` array (lines 14+)

This gives the app one source of truth for "what does this school call this role,"
instead of three independent hardcoded label sets.

## Testing

- `employment-type.service.spec.ts` and `role-label.service.spec.ts`, mirroring the
  structure of `department.service.spec.ts` / `designation.service.spec.ts`.
- `role-label.service.spec.ts` additionally covers: default-fallback when no override
  row exists, `isOverridden` flag correctness, and the 400 on an out-of-set role
  (`STUDENT`, `PARENT`, `PLATFORM_ADMIN`, or a garbage string).
- Migration correctness verified live on the `demo` tenant before rolling to all:
  every pre-existing `staff_profiles` row's `employment_type_id` resolves to a
  seeded row whose `name` matches its old `employment_type` string; confirm the old
  column is gone afterward.
- No new or modified tests are needed for `@Roles()` guards, `RolesGuard`, or the
  `Role` enum — this feature does not touch them.

## Rollout / risk

This whole feature stays at "lookup table CRUD" risk level:

- Employment Type: additive table + one storage-shape migration behind the existing
  canary process; no auth surface touched.
- Role: purely a display-label layer; the enum, decorators, and guards are unchanged,
  so there is no path by which this work can affect who can access what.
