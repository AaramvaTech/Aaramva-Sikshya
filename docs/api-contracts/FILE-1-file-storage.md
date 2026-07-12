# FILE-1 — Real File Storage: S3-Compatible Presigned Uploads (MinIO dev)

**Save location:** `docs/api-contracts/FILE-1-file-storage.md`
**Scope:** apps/api + web/mobile upload-path touches. Audit P1-13: photos/logos/documents travel as base64 inside a 5MB JSON body; AWS_* env vars unused. Replaced with S3-compatible presigned uploads. Provider-agnostic: MinIO locally (single Windows exe, no account), R2/B2/AWS at deployment via env only.
**Baseline:** current api count post-POL-1 (415+), all-green on main.

---

## Design (fixed)
- **S3 API via `@aws-sdk/client-s3` + presigner.** Config via optional-Joi: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` (true for MinIO/R2). Absent = storage disabled with boot notice; base64 legacy path keeps working until cutover completes (report which call-sites remain).
- **Upload flow:** client asks `POST /files/presign-upload` (auth, tenant-scoped) with {kind, filename, contentType, size} → server validates (allow-list of kinds: student-photo, school-logo, document…; per-kind max size + content-type allow-list; **key is server-generated**: `tenant_<slug>/<kind>/<uuid>.<ext>` — never client-named) → returns presigned PUT URL (short expiry, ~10 min) + the key → client PUTs bytes directly to storage → client confirms to the feature endpoint (e.g. student update) with the key → server verifies the object exists (HEAD) + size/type before persisting the key.
- **Read flow:** stored keys are never public URLs. `GET /files/presigned/:key`-style endpoint (auth + object-level scoping: a parent can fetch their child's photo, not others' — reuse the IDOR discipline) returns a short-lived presigned GET. Logo/branding assets may be long-lived public-read if the bucket policy allows — decide per kind, report.
- **Tenant isolation in keys** (prefix per tenant) + scoping enforced server-side on every presign; the storage itself is one bucket.

## Step 0 — Read and report
1. Every current base64 upload site (api + web + mobile): student photo, school logo (incl. the brand-color extraction flow — it reads the image bytes; plan how it gets them post-cutover: server fetches from storage on confirm), documents, anything else greppable. Full list with file:line.
2. The 5MB body-parser limit's origin and what can shrink after cutover (don't shrink this session; note it).
3. MinIO setup: download the Windows server exe into a gitignored `tools/minio/` (or user dir), start it with a local data dir, create the bucket + access keys via `mc` or the console, document the exact commands in the runbook. Report the running console URL as proof.

## Tasks
T1 — StorageService (presign PUT/GET, HEAD verify, delete) + the presign endpoints with kind-policy table. Unit tests: kind validation, size/type rejection, key generation shape, disabled path.
T2 — Cutover the Step 0 call-sites: server endpoints accept `fileKey` (verify via HEAD) alongside legacy base64 (deprecated, logged); web + mobile upload components switch to presign→PUT→confirm. Logo flow: brand-color extraction moves to server-side fetch of the object.
T3 — Orphan hygiene: uploaded-but-never-confirmed objects. Simple policy this session: a `files_pending` note is overkill — instead document the lifecycle-rule approach (bucket lifecycle: delete unconfirmed prefix after N days) in the runbook and implement a manual `scripts/prune-orphans` (list objects, cross-check referenced keys, dry-run flag). No cron.
T4 — Runbook: MinIO dev setup verbatim; deployment swap table (R2/B2/AWS endpoint+flags); backup note (object storage is OUTSIDE pg_dump — flag loudly).

## Verification — raw
1. MinIO running locally (console proof), bucket created.
2. Full round-trip live: presign → real PUT of a real image → HEAD verify → confirm on a demo student → SELECT shows key not base64 → presigned GET fetches bytes back (magic-bytes match the uploaded file). Cleanup with read-backs (object deleted + DB restored).
3. Scoping probe: parent A presign-GETs child A's photo (200), child B's (403).
4. Policy proofs: oversize rejected, disallowed content-type rejected, client-supplied key ignored (server key wins) — raw responses.
5. Logo flow: upload logo → brand color extracted server-side → settings read-back.
6. Disabled-mode proof (env absent → 503 + boot notice, legacy base64 still works).
7. Orphan script dry-run output. Suite ≥ baseline, push, all-green.

## Out of scope
Bucket lifecycle automation, CDN, image resizing/thumbnails, migrating existing base64-stored blobs (report how many exist; migration is a follow-up), body-limit shrink.
