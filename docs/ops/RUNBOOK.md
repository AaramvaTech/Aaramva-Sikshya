# Operations Runbook (OPS-1)

## ⚠️ Before a real school goes live

Open, must-do gates before any real school's data or money goes through a
feature listed here. Not a general backlog — only items that would silently
break or expose something in production if skipped. Close an item by fixing
it and deleting its line here.

- **PAY-UI-REPOINT** — `apps/mobile`'s parent Fees screen and `apps/web` still
  target the pre-BILL-5 `invoices`/`payments` tables, not `bill_invoices`/
  `bill_payments`. Do not cut a real school's billing over to the new tables
  until this lands, or parents' "Pay with eSewa/Khalti" buttons silently
  404. Full detail: `BILL-BUGS.md` → PAY-UI-REPOINT.
- ~~**Non-superuser Postgres role for prod**~~ — closed 2026-08-14. Both dev
  and production now run the app as `aaramva_app`, a plain non-superuser role
  (confirmed via `\du` on both — no elevated attributes). Production's old
  role was never literally named `postgres` (bootstrapped as `aaramva_prod`,
  itself a full superuser) — discovered live, not assumed, during the cutover.
  Live-proved with a real `register-school` call (the one path that actually
  exercises `CREATE SCHEMA` at runtime), cleaned up and read-back confirmed.
  `aaramva_prod`'s own password is deliberately left untouched and unrotated
  for now — kept as the rollback fallback through the post-cutover monitoring
  window; rotating it is a separate, later decision. Full detail:
  `docs/ops/DB-ROLE-HARDENING-discovery.md`, `scripts/db-role-hardening.sql`.

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

# 2. Start the server (API :9000, web console :9001)
#    DATA LIVES ON D: — moved 2026-07-16. C: hit 100% full (312 MB free of 238 GB)
#    and MinIO answers 507 Insufficient Storage on every PUT when the disk is
#    that full. Uploads then fail with a misleading "Failed to update profile".
#    D: has ~570 GB free, and object storage only grows (logos, photos, PDFs).
#    The app never needs to know: it talks to 127.0.0.1:9000 either way — only
#    the server's storage path changed, so no .env change accompanies this.
$env:MINIO_ROOT_USER = 'minioadmin'; $env:MINIO_ROOT_PASSWORD = 'minioadmin'
tools/minio/minio.exe server "D:/aaramva/minio-data" --console-address ":9001"

# 3. One-time: bucket + dedicated access keys
tools/minio/mc.exe alias set local http://127.0.0.1:9000 minioadmin minioadmin
tools/minio/mc.exe mb local/aaramva-dev
tools/minio/mc.exe admin user svcacct add local minioadmin `
  --access-key aaramva-dev-access --secret-key <GENERATE-40-HEX>

# 4. One-time: anonymous read for school logos ONLY (wildcard prefix policy)
#    policy JSON: Action s3:GetObject on arn:aws:s3:::aaramva-dev/tenant_*/school-logo/*
tools/minio/mc.exe anonymous set-json logo-public-policy.json local/aaramva-dev
```

**If uploads fail, check MinIO before you read any application code.** Two failures
look identical from the UI (`Failed to update profile`) and neither is a code bug:

| symptom in devtools | cause | fix |
|---|---|---|
| PUT fails with no HTTP status; `curl 127.0.0.1:9000` refuses | MinIO not running | start it (step 2). It is **not** in `docker-compose.yml` — `docker compose up` will not start it |
| PUT returns **507 Insufficient Storage** | host disk full | free space, or move the data dir (that is why it is on D:) |

The presign call returns **200 in both cases** — signing is offline maths with no
network — so the API happily hands the browser an upload URL pointing at a dead or
full server. `lib/upload.ts` only falls back to base64 on a presign **503**, which
never fires here, so the PUT dies with no fallback and the toast blames the
profile. Storage is treated as "enabled" purely because the four `S3_*` env vars
exist; nothing checks reachability. Known gap, not yet fixed.

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

## Mobile builds & release — Android (EAS-1)

EAS project: **`@aaramva-nepal-technology/aaramva-shikshya`**
(projectId `54147e05-403e-4185-9d0c-67dd5d1f6a74`, in `app.json` → `extra.eas`).
Android package (permanent): **`com.aaramvashikshya.mobile`**.
iOS is not set up (needs a paid Apple account — future session).

### Cut an installable preview APK (internal distribution)

```powershell
cd apps/mobile
eas build --platform android --profile preview      # add --no-wait to queue and return
```

Requires the EAS CLI (`npm i -g eas-cli`) and `eas login` under an account with
access to the `aaramva-nepal-technology` org. The build runs in Expo's cloud;
when it finishes the build page hosts the APK (download link + QR for direct
device install — no Play Store). The signing keystore is **EAS-managed**
(generated in the cloud on first build, reused after; never downloaded).

`eas.json` profiles:

| Profile | Distribution | Artifact | Use |
|---|---|---|---|
| `development` | internal | dev-client APK | needs `npx expo install expo-dev-client` first (unused today) |
| `preview` | internal | **installable APK** | on-device testing / QA — this is the one to cut |
| `production` | store | AAB | Play Store submission (configured, not yet used) |

### Monorepo: bs-calendar is built during the EAS build

`packages/bs-calendar/dist` is **not committed** (repo convention — CI and the
API Dockerfile build it too). The cloud build compiles it via the
`eas-build-pre-install` hook in `apps/mobile/package.json`
(`cd ../../packages/bs-calendar && npm ci && npm run build`), which runs before
`npm install`, so the `file:` dependency's `main` (`dist/index.js`) resolves when
Metro bundles. If a build fails with **"Unable to resolve module bs-calendar"**,
this hook (or its relative path) is the thing to check.

### Version / build numbers

`cli.appVersionSource` = **`local`** → `app.json` is the source of truth.
- `expo.version` ("1.0.0") = user-facing `versionName`.
- `expo.android.versionCode` (integer) = Play Store's monotonic build number.
  Bump it by 1 for every build you upload to Play. The `production` profile has
  `"autoIncrement": true`, so store builds bump it automatically; `preview`
  builds don't need a unique code.

### ⚠️ Dev-API reachability from a physical phone (LAN, not localhost)

A standalone APK has no Metro dev host, so it **cannot** auto-derive the API
URL and **cannot** reach `localhost` (that's the phone itself). The `preview`
profile therefore bakes `EXPO_PUBLIC_API_URL` at the **dev laptop's LAN IP** in
`eas.json`. To test against a laptop-hosted API:

1. **Same Wi-Fi** — phone and laptop on the same network.
2. **Find the laptop's current LAN IP** (DHCP — it changes):
   ```powershell
   Get-NetIPAddress -AddressFamily IPv4 |
     Where-Object { $_.InterfaceAlias -like 'Wi-Fi*' } |
     Select-Object IPAddress
   ```
   If it differs from the value in `eas.json` (`build.preview.env.EXPO_PUBLIC_API_URL`),
   update it and **rebuild** — the URL is compiled into the APK.
3. **API listens on all interfaces already** — `apps/api/src/main.ts` calls
   `app.listen(PORT ?? 3000)` with no host arg, so Express binds `::`/`0.0.0.0`.
   `PORT=3001`. No code change needed. (`ALLOWED_ORIGINS`/CORS is irrelevant to
   the native app — React Native doesn't enforce CORS.)
4. **Windows Firewall** — allow inbound TCP 3001 once (elevated PowerShell):
   ```powershell
   New-NetFirewallRule -DisplayName "Aaramva API 3001 (dev LAN)" `
     -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001 -Profile Private
   ```
   Or click **Allow access** on the Defender popup the first time Node serves an
   external request.

For staging/production the app should point at a real hostname instead
(`https://api.aaramvashikshya.com/api/v1`, the `production` profile placeholder —
confirm when the domain is live), removing the LAN dance entirely.

### Push (FCM V1) credentials

Two separate Firebase artifacts, handled differently:

- **`google-services.json`** — `apps/mobile/google-services.json`, **committed**
  (public client identifiers only; EAS cloud builds exclude gitignored files, so
  it must be in git). Referenced by `app.json` → `android.googleServicesFile`.
  Regenerate: Firebase console → project `aaramva-shikshya` → Project settings →
  your Android app → download `google-services.json`, replace the file, commit.
- **Service-account private key** — the real secret. **Never committed**
  (`.gitignore` blocks `*-firebase-adminsdk-*.json` / `*service-account*.json`).
  It's uploaded to EAS and used by Expo's push service to talk to FCM V1.
  Rotate:
  1. Firebase console → Project settings → **Service accounts** → **Generate new
     private key** (downloads a JSON).
  2. `cd apps/mobile && eas credentials` → Android → **Google Service Account**
     → **Manage … Push Notifications (FCM V1)** → **Set up / upload** the JSON.
  3. **Delete the local JSON** immediately and confirm it isn't tracked
     (`git status`). Revoke the old key in the Firebase console.

`EXPO_PUBLIC_PROJECT_ID` (the EAS projectId) must be set for push registration
to run at all (`lib/notifications.ts` no-ops without it) — the cloud build gets
it from `eas.json` `env`; local dev-client builds read it from
`apps/mobile/.env`. Expo Go on Android cannot receive remote push (SDK 53+); a
dev/preview/production build is required.
