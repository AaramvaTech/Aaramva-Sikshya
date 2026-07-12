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

## Khalti online payments (PAY-2)

Same table (`payment_transactions`), same four invariants, same result pages
as eSewa — only the gateway leg differs (server-to-server initiate returning a
hosted `payment_url`; verification via `POST /epayment/lookup/` by `pidx`).

| Var | Sandbox (default when unset) | Production |
|---|---|---|
| `KHALTI_SECRET_KEY` | your sandbox merchant key from `https://test-admin.khalti.com/#/join/merchant` (no shared public test key exists) | live secret from `https://admin.khalti.com/` (NEVER commit) |
| `KHALTI_BASE_URL` | `https://dev.khalti.com/api/v2` | `https://khalti.com/api/v2` |

`KHALTI_SECRET_KEY` unset = gateway disabled: boot notice, initiate returns
503, the mobile chooser hides the Khalti button (`GET
/finance/payment-gateways`).

**Amounts are PAISA on the wire** (`amount` in initiate, `total_amount` in
lookup): integer rupees×100 via `khalti.util.ts` only. A lookup `Completed`
whose `total_amount` differs from the row's amount×100 FAILS the transaction
and never credits (off-by-100 guard).

**Trust model (do not weaken):** identical to eSewa — the `return_url`
redirect is a hint; money is recognized only after the server's own lookup
returns `Completed` with matching paisa, inside the one-transaction
INITIATED→VERIFIED claim (replay-safe; `pidx` lives in `gateway_ref`).

**Stuck payments:** `GET /finance/payments/khalti/status/:uuid` re-runs the
idempotent verification. Lookup `Pending`/`Initiated` keeps the row INITIATED;
`Expired` marks it EXPIRED (a late `Completed` still credits exactly once);
`User canceled`/`Refunded` are terminal FAILED. Sandbox payer credentials:
Khalti IDs 9800000000–9800000005, MPIN 1111, OTP 987654.

**Reconciliation:** the PAY-1 queries above cover Khalti by swapping
`p.method = 'ESEWA'` for `p.method = 'KHALTI'` (the VERIFIED-without-payment
query is already gateway-agnostic).

## File storage (FILE-1) — S3-compatible presigned uploads

Photos/logos/documents no longer travel as base64 JSON — clients presign
(`POST /files/presign-upload`), PUT bytes straight to storage, then confirm the
returned key to the feature endpoint (`photoFileKey` / `fileKey` / `logoFileKey`
/ …). Reads go through `GET /files/presigned?key=` (object-scoped, short-lived)
— except `school-logo`, the ONE public-read kind (stored as a public URL because
the mobile school-code screen and the login page render it pre-auth).

Storage is enabled when ALL FOUR of `S3_ENDPOINT`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `S3_BUCKET` are set; otherwise presign endpoints 503 and the
legacy base64 path keeps working (deprecated, logged with `[FILE-1]`).

### Local dev setup — MinIO (single Windows exe, no Docker, no account)

Exact commands used (binaries live in the gitignored `tools/minio/`):

```powershell
# 1. Download (≈110 MB + ≈30 MB)
curl -sSL -o tools/minio/minio.exe https://dl.min.io/server/minio/release/windows-amd64/minio.exe
curl -sSL -o tools/minio/mc.exe    https://dl.min.io/client/mc/release/windows-amd64/mc.exe

# 2. Start the server (API :9000, web console :9001; data dir is local)
$env:MINIO_ROOT_USER = 'minioadmin'; $env:MINIO_ROOT_PASSWORD = 'minioadmin'
tools/minio/minio.exe server tools/minio/data --console-address ":9001"

# 3. One-time: bucket + dedicated access keys
tools/minio/mc.exe alias set local http://127.0.0.1:9000 minioadmin minioadmin
tools/minio/mc.exe mb local/aaramva-dev
tools/minio/mc.exe admin user svcacct add local minioadmin `
  --access-key aaramva-dev-access --secret-key <GENERATE-40-HEX>

# 4. One-time: anonymous read for school logos ONLY (wildcard prefix policy)
#    policy JSON: Action s3:GetObject on arn:aws:s3:::aaramva-dev/tenant_*/school-logo/*
tools/minio/mc.exe anonymous set-json logo-public-policy.json local/aaramva-dev
```

Then in `apps/api/.env`:

```
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=aaramva-dev-access
S3_SECRET_KEY=<the generated secret>
S3_BUCKET=aaramva-dev
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_URL=http://127.0.0.1:9000/aaramva-dev   # optional; this IS the default
```

### Deployment swap table (env-only — no code changes)

| Provider | S3_ENDPOINT | S3_FORCE_PATH_STYLE | Notes |
|---|---|---|---|
| MinIO (dev) | `http://127.0.0.1:9000` | `true` | root console at :9001 |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` | `true` | logo public-read via R2 "public bucket"/custom domain → set `S3_PUBLIC_URL` to that domain; R2 does NOT support the wildcard bucket policy |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | `true` | application key = S3 credentials |
| AWS S3 | `https://s3.<region>.amazonaws.com` | `false` | apply the same wildcard `tenant_*/school-logo/*` GetObject policy |

Because `tenants.logoUrl` stores the PUBLIC URL, a provider swap must rewrite
stored logo URLs once (signature/stamp/photos/documents store keys — no-op):

```sql
UPDATE public.tenants
SET "logoUrl" = replace("logoUrl", '<old S3_PUBLIC_URL>', '<new S3_PUBLIC_URL>')
WHERE "logoUrl" LIKE '<old S3_PUBLIC_URL>/%';
```

### Orphaned objects (uploaded but never confirmed)

Preferred long-term approach: a bucket **lifecycle rule** that expires
unconfirmed uploads is not expressible directly (confirmation lives in our DB),
so the pragmatic rule is: run the manual pruner during maintenance windows.

```bash
cd apps/api
npm run prune-orphans              # DRY-RUN (default): lists orphans, deletes nothing
npm run prune-orphans -- --delete  # actually delete
npm run prune-orphans -- --grace-hours 48   # keep unreferenced objects newer than 48h
```

Objects newer than the grace window (default 24 h) are never touched — they may
be uploads whose confirm request hasn't landed yet. No cron by design (FILE-1);
revisit if orphan volume ever matters.

### ⚠️ BACKUPS: object storage is OUTSIDE pg_dump

`scripts/backup-db.sh` (pg_dump) does NOT back up uploaded files. A database
restore brings back the KEYS but not the BYTES. Back up the bucket itself:

```bash
tools/minio/mc.exe mirror local/aaramva-dev <backup-target>   # dev
# prod: provider-native versioning/replication (R2/B2/S3 all offer it) — enable it
```

Restore drill = restore DB dump AND re-point/restore the bucket; verify one
student photo end-to-end before declaring recovery complete.

### 5 MB JSON body limit (main.ts)

The `json({ limit: '5mb' })` in `apps/api/src/main.ts` exists ONLY for the
legacy base64 upload path. Once the deprecation logs (`[FILE-1] deprecated
base64 …`) go quiet in production, shrink it to ~1 MB. Migration of the ~5
existing base64 blobs in dev (motherland ×4, jorden-donovan logo) is a
follow-up — count them with:
`SELECT count(*) FROM <schema>.students WHERE photo_url LIKE 'data:%'` (etc.).
