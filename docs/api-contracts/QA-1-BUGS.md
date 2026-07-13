# QA-1 — Bug Log

`| # | Module | Feature | Repro | Expected | Actual | Root cause | Fix | Re-verified |`

## BUG-1 (Phase 0.3) — Assignment file upload "fails with a file-upload error"

| Field | Value |
|---|---|
| **Module** | Assignments / Storage (FILE-1) |
| **Feature** | Create assignment with attached file (teacher, mobile) |
| **Repro** | With MinIO **not running** but `S3_*` env vars set: teacher `POST /files/presign-upload` (kind `assignment-attachment`) → `201`; then `PUT` the presigned URL → **fails** (`ECONNREFUSED 127.0.0.1:9000`); client surfaces an opaque "file-upload error". |
| **Expected** | Attaching a PDF/image to an assignment succeeds; file retrievable. |
| **Actual (pre-fix)** | Upload PUT died before reaching storage because the S3 backend was down. |
| **Root cause** | **Environmental, not a code defect.** `StorageService.onModuleInit` marks storage *enabled* whenever the four `S3_*` env vars are present — a boot-time env-presence check only, with **no reachability probe**. So `presign` returns `201` (pure local signing), and only the browser's *direct* PUT to `:9000` fails — producing a confusing client-side error rather than a clear 5xx from the API. MinIO in dev is a manual `minio.exe` (not a service), so it is down after any reboot. |
| **Fix** | **No code change.** Started MinIO per `docs/ops/RUNBOOK.md` §"Local dev setup — MinIO" (Phase 0.1). Bucket `aaramva-dev` reachable with the app's own `.env` service-account creds. |
| **Re-verified** | Phase 0.3 raw output: PDF+PNG each `presign 201 → PUT 200 → POST /assignments 201`; psql read-back shows both rows with `attachment_keys` (jsonb) + `created_by`=teacher1; API download-back byte-exact (PDF 200 B `%PDF-1.4`, PNG 68 B `PNG`); independent `mc stat` sizes match. |

**Follow-up recommendation (report-only, not built per ground rules 3 & 6):** the `/health` endpoint reports `db` and `redis` but **not** storage. Because storage-enabled is env-presence-only, a down/misconfigured S3 backend is invisible until an upload fails on the client. Recommend adding a storage-reachability component to `/health` (a cheap `HeadBucket`/list) so ops can see it. This is a product/ops decision — flagged for Srijan, not changed in QA-1.

---

## OBSERVATIONS (not failures — tracked for their owning phase)

- **OBS-A (Phase 1):** `guardians` table has **no `deleted_at`** column (hard-delete only), unlike other main entities. May be intentional (like `device_tokens`), or a soft-delete gap. Verify against the guardian migration + service delete path in Phase 1.
- **OBS-B (Phase 1/3, FIX-3):** student DOBs (e.g. 2010-05-20 → BS ~2067) fall in the **FIX-3 documented 2070-era off-by-one** window in `bs-calendar`. Modern-era dates (academic year 2082-83) are correct. Verify a DOB BS display in Phase 1 and cross-check one date vs hamropatro; do NOT fix the table here (FIX-3 is its own pass).
