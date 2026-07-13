# QA-1 — Bug Log

`| # | Module | Feature | Repro | Expected | Actual | Root cause | Fix | Re-verified |`

## BUG-1 (Phase 0.3) — Assignment file upload "fails with a file-upload error" — **FIXED (8611d5b)**

Status: **FIXED in code** per architect decision (env-fix alone was not enough — storage down must be *visible*).

| Field | Value |
|---|---|
| **Module** | Assignments / Storage (FILE-1) |
| **Feature** | Create assignment with attached file (teacher, mobile) |
| **Repro** | With MinIO **not running** but `S3_*` env vars set: teacher `POST /files/presign-upload` (kind `assignment-attachment`) → `201`; then `PUT` the presigned URL → **fails** (`ECONNREFUSED 127.0.0.1:9000`); client surfaces an opaque "file-upload error". |
| **Expected** | Attaching a PDF/image to an assignment succeeds; file retrievable. |
| **Actual (pre-fix)** | Upload PUT died before reaching storage because the S3 backend was down. |
| **Root cause** | **Environmental, not a code defect.** `StorageService.onModuleInit` marks storage *enabled* whenever the four `S3_*` env vars are present — a boot-time env-presence check only, with **no reachability probe**. So `presign` returns `201` (pure local signing), and only the browser's *direct* PUT to `:9000` fails — producing a confusing client-side error rather than a clear 5xx from the API. MinIO in dev is a manual `minio.exe` (not a service), so it is down after any reboot. |
| **Fix (env)** | Started MinIO per `docs/ops/RUNBOOK.md` §"Local dev setup — MinIO" (Phase 0.1). |
| **Fix (code, 8611d5b)** | (1) `HealthService` probes the S3 backend (`HeadBucket`, 1.5s timeout) → new `storage` component (up/down/disabled) in `/health`; storage down → `degraded` (HTTP 200), only db down → 503; no per-presign probe. (2) `StorageService` logs a clear **startup WARN** when the backend is unreachable. 4 files + 3 regression tests. |
| **Re-verified (env)** | Phase 0.3: PDF+PNG each `presign 201 → PUT 200 → POST /assignments 201`; psql read-back (`attachment_keys` jsonb + `created_by`); API download-back byte-exact (200 B / 68 B); `mc stat` sizes match. |
| **Re-verified (code)** | `/health` storage `up` (MinIO on) → stop MinIO → `storage:down` + `status:degraded` + **HTTP 200** (not 503) → restart → `up`. Startup WARN captured live (`File storage backend UNREACHABLE … connect ECONNREFUSED 127.0.0.1:9000`), app still boots. Unit: HealthService storage up/down/disabled (3 cases). Suite 516/516. |

---

## OBS-A (Phase 1) — `guardians` missing the soft-delete column — **FIXED (8611d5b)**

| Field | Value |
|---|---|
| **Finding** | `guardians` had **no `deleted_at`** column, unlike other main entities. No guardian delete path existed at all (grep: zero `DELETE FROM guardians` / soft-delete). |
| **Fix** | Tenant migration **0008_guardians_soft_delete** adds `deleted_at TIMESTAMPTZ` + a partial index, applied canary(demo)→all 7 tenants. All six guardian reads in `guardian.service.ts` now filter `deleted_at IS NULL`. 3 files + 3 regression tests. |
| **Re-verified** | Column present in `tenant_qa_demo` + `tenant_demo`. Live: `parent1` `/students/my-children`=["Aarav"] & `/guardians/me` 200 → soft-delete guardian via psql → `my-children`=[] & `/guardians/me` **403** → restore `deleted_at=NULL` → child back. |
| **Scope note (flagged)** | ~9 cross-module guardian reads (communication listeners, finance report/invoice/sms, attendance leave scoping, assignment submission, storage file-access, examination result) do **not** yet filter `deleted_at`. Harmless today (nothing soft-deletes a guardian), but if a guardian-removal feature is added they must be swept. Left untouched now to respect the Bug-Protocol ≤5-file limit and avoid risky edits to scoping/audience queries. |

---

## OBSERVATIONS (tracked for their owning phase)

- **OBS-B (Phase 1/3, FIX-3):** student DOBs (e.g. 2010-05-20 → BS ~2067) fall in the **FIX-3 documented 2070-era off-by-one** window in `bs-calendar`. Modern-era dates (academic year 2082-83) are correct. Verify a DOB BS display in Phase 1 and cross-check one date vs hamropatro; do NOT fix the table here (FIX-3 is its own pass).
