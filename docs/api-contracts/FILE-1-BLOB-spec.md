# FILE-1-BLOB — Stop and clean up old-style (base64) school images

**Status:** Spec, not yet built.
**Save to:** `docs/api-contracts/FILE-1-BLOB-spec.md`

## Why this ticket exists

A school's images (logo, principal signature, school stamp, payment QR) used to be saved
directly in the database as long `data:image/...;base64,...` text. FILE-1 switched the app to
real file storage (MinIO), where the database only holds a short **storage key**. But:

1. **Old values were never cleaned up.** The FILE-1 cutover census counted 5. At least
   `motherland-school` still has a base64 `principalSignatureUrl` (318,839 chars) and a
   base64 `logoUrl`.
2. **New ones can still be saved.** `settings.service.ts` (the `[FILE-1] deprecated base64`
   loop) only **logs a warning** when a `data:` value arrives, then saves it anyway. The DTO
   fields `principalSignatureUrl` / `schoolStampUrl` are plain `@IsString()` with no other
   check. So the bad data can come back at any time.
3. **The damage is silent.** Since BILL-PRINT-1, printing no longer crashes. `optionalAsset`
   catches the failure and prints a blank signature space, and the only sign is a WARN line in
   the server log. The school never finds out its bills go out unsigned.

**Context that shapes the fix:** no real school uses the system. Every tenant is test data,
so we don't need a gentle "deprecation period" for old clients, and old values can simply be
cleared instead of carefully converted.

## Goal

After this ticket:
- No tenant column holds a `data:` value, on local or production.
- The API **refuses** a `data:` value (or anything else that isn't a valid value for that
  column) with a clear 4xx error, instead of saving it.
- A school can re-upload its signature, logo and stamp through Settings, and they appear on a
  printed bill.

## Out of scope (don't touch; each has its own ticket)

- Telling the school when a *valid* upload fails to draw, e.g. a file mislabelled as PNG.
  That's the "silent to the school" gap in BILL-PRINT-1 handoff §5.3 / ASSET-VALID-1.
  Note anything you find, but don't build it here.
- `StorageService`'s public-URL bucket double-append (FIX-STORAGE-URL).
- `prune-orphans` reference set (STOR-1). **Do not run `prune-orphans --delete` anywhere.**

---

## Phase 0 — Look before touching (read-only, then STOP)

Report raw output (SQL results, grep output), not summaries.

1. **Data census, local DB.** For every row in `public.tenants`, check `logoUrl`,
   `principalSignatureUrl`, `schoolStampUrl`, `qrImageUrl`. For each one, report: tenant slug,
   column, which kind of value it holds (NULL / storage key / http(s) URL / `data:` /
   other), and the length. Also check for any other table or column in public or tenant schemas
   that stores images the same way (e.g. staff photos, student photos, `student_documents`).
   Grep the migrations and schema for `Url` / `url` columns and check each.
2. **Every write path.** List every endpoint and service that can write those four columns:
   settings, super-admin `tenant-admin.service.ts`, onboarding, seed scripts. For each one, say
   whether it accepts a `data:` value today.
3. **Every read path.** List every reader of those columns (bill PDFs, receipts, A5 receipt,
   report cards, certificates, `file-access.service.ts`, the login/school-code screens via
   `tenant.controller.ts` / `auth.service.ts`, mobile, web). For each one, say what happens
   today when it gets a `data:` value: crash, blank, or it works.
4. **Web client.** Does `apps/web/app/(school)/settings/page.tsx` (or the super-admin
   screens) still send `*Url` fields with base64 content, or only `*FileKey` from the presign
   flow? The settings page has a text input bound to `principalSignatureUrl`. Say what it's
   for and whether it should stay.
5. **Proposal.** Using what you found, propose:
   - the exact validation rule for each column (e.g. signature/stamp/QR: must be a valid
     storage key for this tenant; logo: must be this deployment's public storage URL);
   - the error code(s) to add to `ERROR_CATALOG` (e.g. `ASSET_LEGACY_BASE64_REJECTED`), with
     HTTP status 422, following the existing naming convention;
   - how to clear existing bad values: a small idempotent script under `scripts/` with a
     `--dry-run` default that prints what it would change, and an `--apply` flag.

**STOP here and wait for Srijan's go-ahead.**

---

## Phase 1 — Build (after go-ahead)

1. **Refuse bad values** on every write path from Phase 0 step 2, using the approved rules and
   error code. The old "warn and save anyway" loop goes away.
2. **Web:** if Phase 0 found the web still sends base64 anywhere, switch it to the presign
   flow, or remove the raw text input if it has no real use. The error message the user sees
   must be the server's message (ERR-WEB-MESSAGE-DEAD already makes the server's message win).
3. **Cleanup script** as approved: dry-run by default, `--apply` sets the bad columns to NULL,
   and it prints one line per change (tenant, column, old length). Running it twice changes
   nothing the second time.
4. **Tests:**
   - each write path rejects a `data:` value with the new code and 422;
   - each write path still accepts a valid storage key;
   - the error code exists in `ERROR_CATALOG` (the completeness test should cover this
     automatically);
   - the script's dry-run changes nothing.

## Live proof (required — mocked tests alone don't count)

Run against the local stack, with a fresh build (check process uptime against build time):

1. Run the script with `--dry-run` and paste the output. Run it with `--apply` and paste the
   output. Then run the census SQL again and paste it, showing **zero** `data:` values.
2. `PATCH` settings with a `data:image/png;base64,...` signature → paste the raw HTTP response
   (422 plus the new code). Then paste the `SELECT` showing the column did **not** change.
3. Upload a real signature through the normal presign flow → paste the `SELECT` showing a
   storage key was saved.
4. Print one motherland-school invoice PDF and one receipt. Show that the server log has **no**
   `asset unavailable` WARN for the signature, and attach or describe the PDF showing the
   signature is drawn.
5. Full test suite count and `tsc --noEmit` output, raw.

## Production (manual, Srijan, after merge + deploy)

Following `docs/ops/DEPLOY-main-to-production.md`, then on the server:
run the script with `--dry-run` → check the output → run it with `--apply` → re-upload any
images you want to keep through Settings.

## Done when

- Census shows zero `data:` values locally, and on production after the manual step.
- Bad values are refused with a 422 and a catalogued code; good ones still save.
- motherland-school prints a bill with its signature.
- `CLAUDE.md` built-so-far checklist and `BILL-BUGS.md` updated. The stale "Status: Spec, not
  yet built" line in `STUDENT-DOCS-1-spec.md` also gets corrected, since that feature is built.

---

## Phase 0 rulings (Srijan, 2026-09-29)

1. **Photos are in scope.** `staff_profiles.photo_url` and `students.photo_url` get the same
   validation on their write paths (`staff.service.ts`, `student.service.ts`) and the same
   cleanup. Rule: value must parse as a storage key for THIS tenant with the correct photo kind
   (per `FILE_KIND_POLICIES`), or be null/`''`.
2. **Two error codes**, both 422: `ASSET_LEGACY_BASE64_REJECTED` and `ASSET_REF_INVALID`
   (`details: { field }`).
3. **Cached print PDFs: do NOT delete any `bill-pdf` / `bill-receipt` object.** Live proof uses a
   motherland invoice that has never been printed (check the cache first, say which). STOR-1
   territory stays untouched.
4. **`''` means cleared.** Accept it and store NULL.
5. **`data:` is ALWAYS rejected, even when it equals the stored value.** The "equal to the
   currently stored value" exemption applies ONLY to non-`data:` values (e.g. demo's `bill-qr`
   key, which is not in `FILE_KIND_POLICIES`). A stored `data:` value resent unchanged gets the
   422 — this is what forces the cleanup script to run first.
6. **Web:** remove the base64 fallbacks in super-admin `schools/[id]/page.tsx` and onboarding
   `branding-step.tsx`, and stop a leftover `data:` preview from being sent in a `*Url` field.
   When presign returns 503, show the server's message instead.
7. **Cleanup script** (`clean-legacy-blobs`): dry-run by default, `--apply` to write, never
   deletes storage objects, one line per change, second run changes nothing. Scope: the four
   `public.tenants` columns plus the two photo columns, across the tenant schemas listed in
   `public.tenants` only (do NOT touch `tenant_bill_scratch`; report it as skipped). On
   `--apply`, first write every old value to a JSON file under a git-ignored scratch path
   (confirm ignored, never committed) and print the path.
8. **Do not widen the accepted kinds for demo's `bill-qr` key.** Record finding A and the stray
   `tenant_bill_scratch` schema in `BILL-BUGS.md`.
