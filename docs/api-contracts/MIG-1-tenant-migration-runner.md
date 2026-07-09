# MIG-1 — Tenant Schema Migration Runner

**Save location:** `docs/api-contracts/MIG-1-tenant-migration-runner.md`
**Scope:** apps/api only. Builds migration infrastructure; makes NO actual schema changes to tenant tables beyond installing the ledger.
**Source:** Audit P1-8 — Prisma migrations cover only `public`; per-tenant changes are hand-edited idempotent ALTERs in `tenant-schema.sql` applied only at provisioning. 11 live tenants are in sync by luck.

---

## Design (fixed — do not redesign in-session)

**Forward-only, idempotent-preferred, ledger-tracked, canary-first.**

1. **Migration files** live in `apps/api/migrations/tenant/`, named `NNNN_description.sql` (zero-padded, strictly ordered). Plain SQL, one file per migration. Each file may reference the tenant schema **only** via the placeholder `{{schema}}` which the runner substitutes (regex-guard the substituted value exactly like `TenantPrismaService` does).
2. **`0001_baseline.sql`** is the current `tenant-schema.sql`, frozen verbatim (idempotent already, per audit). `tenant-schema.sql` itself is retired from the provisioning path after this session.
3. **Ledger table** `_tenant_migrations` lives **inside each tenant schema** (self-describing schemas), columns: `id serial PK`, `name text unique`, `checksum text` (sha256 of file bytes), `applied_at timestamptz`, `execution_ms int`.
4. **Runner semantics**, per tenant schema:
   - Take a Postgres advisory lock keyed on the schema name (prevents concurrent runs / provisioning races).
   - Create the ledger table if absent.
   - Compute pending = ordered files minus applied names.
   - **Checksum verification first:** for every already-applied migration, recompute the file checksum; on mismatch → abort the entire run with a clear error. Applied migration files are immutable.
   - Apply each pending migration in its **own transaction** (Postgres DDL is transactional); on success insert the ledger row in the same transaction; on failure → rollback that migration, **halt everything**, report which tenants are now ahead.
5. **No down migrations.** Rollback strategy is restore-from-backup; a mistake is corrected by a new forward migration. State this in the runner's README section.
6. **Provisioning unification:** `register-school` now provisions a new schema by running the runner (all migrations from 0001), not by executing `tenant-schema.sql`. New tenants and migrated tenants are therefore guaranteed byte-identical schema histories.
7. **CLI** (nest-commander or a plain ts-node script — match whatever the repo already uses for scripts):
   - `migrate:tenants` — all tenants, ordered by created_at
   - `migrate:tenants --tenant <slug>` — single tenant (canary)
   - `migrate:tenants --dry-run` — per-tenant pending list, no writes
   - `migrate:tenants --status` — table of every tenant × latest applied migration
8. **Canary convention** (document in the README + CLAUDE.md): every future tenant migration is applied `--tenant <canary-slug>` first, verified, then rolled to all. Pick the demo school as the standing canary.

## Step 0 — Read and report BEFORE any edits

1. `tenant-schema.sql` — full read; confirm it is idempotent end-to-end (every CREATE has IF NOT EXISTS, every ALTER is guarded). Flag any non-idempotent statement — those need fixing in the frozen baseline copy.
2. The provisioning service (register-school flow) — exactly where and how `tenant-schema.sql` executes today, and what transaction/rollback behavior provisioning has if schema creation fails midway.
3. `TenantPrismaService` — the schema-name regex guard and how raw SQL executes, so the runner reuses the same guard and connection approach (the runner should use a direct pg/Prisma raw connection, NOT the request-scoped tenant context).
4. `public.tenants` — how to enumerate active tenant schemas (column for schema name/slug, any status flag that should exclude suspended tenants — report, then include suspended tenants anyway unless a reason not to: a suspended school that reactivates must not be schema-stale).
5. Whether any advisory-lock usage already exists in the codebase.
6. Confirm the current tenant count and list slugs (SELECT, paste raw).

Stop and flag material deviations before editing.

## Tasks

### T1 — Freeze the baseline
Copy `tenant-schema.sql` → `migrations/tenant/0001_baseline.sql` with `{{schema}}` substitution; fix any non-idempotency found in Step 0 **in the copy only**. Original file stays untouched this session (deleted in a later cleanup once the runner is proven).

### T2 — Runner service + CLI
Implement per the Design section. Structured log output per tenant: `tenant=<slug> migration=<name> status=<applied|skipped|failed> ms=<n>`.

### T3 — Wire provisioning
`register-school` provisions via the runner. Its existing behavior on failure (does it drop the half-created schema? Step 0 item 2) must be preserved or improved — a failed provisioning must not leave a ghost schema; report what you did.

### T4 — Ledger bootstrap for the 11 existing tenants
Because `0001_baseline.sql` is idempotent, bootstrapping = simply running the runner: it installs the ledger and applies 0001 (which no-ops against an up-to-date schema) and records it. **This is the only write against real tenants in this session.**

### T5 — Docs
`migrations/tenant/README.md`: how to add a migration, naming, `{{schema}}` rule, immutability/checksum rule, canary convention, no-down-migrations policy, restore-from-backup note. Add a short pointer in CLAUDE.md.

## Verification — raw output required

Order matters: destructive experiments run on throwaway schemas FIRST; real tenants are touched only in step 6.

1. `npx tsc` (build config) + full test suite raw (baseline: current count from FIX-1 close; must not decrease). Unit tests required for: ordering, checksum mismatch abort, pending computation.
2. **Throwaway happy path:** create two temp tenants via register-school (throwaway slugs) → paste runner output showing 0001 applied through the provisioning path, then `SELECT * FROM <schema>._tenant_migrations` read-back.
3. **Checksum tamper proof:** modify a byte in 0001, run `--dry-run` against a temp tenant → paste the abort error. Restore the file (git checkout) and show clean `--status`.
4. **Mid-migration failure proof:** add a temp `0002_deliberate_failure.sql` (valid statement, then a failing one) → run against ONE temp tenant → paste output showing rollback, ledger still at 0001 (SELECT read-back), and runner halt. Delete the temp migration file.
5. **Dry-run + status across temp tenants** — paste both outputs.
6. **Real bootstrap:** `migrate:tenants --dry-run` across all real tenants (paste), then the real run (paste full per-tenant log), then `--status` showing every tenant at 0001, plus a raw SQL read-back: one query listing every tenant schema and its max applied migration.
7. **Cleanup:** drop both temp tenant schemas + their public rows; read-back proving 0 remaining (same discipline as SEC-1).

## Out of scope
- Any actual schema change (the guardian JSONB drop waits for a future migration once FIX-1's decision is settled).
- Prisma-schema/tenant-model drift reconciliation.
- Backup automation (OPS-1).
