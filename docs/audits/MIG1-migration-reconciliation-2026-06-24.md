# MIG1 — Migration-History Reconciliation (2026-06-24)

**Goal:** make the Prisma migration history faithfully reproduce the current schema so `prisma migrate` no longer wants to wipe-and-rebuild. **No app/behavior changes.** All reconciliation developed/verified on a **scratch DB**; the real dev DB was touched only with a non-destructive `resolve --applied`.

## Backup (taken before any change)
```
…\scratchpad\db-backup\aaramva_full_20260624-140851.dump        (3.5 MB, pg_dump -Fc, schema+data)
…\scratchpad\db-backup\aaramva_schemaonly_20260624-140851.sql   (854 KB, schema-only)
```
*(Session scratchpad — copy elsewhere for long-term retention.)*

## Step 0 — Mechanism

- **Public schema** is Prisma-managed: `apps/api/prisma/schema.prisma` (models `Tenant`, `Plan`, `Subscription`, `PlatformConfig`) + 6 migrations under `prisma/migrations/`, tracked in `public._prisma_migrations` (all 6 applied, none rolled back).
- **`platform_admins` / `platform_audit_logs`** were created out-of-band by raw SQL in `src/database/public-schema.sql` (which also re-declares `tenants/plans/subscriptions` with `IF NOT EXISTS` — those are no-ops since Prisma already owns them; only the two platform tables + seed actually take effect). These two tables were **never in the migration history** → the source of the "wants to reset" drift.
- **Tenant schemas** (`tenant_<slug>`) are created per-registration by `TenantService.provisionSchema()` (`tenant.service.ts:52`), which reads `src/modules/tenant/tenant-schema.sql`, substitutes `:schema`, and runs every statement in one transaction. `TenantPrismaService` sets `SET LOCAL search_path` per request. The template is the single source of truth for tenant tables; it also carries idempotent `ALTER … ADD COLUMN IF NOT EXISTS` fix-ups for columns added after the initial table defs (`results_published_at`, `review_remarks`, `students.user_id`, the relational `guardians` table).

## Step 0 — Drift inventory (authoritative, via `migrate diff --from-migrations → live`)

| # | Object | Where it lives | Tracked? | Resolution |
|---|---|---|:--:|---|
| 1 | `platform_admins` table | live public (raw SQL) | ❌ → ✅ | folded into baseline migration |
| 2 | `platform_audit_logs` table (+FK to admins) | live public (raw SQL) | ❌ → ✅ | folded into baseline migration |
| 3 | `tenants.onboardingCompletedAt` (TIMESTAMP(3)) | live public (OB1 hand ALTER; in schema.prisma, no migration) | ❌ → ✅ | folded into baseline migration |
| 4 | tenant `exam_types.results_published_at` (RS1) | template + all 11 tenants | ✅ | already in template; all tenants in sync |
| 5 | tenant `leave_applications.review_remarks` (LV1) | template + all 11 tenants | ✅ | already in template; all tenants in sync |
| 6 | tenant relational `guardians` + `students.user_id` | template + all 11 tenants | ✅ | already in template; all tenants in sync |
| — | `plans.id DEFAULT gen_random_uuid()` vs schema.prisma `@default(uuid())` | migration `add_plans_id_default` + live | n/a | **pre-existing** cosmetic schema.prisma↔DB mismatch — see Findings |

The `migrate diff` from the migration history to the live DB returned **exactly** items 1–3 and nothing else — confirming the full public drift.

## Task 1 — Public baseline (done)

- Added `PlatformAdmin` + `PlatformAuditLog` models to `schema.prisma` (UUID/VARCHAR/TIMESTAMPTZ types mirroring the raw DDL, `NoAction` FK) so the untracked tables become tracked.
- Authored `prisma/migrations/20260624140000_baseline_platform_tables_and_onboarding/migration.sql` containing exactly the items 1–3 DDL (sourced from the live diff so it reproduces live byte-for-byte; `now()` ↔ `CURRENT_TIMESTAMP` are equivalent in PG).
- **Scratch proof:** blank DB → `migrate deploy` (all 7 migrations) → `migrate diff --from-url scratch --to-url live` = **`-- This is an empty migration.`** (clean).
- **Real dev DB:** `prisma migrate resolve --applied 20260624140000_baseline_platform_tables_and_onboarding` (no SQL run — objects already exist). `migrate status` → **Database schema is up to date!**
- **Zero data loss:** only `_prisma_migrations` changed (6 → 7 rows); `tenants=11`, `plans=5`, `platform_admins=1`, `platform_audit_logs=34` identical before/after.

## Task 2 — Tenant template authoritative (done)

- **Scratch proof:** built a fresh tenant from the **current** template and diffed it (same schema name) against the live in-sync `tenant_demo` → **`-- This is an empty migration.`** (clean). Template reproduces the intended tenant schema exactly (45 tables).
- **All existing tenants in sync:** surveyed all 11 `tenant_*` schemas — every one has `exam_types.results_published_at`, `leave_applications.review_remarks`, `leave_applications` table, `guardians` table, `students.user_id`. No sync script needed to run.

## Findings / follow-ups (not fixed here — would be behavior/scope changes)

1. **`plans.id` schema.prisma↔DB cosmetic mismatch (pre-existing).** Migration `add_plans_id_default` set `plans.id DEFAULT gen_random_uuid()` (so raw-SQL inserts work); `schema.prisma` models it as `@default(uuid())` (client-side). `migrate diff --from-migrations → schema.prisma` therefore shows a lone `ALTER TABLE "plans" ALTER COLUMN "id" DROP DEFAULT`. This is **not** a reset and does not affect the baseline/acceptance. Aligning it (`@default(dbgenerated("gen_random_uuid()"))`) would change where the UUID is generated (DB vs client) — a behavior change — so left as-is. Optional follow-up if a fully-silent `migrate dev` is wanted.
2. **No repeatable tenant-schema migration runner.** The template is run only at provisioning. Existing tenants are kept current via interspersed idempotent `ALTER … IF NOT EXISTS` fix-ups, but the template's early tables use bare `CREATE TABLE` (not `IF NOT EXISTS`), so re-running the whole template against an existing tenant fails. Today all tenants happen to be in sync, but there is **no systematic mechanism** to roll a future tenant-schema change across all existing schemas (this is the same class of drift MIG1 just cleaned up on the public side). **Recommend a follow-up:** a lightweight versioned tenant-migration runner (per-schema `_tenant_migrations` ledger + ordered idempotent SQL steps applied across every `tenant_*` schema). Not built here.

**Verdict: reconciled.** Public history reproduces the live schema (clean blank-build diff); baseline marked applied non-destructively; `migrate status` up to date; tenant template authoritative and all tenants in sync; zero data loss.
