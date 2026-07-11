# Tenant schema migrations (MIG-1)

Every school (tenant) has its own Postgres schema `tenant_<slug>`. These schemas
are **not** managed by Prisma (Prisma migrations cover only the `public` schema).
This directory + the runner are how the tenant schemas evolve.

**Design: forward-only, idempotent-preferred, ledger-tracked, canary-first.**

## How it works

- Migration files live here as `NNNN_description.sql` (zero-padded, strictly
  ordered). One migration per file, plain SQL.
- A file references the tenant schema **only** via the placeholder `{{schema}}`.
  The runner substitutes it (regex-guarded, exactly like `TenantPrismaService`).
  Do not hard-code a schema name and do not schema-qualify tables — the runner
  sets `search_path TO "<schema>", public` before applying each migration, so
  write bare table names.
- Each tenant schema carries a ledger table `_tenant_migrations`
  (`id, name, checksum, applied_at, execution_ms`) recording what has been applied.
- Per schema, the runner: takes a per-schema advisory lock, ensures the schema +
  ledger exist, **verifies the checksum of every already-applied migration**
  (abort on mismatch), computes pending = ordered files − applied, and applies
  each pending migration in **its own transaction** (Postgres DDL is
  transactional), writing the ledger row in the same transaction. A failure
  rolls back that migration and halts the whole run.
- `0001_baseline.sql` is the frozen baseline (the former
  `apps/api/src/modules/tenant/tenant-schema.sql`, made fully idempotent). All
  pre-existing tenants bootstrap against it as a no-op. Provisioning a new school
  also runs the runner from `0001`, so new and migrated tenants share a
  byte-identical schema history.

## Adding a migration

1. Create `apps/api/migrations/tenant/NNNN_short_description.sql` (next number).
2. Write idempotent SQL where practical (`CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Reference the schema
   only via `{{schema}}`; use bare (unqualified) table names otherwise.
3. **Canary first:** apply to the demo school, verify, then roll to all:
   ```
   npm run migrate:tenants -- --tenant demo      # canary
   npm run migrate:tenants -- --status           # confirm demo advanced
   npm run migrate:tenants                        # roll to all tenants
   ```
4. Commit the new file. **Applied migration files are immutable** — never edit a
   file after it has been applied anywhere. The runner stores a checksum and will
   refuse to run (checksum-mismatch abort) if an applied file changes. To fix a
   mistake, add a new forward migration.
5. Migration files are **LF-pinned** via the root `.gitattributes` — the ledger
   checksums are byte-checksums, so a CRLF smudge on checkout would abort the
   runner on every tenant.

## Commands

```
npm run migrate:tenants                  # all tenants, ordered by created_at
npm run migrate:tenants -- --tenant demo # single tenant (canary)
npm run migrate:tenants -- --dry-run     # per-tenant pending list, no writes
npm run migrate:tenants -- --status      # table of tenant × latest applied
```

Structured log line per migration: `tenant=<slug> migration=<name> status=<applied|skipped|pending|failed> ms=<n>`.

## No down migrations

There is **no rollback / down migration**. Recovery from a bad migration is
**restore-from-backup**, and forward progress is corrected by a new migration.
Take a backup before rolling a migration to all tenants.
