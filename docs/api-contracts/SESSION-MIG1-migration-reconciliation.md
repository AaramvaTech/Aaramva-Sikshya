# SESSION-MIG1 — Migration-History Reconciliation

**Type:** Backend / database plumbing. The migration history is no longer authoritative — untracked tables (`platform_admins`, `platform_audit_logs`) and hand-applied `ALTER`s (OB1 `onboardingCompletedAt`, RS1 `results_published_at`, LV1 `review_remarks`, the guardian backfill, etc.) mean `prisma migrate` wants to **wipe and rebuild** to reconcile. Since every new school = a fresh schema built from migrations/template, this must run clean before deploying to real schools. **Goal:** the history faithfully reproduces the current schema, with no "wants to reset" warning. **No application/behavior changes.**

**Source of truth:** OB1 (the drift that blocked `migrate dev`); R1/RS1/LV1/OB1 (the hand-applied changes); the schema-per-tenant model (`public` schema via Prisma + per-tenant schemas via a SQL template + custom `TenantPrismaService`).

---

## Hard rules (safety is the point)

1. **Step 0 read-and-report before touching anything** — map the mechanism + produce the full drift inventory first.
2. **Back up first.** `pg_dump` the full dev DB (schema + data); paste the backup location before any other step.
3. **NEVER run a destructive command against the dev DB that holds data** — no `prisma migrate reset`, no `migrate dev` that triggers a reset, no `DROP`. All reconciliation is developed and verified on a **scratch database** restored from a schema-only dump.
4. **The only operations allowed against the real dev DB** are non-destructive: `prisma migrate resolve --applied` (baseline marking, which only updates the `_prisma_migrations` table, runs no SQL) and additive tracked migrations — and only **after** the scratch-DB build diffs clean.
5. **Acceptance = zero diff:** a blank database built purely from the migrations (+ a tenant provisioned from the template) must diff **clean** against the current schema. That's the definition of done.
6. No app code / behavior changes — this is history reconciliation only.

---

## Step 0 — Map + drift inventory (no changes)

- How the **public** schema is migrated: the migrations dir, the `_prisma_migrations` table state, what's tracked vs not.
- How **tenant** schemas are created (the `tenant-schema.sql` template?) and updated (hand-applied to each existing schema?), and how `TenantPrismaService` sets `search_path`.
- The complete **drift inventory** — every table / column / constraint / index in the live schema (public **and** a representative tenant schema) **not** reproduced by the current migrations/template. Known starting points: `platform_admins`, `platform_audit_logs` (untracked tables); `public.tenants.onboardingCompletedAt`; tenant `exam_types.results_published_at`; tenant `leave_applications.review_remarks`; the relational guardians backfill — plus whatever else Step 0 finds.

Report the mechanism + the full inventory + the reconciliation plan, then proceed.

---

## Task 1 — Reconcile the public migration history (baseline + fold)

On the **scratch DB**:
- Baseline the current public schema so the untracked tables become tracked, and fold the hand-applied public `ALTER`s into proper migration files. Use Prisma's **baseline** pattern (generate the migration from the current schema via diff → `migrate resolve --applied`), **not** a reset.
- Verify on scratch: build from blank with `prisma migrate deploy` → the resulting public schema **diffs clean** against the current public schema (paste the empty diff).

Then, against the real dev DB: mark the baseline **applied** (non-destructive `resolve`) so `migrate dev`/`deploy` no longer wants to reset.

## Task 2 — Make `tenant-schema.sql` authoritative + sync existing tenants

- Ensure the tenant template reproduces the **current intended tenant schema** exactly. Verify on scratch: provision a fresh tenant → its schema **diffs clean** against a current in-sync tenant schema (paste).
- Confirm **all existing tenant schemas** are in sync with the template; for any missing the hand-applied tenant columns (`results_published_at`, `review_remarks`, …), produce/run an **idempotent** sync script.
- If there's **no repeatable mechanism for future tenant-schema changes**, flag it and recommend a lightweight tenant-migration runner as a follow-up — don't build a full framework here unless trivial.

---

## Verification

- **Backup location** pasted.
- **Scratch proof:** blank → migrations → public schema diff **clean** (empty); fresh tenant provision → tenant schema diff **clean** vs current.
- **Real dev DB:** `prisma migrate status` shows **no drift / no pending reset** after the baseline. Paste it.
- **Existing tenants:** a check across all existing tenant schemas confirms the key drifted columns are present everywhere. Paste.
- **Zero data loss:** confirm the real DB's data is untouched (only `_prisma_migrations` changed).
- Verdict: reconciled / blocked.
