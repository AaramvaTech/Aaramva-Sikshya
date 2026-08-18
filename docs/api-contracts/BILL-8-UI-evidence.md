# BILL-8-UI — evidence chain

**Source of truth for this ticket's proof.** Spec: `BILL-8-UI-spec.md`.
Origin: `BILLING-AUDIT-2026-08.md` §M5.
Branch `feat/bill-8-ui`, off `main` @ `dd58806`.

**Zero `apps/api` diff** is a property of this ticket, re-verified at every
checkpoint with `git diff main..HEAD -- apps/api/` (empty).

---

## Phase 0 — inventory (checkpoint, approved)

Answers to the spec's six items, all read from source on `main`:

1. **Endpoints** — `GET /finance/bill/invoices/:id/pdf`,
   `GET /finance/bill/payments/:id/receipt` (both ACCOUNTANT_AND_ABOVE +
   PARENT, `?lang=` optional); `POST /finance/bill/runs/:id/print`,
   `POST /finance/bill/print/class` (staff only); status via the shared
   `GET /finance/jobs/:id`.
2. **Response type** — JSON `{ presignedUrl, generated }`, never a streamed
   body. Bulk returns the job DTO, with `downloadUrl` present only once
   `status === 'COMPLETED'`.
3. **Bulk print is a background job**, mirroring `BulkAssignJobService`,
   drained by a 10s poller, sharing `GET /finance/jobs/:id`. Result is a
   single **merged** PDF, not a zip.
4. **Language** is a request parameter (`?lang=EN|NE|BOTH`), staff-only,
   defaulting to `tenants.printLanguage`, gated by `NEPALI_PRINT_REVIEWED`
   (true since 2026-07-30). **Brand colour is tenant-only** — no parameter.
5. **Thermal page size** — `[226.77, computed height]`, i.e. a true 80mm
   page. Invoice is A4.
6. **Separate endpoints**, only `?lang=` shared.

The one scope flag raised — no endpoint accepts a hand-picked invoice-id
list — was ruled on as addendum A1/A2.

---

## Phase 1 — single-document print

### An independent gap found on the way

**Before this ticket the student Billing tab had no invoice visibility at
all.** It rendered every *setup* panel — fee-structure assignment, overrides,
concessions, transport, fee preview — but never showed the invoices those
settings actually produce. `useStudentBillInvoices` existed and was consumed
only by the parent portal and a summary stat on the student page.

That is why `student-invoices-panel.tsx` is new work rather than a button
added to an existing list: there was no list. Recorded here as its own
finding, not as scope creep — a staff user could configure a student's
billing and never see what had been billed to them. The panel reuses the
existing hook verbatim (year-scoped, bounded at 100, PARENT-safe route);
no new endpoint, no new query.

### Live proof — real PDFs

Against the running dev API (`localhost:3001`) + MinIO, tenant `demo`,
`owner@demo.school`. Invoice `BINV-2083-000028`
(`f2484772-3aca-41d7-bd32-079fbe338fa1`), payment `RCPT-2083-000021`
(`8e5842aa-3a4d-4203-bb6b-1a540435203f`).

Both endpoints returned `200` with `generated: true`, and every presigned
URL fetched a genuine PDF:

```
inv/EN   http=200  bytes=23626  magic=%PDF-
inv/NE   http=200  bytes=38153  magic=%PDF-
rcpt/EN  http=200  bytes=18133  magic=%PDF-
rcpt/NE  http=200  bytes=28276  magic=%PDF-
```

**Declared page size, read from each PDF's own MediaBox** (not from source):

```
inv-EN   ->  0 0 595.28 841.89     exact A4
rcpt-EN  ->  0 0 226.77 399        exactly 80mm wide
rcpt-NE  ->  0 0 226.77 399
```

This is what makes the scale-to-fit warning the correct fix rather than a
workaround: the page really is 80mm, so "Actual size / 100%" prints
correctly and only the browser's own default gets in the way.

**TTL** — the signed URL carries `X-Amz-Expires=300`, matching
`READ_URL_TTL_SEC` and addendum A4.

**Immutability (A6)** — a second call for the same (invoice, `EN`) returned
`generated: false` at the identical key
`tenant_demo/bill-pdf/f2484772-…-v1-EN.pdf`.

### Devanagari review artifacts

Copied out of the session scratchpad to a durable location, since the
review is a merge gate:

```
C:\Users\Srijan Pradhan\Documents\aaramva-print-review\2026-08-18-BILL-8-UI\
    inv-EN.pdf  inv-NE.pdf  rcpt-EN.pdf  rcpt-NE.pdf  README.txt
```

### Suite

`589 web tests` (+15), `tsc --noEmit` clean, `npm run build` succeeds.

### Not visually verified

No browser automation exists in this repo. Unverified by eye: the dropdown's
placement in the run-detail table, the language items embedded in the
payments row menu, the new Invoices panel's layout, and the toast copy in
situ. The PDFs are proven real; the buttons that open them are proven only
by type-check, unit tests, and a production build.

---

## Phase 2 — bulk print

### `<BulkJobProgress>` generalised, not forked

`GET /finance/jobs/:id` already served both job families; only the failure key
differed (`studentId` for bulk-assign, `invoiceId` for bill-print). Both are
normalised in `lib/job-progress.ts`, so there is one component and one poller.

Bulk-assign is protected by keeping `noun` defaulted to `'student'` — every
pre-existing call site keeps its exact wording untouched — and by tests that
pin the old strings verbatim (`'1 student skipped'`,
`'All 12 students assigned successfully.'`). FEE-CLASS-GUARD's optional
`reason` survives: `normalizeJobFailures` carries `CLASS_MISMATCH` through,
omits `reason` entirely when absent, and a dedicated test asserts the label
still renders after the generalisation.

### Measured numbers — 15-invoice run, real data

Tenant `motherland-school`, run `fec97878-…` (CLASS scope, Shrawan 2083,
15 posted invoices). Timings split into **server-side render** (job
`started_at → completed_at`) and **queue wait** (`created_at → started_at`,
i.e. the 10s poller's pickup latency):

| lang | invoices | render | queue wait | merged PDF | download |
|---|---|---|---|---|---|
| EN | 15 | **1,090 ms** | 8,729 ms | **736 KB** | 72 ms |
| NE | 15 | **1,371 ms** | 7,126 ms | **750 KB** | 83 ms |

Per invoice: ~73 ms / ~49 KB (EN), ~91 ms / ~50 KB (NE).

Note the merged NE PDF is only ~2% larger than EN, even though a *single* NE
invoice is 62% larger than its EN twin (38,153 B vs 23,626 B) — the Devanagari
font subset is embedded once per document, so it amortises across a merge.

**Extrapolated** (linear; not measured):

| invoices | render (EN) | merged size (EN) |
|---|---|---|
| 40 (full class) | ~2.9 s | ~2.0 MB |
| 200 (whole school) | ~15 s | ~9.8 MB |

### Is the 300s presigned URL tight? — No, but the risk is not where it looks

Generation never consumes the TTL. `BillPrintJobService.findOne` presigns
**fresh on every status poll** (`bill-print-job.service.ts:123-127`), so the
clock starts when the client reads a COMPLETED job, not when the job starts.
Even the 200-invoice extrapolation (~15 s render) is irrelevant to the TTL.

The real exposure is **after** completion: `<BulkJobProgress>` stops polling
at a terminal status, so the `downloadUrl` rendered into the button is frozen
at that moment. A user who leaves the dialog open for more than 5 minutes and
then clicks Download gets an expired link. Reported, not fixed, per the
checkpoint instruction. (A one-line fix exists — re-fetch the job on click
rather than rendering a stored href — and would match Phase 1's addendum A4
discipline, which the bulk path currently does not follow.)

Transfer is not a concern at these sizes: 736 KB took 72 ms from local MinIO;
even 9.8 MB over a 1 Mbps school uplink is ~80 s, inside the 300 s window.

### Pre-existing defect found: legacy base64 tenant assets break ALL printing

The first bulk-print attempt failed **15/15** with
`XMinioInvalidResourceName: Resource name contains bad components such as ".." or "."`.

Root cause is **not** Phase 2 and **not** the UI. `BillDocumentService.buildPdfData`
(`bill-document.service.ts:149-150`) passes `tenant.principal_signature_url`
straight to `storageService.getObjectBuffer()`, which treats it as an S3 key.
`motherland-school` still stores a **legacy `data:image/jpeg;base64,…` URI**
there (318,839 bytes) rather than a storage key — one of the five legacy blobs
FILE-1's own cutover census flagged as "migration is a follow-up".

Confirmed it is not bulk-specific: the **single-document** endpoint fails
identically for the same tenant —

```
GET /finance/bill/invoices/c0694883-…/pdf?lang=EN   ->  HTTP 500
_debug: XMinioInvalidResourceName: Resource name contains bad components…
```

So `motherland-school` cannot print anything at all today, single or bulk, and
has not been able to since FILE-1. It surfaces now only because BILL-8-UI is
the first thing that ever calls these endpoints (BILLING-AUDIT §M5).

Proof of causation: with `principalSignatureUrl` temporarily set to NULL, the
same 15-invoice run completed **15/15/0** in both languages (the table above).
The original value was restored byte-for-byte afterwards (318,839 bytes,
`LIKE 'data:image%'` true again), so motherland is back in its pre-existing
broken state — this ticket neither caused nor fixed it.

Two things this implies, both **out of scope here**:
- the legacy-blob migration FILE-1 deferred is now blocking, not cosmetic;
- a `data:`/URL value reaching `getObjectBuffer` should fail as a 4xx naming
  the tenant asset, not a 500 `INTERNAL_ERROR` (compare BILLING-AUDIT §H4).

### Proof hygiene

All shims restored with read-backs: motherland accountant password restored
(hash matches backup; shimmed password now **401**), `principalSignatureUrl`
restored, and the 4 crafted `bill_print_jobs` rows deleted (`print_jobs_left`
0). The 2 merged PDFs written to dev MinIO remain as orphaned objects,
removable with `npm run prune-orphans`.

### Suite

`604 web tests` (+15 for Phase 2), `tsc --noEmit` clean, `npm run build`
succeeds. `git diff main..HEAD -- apps/api/` empty.

### Not visually verified (Phase 2)

The bulk-print dialog in both modes, the "Print all bills" button's placement
in the run-detail header, "Print by Class" on the runs list, and the download
button inside the progress panel. The underlying job flow is proven live end
to end — job created, polled to COMPLETED, merged PDF fetched with `%PDF-`
magic bytes — but the screens that drive it have not been seen.
