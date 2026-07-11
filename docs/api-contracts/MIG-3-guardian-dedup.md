# MIG-3 — Guardian Dedup (0003) + Migration-File LF Pin

**Save location:** `docs/api-contracts/MIG-3-guardian-dedup.md`
**Scope:** apps/api. Small session: one hygiene commit, one forward migration through the runner.
**Source:** MIG-2 close findings — (1) CRLF smudge risk on migration files under core.autocrlf=true; (2) ~50 duplicate guardian rows in tenant_motherland_school created by 0002's PK-keyed backfill (151 rows / 51 distinct (student_id, phone) pairs).

---

## T1 — LF pin (own commit, first)

- Create/extend `.gitattributes` with: `apps/api/migrations/tenant/*.sql text eol=lf`
- Renormalize (`git add --renormalize` on that path) and verify the committed blobs are LF and their sha256 still equals the ledger checksums (0001 = 7bd9e318…, 0002 = c0932ec9…). If renormalization would change a blob, STOP and report before committing — that would mean a CRLF version got committed at some point and the checksums need reconciling deliberately.
- Add one line to the migrations README: migration files are LF-pinned because the ledger checksums are byte-checksums.
- Commit: `chore(api): LF-pin tenant migration files (checksum integrity)`

## T2 — Write `0003_dedup_guardians.sql`

Duplicate definition: rows in `{{schema}}.guardians` sharing identical `(student_id, phone, first_name, last_name, relation)`.

**Survivor rule, in priority order (this exact order matters):**
1. A row with `user_id IS NOT NULL` (account-linked — deleting it would break a parent's login/ownership checks) — if multiple, earliest `created_at`.
2. Else earliest `created_at`, tiebreak smallest `id`.

Implementation: a single idempotent DELETE using a window function (`ROW_NUMBER() OVER (PARTITION BY student_id, phone, first_name, last_name, relation ORDER BY (user_id IS NOT NULL) DESC, created_at ASC, id ASC)`), deleting rn > 1. Idempotent by construction (second run deletes 0).

**Safety invariant inside the migration (before the DELETE):** if any duplicate group contains MORE THAN ONE `user_id IS NOT NULL` row with DIFFERENT user_ids, RAISE an exception (fail the migration) rather than guess — that would mean two real accounts share one identity row-group and needs a human decision. (Postgres: a DO block with a guarded RAISE, or an INSERT-into-temp + conditional RAISE.)

**No unique constraint in this migration.** A father and mother can legitimately share one phone; `(student_id, phone)` uniqueness would reject real Nepali household data. Duplicate *prevention* is now the write path's job (guardian.service / T1 of MIG-2), which creates rows deliberately — not a DB constraint's.

## T3 — Pre-flight report (read-only, before applying anywhere)

Run the dedup SELECT (the window query without the DELETE) across all 12 tenants: per tenant, duplicate-group count, rows-to-delete count, and whether any group trips the multi-account invariant. Paste the 12-row table. Expected: motherland ≈50 to delete, others 0. If any tenant other than motherland shows deletions, or any invariant trip, STOP and report.

## Rollout — runner discipline, strict order

1. Fresh pg_dump snapshot of all 12 `guardians` tables to `backups/` (timestamped, gitignored) — paste listing.
2. Canary: `--tenant demo` (expect 0 deletions — proves idempotence on a no-dup tenant). Status + ledger read-back.
3. `--tenant motherland-school`: apply, then read-backs: total rows (expect 101), distinct (student_id, phone) pairs (expect 51... note: 101 ≠ 51×2 exactly — paste actuals), **every previously user_id-linked row still present** (SELECT count of user_id IS NOT NULL before vs after — must be equal), and bulk-SMS ALL_PARENTS resolution still = 51.
4. All 12: dry-run, real run, `--status` showing 12×0003.
5. Live app proof: parent login → GET a PARENT-scoped route (e.g. /students/my-children) returns HTTP 200 with correct children — proves no account-linked row was deleted.
6. Full suite ≥295, no new failures. Commit: `feat(api): guardian dedup migration 0003 via runner (MIG-3)`.

## Out of scope
- Unique constraints / write-path dup guards beyond what MIG-2 already shipped.
- The 6 leftover verification tenants (still a pending separate decision).
- CI-1, OPS-1.
