# Operations Runbook (OPS-1)

## Backups

### Take a backup

```bash
scripts/backup-db.sh                 # → backups/aaramva-YYYYMMDD-HHMMSS.dump
scripts/backup-db.sh /mnt/backups   # custom target dir
BACKUP_KEEP=14 scripts/backup-db.sh # prune to the 14 most recent afterwards
```

Reads `DATABASE_URL` from the environment, falling back to `apps/api/.env`.
The dump is pg_dump **custom format** (`-Fc`): one file covering the `public`
schema (tenants/plans/subscriptions/platform_admins) **and every
`tenant_*` schema**, restorable in full or per schema.

### Restore — full database

```bash
createdb -U postgres aaramva_restore   # or reuse an empty db
pg_restore -U postgres -d aaramva_restore --no-owner backups/aaramva-<stamp>.dump
```

Verify counts in a couple of tables, then repoint `DATABASE_URL` (or rename
databases) during a maintenance window.

### Restore — single tenant schema

```bash
# 1. Drop the damaged schema (irreversible — take a fresh backup first):
psql -U postgres -d aaramva_shikshya -c 'DROP SCHEMA tenant_<slug> CASCADE;'
# 2. Restore just that schema from the dump:
pg_restore -U postgres -d aaramva_shikshya --no-owner --schema=tenant_<slug> backups/aaramva-<stamp>.dump
```

The `_tenant_migrations` ledger table is part of the schema and restores with
it, so the migration runner stays consistent automatically.

### Why restore IS the rollback

Tenant migrations are **forward-only** (see `apps/api/migrations/tenant/README.md`):
there are no down migrations. A bad migration is recovered by restoring the
affected schema(s) from the last backup, then fixing forward with a new
migration. **Always run `scripts/backup-db.sh` before `npm run migrate:tenants`
against all tenants.**

### Where backups live in production

Off-host, always: the dump must survive the database host dying. Push to
S3/R2 (`aws s3 cp` / `rclone`) after each run; keep at least 14 daily dumps +
3 monthly. `backups/` on the host is a staging area, not an archive.

### Scheduling (to wire at deployment — no prod host yet)

- Linux host: `crontab -e` →
  `15 0 * * * cd /srv/aaramva && BACKUP_KEEP=14 scripts/backup-db.sh && <push-to-object-storage>`
  (00:15 Nepal time, after the 00:05 fine-recalculation cron).
- Containerized: run the same script from a sidecar/cron container with
  `DATABASE_URL` injected; do not bake credentials into images.

## Health & monitoring

- `GET /health` (root path, no auth, no tenant header):
  `ok` (200) | `degraded` (200 — Redis configured but unreachable; the app
  legitimately runs without Redis) | `error` (503 — database unreachable).
  Point uptime monitoring at this; alert on non-200.
- Request logs: one JSON line per request (`reqId, method, path, status, ms,
  tenant, userId`) — pretty in dev, JSON in production (`NODE_ENV`).
  `X-Request-Id` response header correlates client reports with log lines.
- Errors: unexpected (non-HTTP) exceptions go to Sentry when `SENTRY_DSN` is
  set (scrubbed: no bodies/headers; tagged with tenant + route). Absent DSN =
  console only; the boot log says which mode is active.

## Scheduled jobs

- **Fine recalculation**: `@nestjs/schedule` cron `5 0 * * *` in
  `Asia/Kathmandu` (00:05 Nepal daily), in-process — no Redis required.
  Registration is logged at boot; every run logs start + summary
  (tenants / failed / recalculated / ms).
- Manual trigger (PLATFORM_ADMIN):
  `POST /api/v1/super-admin/jobs/recalculate-fines`.
- Per-invoice recalculation remains: `PATCH /api/v1/finance/invoices/:id/recalculate-fine`.

## Platform-admin password

Self-service since MAIL-1: super-admin portal -> Settings -> Change password
(`POST /super-admin/auth/change-password`, current password required, min 12
chars). The OPS-1 one-off rotation script remains recoverable from git history
(`git show 427149f:apps/api/scripts/set-platform-admin-password.ts`) for
break-glass cases (e.g. current password lost).


## eSewa online payments (PAY-1)

The gateway is **config-switched, not code-switched**. Sandbox (default) vs
production is entirely these env vars:

| Var | Sandbox (default when unset) | Production |
|---|---|---|
| `ESEWA_PRODUCT_CODE` | `EPAYTEST` | merchant code from eSewa onboarding |
| `ESEWA_SECRET_KEY` | `8gBm/:&EnhH.1/q` (public test key) | merchant secret (NEVER commit) |
| `ESEWA_FORM_URL` | `https://rc-epay.esewa.com.np/api/epay/main/v2/form` | `https://epay.esewa.com.np/api/epay/main/v2/form` |
| `ESEWA_STATUS_URL` | `https://rc.esewa.com.np/api/epay/transaction/status/` | `https://esewa.com.np/api/epay/transaction/status/` |
| `API_PUBLIC_URL` | `http://localhost:3001` fallback | public API origin (eSewa redirects the payer's browser here) |
| `WEB_BASE_URL` | `http://localhost:3000` in dev | unset -> `https://<slug>.<APP_DOMAIN>` per tenant |

Both `ESEWA_PRODUCT_CODE` and `ESEWA_SECRET_KEY` unset = gateway disabled:
boot notice, initiate returns 503, nothing else changes.

**Trust model (do not weaken):** the browser redirect from eSewa is a hint.
A payment is recognized only after the server's own status-check call returns
`COMPLETE` with the amount matching to the paisa; the INITIATED->VERIFIED
transition + payment row happen in one DB transaction (replay-safe).

**Stuck payments** (payer closed the browser mid-flow): rows stay `INITIATED`;
the app's "check status" (`GET /finance/payments/esewa/status/:uuid`) re-runs
the same idempotent verification. `NOT_FOUND` past a 15-minute grace window
marks the row `EXPIRED`; a late `COMPLETE` on an EXPIRED row still credits
exactly once.

**Reconciliation** (run per tenant schema; every VERIFIED transaction must
have exactly one live payment row and vice versa for method ESEWA):

```sql
SET search_path TO tenant_<slug>, public;
-- VERIFIED transactions missing their payment (should be zero rows)
SELECT pt.transaction_uuid, pt.amount, pt.verified_at
FROM payment_transactions pt
LEFT JOIN payments p ON p.id = pt.payment_id AND p.deleted_at IS NULL
WHERE pt.status = 'VERIFIED' AND p.id IS NULL;
-- eSewa payments not backed by a VERIFIED transaction (should be zero rows)
SELECT p.payment_number, p.amount, p.created_at
FROM payments p
LEFT JOIN payment_transactions pt ON pt.payment_id = p.id AND pt.status = 'VERIFIED'
WHERE p.method = 'ESEWA' AND p.deleted_at IS NULL AND pt.id IS NULL;
```

Disputes: `payment_transactions.raw_payload` keeps the redirect payload and
every status-check response; `gateway_ref` is eSewa's reference id shown to
the payer. Rows in this table are an audit trail — never delete or soft-delete
them from application code.
