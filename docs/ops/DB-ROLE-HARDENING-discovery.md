# DB Role Hardening — Discovery Report

**Status:** Discovery only. No code touched, no role created, no grant run, nothing connected
differently. This is the highest-blast-radius change available in this project — every finding
below was checked directly against running config/code, not inferred.

**Method:** read the live `apps/api/.env`, both `docker-compose*.yml` files, every SQL migration
file (tenant + public schema), `TenantPrismaService`/`TenantMigrationService`/
`TenantProvisioningService` in full, `RUNBOOK.md`, `DEPLOY-1-vps-deployment.md`, and
`scripts/backup-db.sh`.

---

## 1. Current state

**Dev, confirmed live:** `apps/api/.env` → `DATABASE_URL="postgresql://postgres:...@localhost:
5432/aaramva_shikshya?schema=public"`. This is the `postgres` role on a native local Postgres 17
install — the actual Postgres superuser, not a Docker-provisioned one. (`.env.example` matches
the same pattern with a placeholder password.) `CLAUDE.md`'s own dev notes and `RUNBOOK.md`
already say this plainly: "the app connects as the `postgres` superuser in dev."

**One thing worth flagging: the repo's root `docker-compose.yml` is stale/unused for the actual
dev setup.** It defines `POSTGRES_USER: sms_user` / `POSTGRES_DB: sms_db` — neither name matches
what's actually running (`postgres` / `aaramva_shikshya`, confirmed live via `.env` and every
`psql` session this project's history has used). Dev is a native local Postgres install, not this
compose file. Not a blocker for this task, just worth knowing before assuming this file describes
reality.

**Production, confirmed from `docker-compose.prod.yml` + `DEPLOY-1-vps-deployment.md`:**
```yaml
postgres:
  image: postgres:17-alpine
  environment:
    POSTGRES_USER: ${POSTGRES_USER}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: ${POSTGRES_DB}
```
No `.env.production` is committed (correctly gitignored — real secrets), so the literal value of
`POSTGRES_USER` isn't visible here. But the *mechanism* is: the official `postgres` Docker image
creates exactly one role at first boot, named by `POSTGRES_USER`, and that role is **always a
superuser** and the owner of `POSTGRES_DB` — this is the image's own documented behavior, not a
project choice. Neither `docker-compose.prod.yml` nor `DEPLOY-1-vps-deployment.md` runs any
follow-up step (no `init.sql`, no post-boot script) that creates a second, lesser role. So
production is, right now, in the identical situation dev is — confirmed independently by
`RUNBOOK.md`'s own "Before a real school goes live" line: "production must run under a dedicated
non-superuser role. Not yet actioned — no role or rotation script exists for this yet."

**Isolation note:** `docker-compose.prod.yml`'s `postgres` service has no host port mapping
(`internal only, not exposed to host` per `DEPLOY-1-vps-deployment.md`'s own architecture
diagram) and sits on its own `aaramva_net` bridge network. The VPS is shared with other
unrelated apps (`golden_park`, `birat_college` — named directly in this compose file's own
comments), but they're not on `aaramva_net` and there's nothing here suggesting they share this
Postgres container. So the superuser blast radius today is scoped to *this app's own* Postgres
container — still a real problem (full data read/write/delete, and Postgres superusers can run
`COPY ... TO/FROM PROGRAM`, i.e. arbitrary OS command execution inside that container, from any
SQL injection or credential leak) — just not a cross-app one on this VPS as far as the compose
files show.

---

## 2. What the app actually needs

**The tenant-isolation model matters here: it's search_path, not roles.**
`TenantPrismaService.run()` (read in full) does this on *every* tenant query:
```ts
return this.prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}", public`);
  return fn(tx);
});
```
One Postgres role, one connection pool, `SET LOCAL search_path` scoped per-transaction. There is
no `SET ROLE`, no per-tenant credential, nowhere in the codebase. This means **whatever role the
app connects as must have DML rights across every `tenant_*` schema and `public`** — Postgres-level
privilege isn't doing tenant isolation here at all (query-level `search_path` + the app's own
`tenantId` checks are); a single role touching everything is the existing design, not something
a role change should try to fix.

**Migration DDL, surveyed across every tenant `.sql` migration + every public-schema Prisma
migration — genuinely clean.** Grepped for `CREATE EXTENSION`, `CREATE FUNCTION`, `CREATE ROLE`,
`CREATE USER`, `GRANT`, `REVOKE`, `ALTER SYSTEM`, `SET ROLE`, `pg_terminate_backend`,
`ALTER ROLE`, `pg_reload_conf` — **zero matches anywhere in `apps/api`.** The only DDL beyond
plain `CREATE TABLE`/`ALTER TABLE`/`CREATE INDEX` found: `CREATE TRIGGER` (once, the ledger
immutability trigger, `0021_bill_ledger.sql`) and `CREATE TYPE ... AS ENUM` (the public schema's
`SubscriptionStatus`). Both are ordinary schema-owner-level DDL — neither requires superuser.
**UUIDs use `gen_random_uuid()`**, which has been built into Postgres core since v13 (this project
runs 16/17) — no `pgcrypto`/`uuid-ossp` extension dependency anywhere, so no `CREATE EXTENSION`
step is hiding in a migration that hasn't run yet either.

**Migrations and runtime currently use the literal same everything.** `migrate-tenants.ts` (the
`npm run migrate:tenants` CLI) boots the **full Nest `AppModule`** via `ts-node` — same
`DATABASE_URL`, same `PrismaService` singleton, same connection the live server uses. Same for
`npm run seed` / `seed:demo` / `seed:admin` and `npx prisma migrate dev|deploy` (public schema).
There is no existing mechanism anywhere in this repo for pointing a migration/seed run at a
*different*, more-privileged connection string than the running app itself uses — that's a
possible future split (§4), not something already half-built.

---

## 3. What would break with a naive minimal (DML-only) role

**One real, load-bearing finding: schema creation is NOT migration-time-only — it runs inside a
live API request.** `TenantMigrationService`'s runner does:
```sql
CREATE SCHEMA IF NOT EXISTS "${schema}"
```
and this is called from `TenantProvisioningService.provision()` (confirmed by direct caller
search: `tenant-provisioning.service.ts` imports and calls `TenantMigrationService`), which is
the shared provisioning path for **both** self-service school registration (`register-school`,
a public unauthenticated endpoint any prospective school owner can hit) **and** super-admin
onboarding. A new school signing up literally causes `CREATE SCHEMA` to run inside that HTTP
request, through the app's own single `DATABASE_URL` connection — not through a separate
elevated migration tool.

**Consequence: a role granted only `SELECT/INSERT/UPDATE/DELETE` on existing schemas would break
new-school registration outright** — `CREATE SCHEMA` would fail with a permission-denied error the
moment the first school tries to sign up after the cutover. This is exactly the kind of "looks
fine in a smoke test, breaks on the one flow you didn't check" trap the user's framing warned
about. The runtime role **must** retain `CREATE` on the database.

**Same finding applies to `DROP SCHEMA`:** `TenantProvisioningService`'s own failure-rollback path
runs `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE` if provisioning fails partway through (read
directly in the file, the `catch` block right after the main transaction). A restricted role
without `DROP` on schemas it owns would leave orphaned partial schemas behind on every failed
signup instead of cleanly rolling back.

**A genuine constraint this discovery turned up, worth stating plainly rather than glossing
over:** Postgres ownership doesn't let you cleanly split "may `CREATE SCHEMA`" from "may run
arbitrary DDL inside schemas it creates." Whichever role runs `CREATE SCHEMA` **becomes the owner
of that schema**, and schema owners can do *any* DDL inside it (`CREATE TABLE`, `ALTER TABLE`,
`CREATE TRIGGER`, `DROP TABLE`, all of it) — there's no Postgres privilege that grants
"create-schema" while denying "everything inside the schema you just created." Since this app's
runtime role must be able to create tenant schemas (previous paragraph), it will unavoidably also
be able to do full DDL inside every schema it creates from that point forward. This directly
shapes the proposal in §4 — a hard runtime/migration role split doesn't cleanly fit this specific
architecture unless tenant provisioning itself moved off the request path (a real, separate,
larger change, not part of this task).

**Nothing else broke on inspection.** No `pg_catalog`/`information_schema` query anywhere assumes
superuser-only visibility (e.g. nothing reads `pg_authid`, nothing needs `pg_read_all_stats`).
`pg_dump`-based backups (`scripts/backup-db.sh`) work fine under a non-superuser role **as long as
that role owns (or has been granted full read access to) what it's dumping** — which the
ownership-reassignment step in §4 already has to do for the cutover to work at all, so backups
keep working "for free," not as a separate fix.

---

## 4. Proposed role(s), grants, and a lockout-safe rollout

**Recommendation: one dedicated non-superuser role, not a split — the ownership constraint in §3
makes a clean split not worth the complexity it would add.** A "migrator" role broader than a
"runtime" role sounds like better least-privilege practice in the abstract, but here it would
only ever differ from the runtime role by *tenant-schema DDL rights the runtime role ends up with
anyway* the moment it provisions its first new school. The one place a split is still real and
worth doing is public-schema Prisma migrations (`prisma migrate deploy`) vs. the day-to-day app —
flagged as optional in the rollout below, not required for the core hardening.

**Proposed role: `aaramva_app`.** Grants, run once by a human connected as the existing `postgres`
superuser (never by the app itself):

```sql
CREATE ROLE aaramva_app WITH LOGIN PASSWORD '<generated>';
GRANT CONNECT ON DATABASE aaramva_shikshya TO aaramva_app;
GRANT CREATE ON DATABASE aaramva_shikshya TO aaramva_app;  -- new-tenant CREATE SCHEMA

-- Existing schemas were all created by `postgres` — transfer ownership so
-- aaramva_app can do everything postgres currently does within them, with
-- no per-table GRANT list to maintain or keep in sync as new tables/tenants
-- are added later (ownership carries forward automatically).
REASSIGN OWNED BY postgres TO aaramva_app;  -- ⚠ scope this carefully, see caveat below
```

**Caveat on `REASSIGN OWNED BY`, worth Srijan's explicit sign-off before running:** this reassigns
*everything* `postgres` owns **in the connected database** — correct here since `postgres`
currently owns literally everything in `aaramva_shikshya` (there's no other role/app using this
database, confirmed by the isolation note in §1), but it is a blunt, database-wide instrument.
Run it while connected to `aaramva_shikshya` specifically (not a stray `\c postgres` default-db
session), and confirm with `\dn+` (schema ownership) and a spot-check of a few tables' ownership
immediately after, before touching `DATABASE_URL`.

**What this deliberately does NOT do:** revoke or alter the `postgres` role itself in any way. The
superuser stays fully intact, fully valid, fully able to log in — it just stops being what the
*app* connects as. This is the single most important safety property of the plan: the fallback
credential is never touched in the same change that introduces the new one.

**Rollout, in order, each step verified before the next:**

1. **Local dev first**, since it's the lowest-stakes copy of this exact schema shape. Create
   `aaramva_app` there, run the reassignment, verify with direct `psql` queries that ownership
   moved. Do **not** yet touch `apps/api/.env`.
2. **Point a second, throwaway `.env` (or an env-var override) at `aaramva_app` and run the app
   against it locally**, `postgres`'s own `.env` value left untouched and ready as instant
   fallback. Exercise, in order: login (`public.users`... actually `public.tenants`/tenant-schema
   `users` read), a tenant-scoped read (any `TenantPrismaService.query`-backed endpoint), a
   tenant-scoped write, **a real new-school registration** (the one flow that actually exercises
   `CREATE SCHEMA`, the highest-risk untested path), `npm run migrate:tenants` against the new
   role, `npx prisma migrate dev` against the new role, `npm run seed:demo`, and
   `scripts/backup-db.sh` (confirm the dump succeeds and its size is sane, not necessarily a full
   restore test at this stage). Every one of these is a real exercised code path from §2/§3, not a
   guess at what "should" work.
3. **Only after every one of those passes locally**, repeat the identical role/grant script
   against a **restored copy** of a real production backup in a scratch database (`createdb
   aaramva_staging_check`, `pg_restore` into it, `REASSIGN OWNED BY postgres TO aaramva_app` there
   too) — this is the step that catches anything dev's smaller/cleaner dataset might hide (e.g. an
   old tenant schema from before some later migration, owned in some inconsistent way). Point the
   app at that scratch database with the new role and repeat the same exercise list.
4. **VPS cutover, done last, with an immediate rollback path kept live:**
   - Fresh `pg_dump` backup first (`scripts/backup-db.sh`), independent of anything this change
     does.
   - Create `aaramva_app` + run `REASSIGN OWNED BY postgres TO aaramva_app` directly against the
     production database (one `docker compose exec postgres psql` session, a few seconds).
   - Update `.env.production`'s `DATABASE_URL` to the new role, restart only the `api` container
     (`docker compose -f docker-compose.prod.yml restart api`) — `postgres`/`redis`/`minio`
     containers untouched, no downtime beyond the api container's own restart.
   - Immediately check `/health` (db component) + one real read + one real write through the live
     app, not just a container log.
   - **Keep the old `DATABASE_URL` value (with `postgres`) written down and the `postgres` role's
     password unrotated for a cooldown period** (a week is reasonable) — rollback is "revert one
     env var, restart the api container," genuinely a two-minute operation, but only if the old
     credential is still valid when needed.
   - Only after the cooldown period passes with no issues: consider (separately, its own later
     decision, not part of this change) rotating `postgres`'s own password to something not kept
     in any live config, as the final lockdown step.

**Optional, not required for the core hardening:** a second role (`aaramva_migrate`) used only for
`prisma migrate deploy`/`migrate:tenants`/seed commands, invoked by an operator with an explicit
env-var override at the CLI, never by the long-running server process. Given §3's ownership
finding, this buys real isolation only for *public-schema* migrations (the one place DDL doesn't
happen inline at request time) — worth doing later as a refinement, not blocking the main
runtime-role fix.

---

## 5. VPS-specific concerns — summarized, detail already folded into §1/§4

- No existing `init.sql` or post-boot role-creation step exists in `docker-compose.prod.yml` or
  `DEPLOY-1-vps-deployment.md` — the role/grant script in §4 is genuinely new infrastructure, not
  a tweak to something half-built.
- The `postgres` container is internal-only (`aaramva_net`, no host port) — the cutover doesn't
  change network exposure, only which role the `api` container authenticates as.
- `.env.production` isn't in this repo (correctly) — the actual `DATABASE_URL` change happens on
  the VPS directly, via whatever mechanism currently manages that file (checked
  `DEPLOY-1-vps-deployment.md`'s own deployment steps — file is edited/deployed manually per that
  doc, not templated from a repo source).
- `scripts/backup-db.sh` needs no code change — it already reads `DATABASE_URL` from the
  environment, so it picks up the new role automatically, and (per §3) will keep working once
  ownership is reassigned.

---

## Aside, unrelated to this task but surfaced while reading `RUNBOOK.md`

The "Before a real school goes live" section currently lists two gates: this DB-role item, and
**`PAY-UI-REPOINT`**. Per this project's own history (the BILL-ADMIN-UI arc's UI-4 phase, and
PAY-1's own shipped notes), `PAY-UI-REPOINT` was already closed — UI-4 pointed both the web
Payment Counter and the mobile Pay screen at `bill_invoices`/`bill_payments`. The `RUNBOOK.md`
line documenting it as still-open looks stale, not re-verified here (out of scope for this
report) — flagged since "one of the two remaining pre-live gates" in the framing here may
actually mean this is the *only* one left, pending a quick confirmation and a doc cleanup.

---

## Summary

| Question | Answer |
|---|---|
| Current role, dev | `postgres` superuser, confirmed live via `.env` |
| Current role, prod | Same situation — official Postgres image's `POSTGRES_USER` bootstrap is always a superuser, no follow-up de-privilege step exists anywhere in the repo. Matches `RUNBOOK.md`'s own admission. |
| Tenant isolation mechanism | `SET LOCAL search_path`, one shared role/connection pool — Postgres privileges aren't doing tenant isolation, so the new role still needs DML across every tenant schema |
| Migration DDL survey | Clean — no `CREATE EXTENSION`/`CREATE ROLE`/`GRANT`/`ALTER SYSTEM` anywhere; only ordinary `CREATE TRIGGER`/`CREATE TYPE`, neither superuser-only |
| What breaks with naive DML-only role | New-school registration — `CREATE SCHEMA` (and its failure-path `DROP SCHEMA`) run inline in a live, unauthenticated `register-school` request, not just in offline migrations |
| Single role vs. split | Single role recommended — Postgres ownership semantics mean a role that can `CREATE SCHEMA` at runtime unavoidably gets full DDL rights inside schemas it creates, so a clean runtime/migration split doesn't fit this architecture without a bigger change (deferring tenant provisioning off the request path) |
| Rollout safety | `postgres` role never touched/rotated during the switch — only what `DATABASE_URL` points at changes; local dev → restored-backup scratch DB → VPS, each stage exercising the real flows (including an actual school registration); rollback is a one-line env revert + container restart |
