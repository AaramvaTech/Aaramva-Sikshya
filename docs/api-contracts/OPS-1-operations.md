# OPS-1 — Production Operations Hardening

**Save location:** `docs/api-contracts/OPS-1-operations.md`
**Scope:** apps/api (+ one docs runbook). Audit items P1-10: /health, error tracking, request logging, backups, the silently-dead fine-recalculation cron.
**Baseline:** 298 tests, all-green CI on main.

---

## 🔒 HARD CLOSE-GATE (agreed with Srijan; the session CANNOT close without these proofs)

- **G1 — super-admin password:** a live login attempt as `admin@aaramvashikshya.com` with password `Admin@12345` must return **401**. If it returns 200, STOP and tell Srijan to change the password (browser: super-admin portal login → profile → change password), then re-prove. Do NOT change it yourself; do NOT touch the hash in the DB.
- **G2 — DB password rotation:** a `psql` connection attempt using the old leaked password must **fail** with auth error (paste it), and the app boots + serves with the current `.env`. (Rotation is believed done — this is the verification.)

## Step 0 — Read and report

1. The fine-recalculation cron: where it's defined, why it depends on Redis/BullMQ (repeatable job?), what it actually does, and what happens today when Redis is down (the audit says: silently nothing). Report whether the job's logic actually needs a queue, or is a simple scheduled task.
2. Existing logging: what Nest logger config exists; whether any request-level logging exists at all.
3. Existing error handling: global exception filters, what errors currently go where.
4. `main.ts` bootstrap + shutdown hooks state.
5. Whether `@nestjs/schedule` is installed.

## T1 — /health

- `GET /health` — public, `@SkipThrottle`, no tenant context. Returns liveness plus component checks: `db` (SELECT 1), `redis` (ping, reported as `degraded` not `down` for overall status if unavailable — the app legitimately runs without Redis in dev), and `queues` status.
- Overall status: `ok` | `degraded` | `error`; HTTP 200 for ok/degraded, 503 for error (db down).

## T2 — Sentry

- `@sentry/nestjs` wired via the global exception path. `SENTRY_DSN` optional in the Joi schema (absent = disabled, log a one-line notice at boot). Scrub: no request bodies, no auth headers. Tag events with tenant slug + route (not user PII beyond user id).

## T3 — Request logging

- Structured request logging (nestjs-pino or interceptor-based — Step 0 decides based on what fits the codebase): request id, method, path, status, duration ms, tenant slug, user id (if authed). Exclusions: /health, and never log bodies or Authorization headers. Pretty in dev, JSON in production (`NODE_ENV`).

## T4 — Fine-recalculation cron resurrection

- Per Step 0 item 1: if the logic doesn't need queue semantics, move it to `@nestjs/schedule` `@Cron` (Kathmandu-timezone-aware — school day boundaries are Nepal-local) so it runs without Redis. If it genuinely needs BullMQ, then: loud ERROR at boot when Redis is absent + `queues: down` in /health — silent death is the one forbidden state.
- Either way: a manual trigger path (guarded admin endpoint or CLI) for on-demand recalculation, and a log line every run (start, affected-row count, duration).

## T5 — Backups: script + runbook

- `scripts/backup-db.(sh|ts)`: pg_dump of the full database (all tenant schemas + public), timestamped, to a configurable target dir; retention note (keep N most recent).
- `docs/ops/RUNBOOK.md`: how to run a backup, how to restore (full + single-tenant-schema restore using the dump), the forward-only-migrations rationale (restore is the rollback), where backups should live in production (off-host), and the cron/scheduler wiring to set up at deployment (documented, not wired — there's no prod host yet).

## Verification — raw output

1. `curl /health` with Redis down → 200 `degraded` with component detail; with db connection broken (temporarily wrong password in a scratch env var run, not .env edit) → 503. Paste both.
2. Sentry: with a scratch DSN or DSN absent — prove the boot notice; force one unhandled error and show it captured (or logged via the fallback path if no DSN).
3. One real request's structured log line (redactions visible: no body, no auth header).
4. Cron: boot log showing registration; manual trigger run against a tenant with overdue fines (or a crafted test invoice — clean up with read-back); paste the run log line.
5. Backup: run the script, paste file listing + size; **restore proof**: restore into a scratch database (`aaramva_restore_test`), count rows in 2 tables of one tenant schema matching the source, then DROP the scratch db with read-back.
6. Full suite (≥298) + push → all-green on the runner.
7. **G1 + G2 gate proofs** (above). Session close requires them.

Commits: logical split (health/sentry/logging, cron, backup+runbook, docs). Push and paste the CI run.

## Out of scope
- FIX-2 (separate small spec).
- Deployment itself / prod hosting choices; Swagger; e2e tests (audit P1-11) — later.
- The 6 leftover verification tenants + the agent worktree's 9 WIP files (decide before Phase A).
