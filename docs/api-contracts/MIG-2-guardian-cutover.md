# MIG-2 — Guardian Write-Path Cutover + First Real Tenant Migration (0002)

**Save location:** `docs/api-contracts/MIG-2-guardian-cutover.md`
**Scope:** apps/api. Ends the guardian dual-source story: writes move to the normalized table, then `0002` drops `students.guardians` JSONB across all 12 tenants — the migration runner's first real job.
**Prereqs (verify in Step 0):** FIX-1B committed (cbb5d7c) — zero runtime JSONB reads; MIG-1 runner committed; all 12 tenants at `0001_baseline`; test baseline 289.

---

## Opening act — the runner's three missing live proofs (MANDATORY, before anything else)

MIG-1 closed with these proven only at unit-test level. They must be proven live before the runner touches real tenants with a destructive migration. All three run against a **throwaway tenant** created for this purpose.

**P1 — Provisioning round-trip:** create a throwaway tenant via live HTTP `POST register-school` (throwaway slug, e.g. `mig2tmp<rand>`). Paste: the runner's provisioning log showing 0001 applied through the runner path, and `SELECT * FROM <schema>._tenant_migrations`.

**P2 — Checksum tamper abort:** modify one byte of `0001_baseline.sql`, run `migrate:tenants --tenant <throwaway>` → paste the abort error. `git checkout` the file, show clean `--status`.

**P3 — Mid-migration rollback:** create a temp `0002_deliberate_failure.sql` (one valid DDL statement, then a failing statement). Run against the throwaway only → paste output showing the failed migration's transaction rolled back (the valid statement's effect absent — prove with a SELECT), ledger still showing only 0001, runner halted. Delete the temp file before T1.

Keep the throwaway tenant alive — it's the canary-before-the-canary for the real 0002 below. It gets dropped in final cleanup.

## Step 0 — Read and report

1. Confirm prereqs above (grep for runtime JSONB reads = 0; `--status` = 12×0001; test count).
2. `student.service.ts` create/update — the exact shape of the JSONB dual-write at ~L131 and the guardians DTO the API accepts. Report whether **update** also handles guardians or only create.
3. `guardian.service.ts` — the normalized table's insert logic (provisionGuardian/createGuardianAccount): what it sets (`is_primary`, `user_id`, timestamps) and whether it's callable for plain (non-account) guardian rows.
4. The `guardians` table constraints: uniqueness (per student? phone?), FKs, cascade behavior on student delete.
5. Cross-tenant drift + orphan report (read-only SQL across all 12): per tenant, (a) students with JSONB guardians, (b) JSONB guardian entries lacking a matching normalized row (match on student_id + phone), (c) phone mismatches on primaries. Paste the full 12-row table. **This is visibility, not a gate** — 0002 backfills before dropping, so drift is handled; but nonzero numbers must be visible in the record.

## Tasks

### T1 — Move the write path
- Student **create** (and update, if Step 0 shows it touches guardians): guardians from the DTO are written to the normalized `guardians` table (via guardian.service or equivalent service-layer logic — tenant-scoped, same insert semantics as provisionGuardian; respect the primary flag; deterministic behavior if the DTO marks zero or multiple primaries: first-listed wins as primary, report this rule in a code comment).
- Remove the JSONB write entirely. Remove the `@deprecated` field from the entity/types. The API's external DTO contract must NOT change — clients keep sending the same guardians array.
- CSV import path: Step 0 item 2 must check whether student CSV import also writes guardians; if so, cut it over identically.
- Update/extend unit tests; suite must stay ≥289.

### T2 — Write `0002_drop_students_guardians.sql`
Two statements, in order, `{{schema}}`-scoped:
1. **Idempotent backfill** (same semantics as the 0001 backfill: JSONB → normalized rows, `ON CONFLICT DO NOTHING`) — guarantees any row written to JSONB after FIX-1B's snapshot is preserved.
2. `ALTER TABLE {{schema}}.students DROP COLUMN IF EXISTS guardians;`
Note: 0001 still creates the column + runs its backfill for fresh tenants; 0002 then drops it. New-tenant provisioning therefore stays correct with zero changes to 0001 (immutability preserved).

### T3 — Safety snapshot before the real run
Before 0002 touches any real tenant: `pg_dump` the `students` and `guardians` tables of all 12 tenant schemas to a timestamped file under a local `backups/` dir (gitignored). Paste the file listing + sizes. This is the forward-only philosophy's other half: no down migrations, so the restore path must exist before the destructive step.

## Rollout — strict order, raw output at every step

1. **Throwaway tenant** (from the opening act): apply 0002 → verify column gone, ledger at 0002.
2. **Live write proof on throwaway:** `POST` a new student with 2 guardians (one primary) via HTTP → SELECT read-back from `guardians` showing both rows, correct primary; confirm the students row has no guardians column.
3. **Canary:** `migrate:tenants --tenant demo` → status, column-gone check, plus the same live student-create proof against demo (clean up the test student + guardian rows with read-backs).
4. **All 12:** dry-run first (paste), then the real run (full per-tenant log), then `--status` showing 12×0002, and a cross-schema SQL read-back: every tenant's students table lacks the column + per-tenant guardians row counts (compare to Step 0 item 5's counts — backfill means counts may only grow, never shrink; paste the comparison).
5. **Post-run app proof:** bulk-SMS recipient resolution (log-only) against motherland-school still resolves ~51 — proves the read path survives the column drop.
6. **Cleanup:** drop the throwaway tenant (schema + public rows), read-back 0 remaining; remove the temp failure migration if any trace remains; suite run ≥289.

Commit: migration file + write-path changes + spec doc, `feat(api): guardian JSONB retired — writes normalized, 0002 applied via runner (MIG-2)`.

## Out of scope
- Backup *automation* (OPS-1 — T3's manual dump is a one-off).
- Guardian-profile endpoint / guardian edit UI gaps (audit item 19).
- Deleting the 6 leftover verification tenants (separate decision, still pending).
