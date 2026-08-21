# STOR-1 — accumulating notes

**Not a spec.** A place to record concrete findings until STOR-1 is written, so they are not
re-derived from scratch. STOR-1 itself is queued behind BILL-RCPT-STATUS and ERR-MAP-1.

---

## The pruner's reference set is unsafe, and there is now a real test case for it

BILL-8-UI established that `scripts/prune-orphans.ts`'s reference set
(`scripts/prune-orphans.ts:63-90`) is the FILE-1-era list and misses three storage-backed columns
added since — `tenants.qrImageUrl` (BILL-8), `student_documents.file_url` (STUDENT-DOCS-1),
`assignment_submissions.file_key` (EDU-1). A dry run found **4 of 23 flagged "orphans" were
actively referenced**, including both tenants' bill QR codes and a live student document.
`--delete` was not run and must not be run on any environment until the reference set is current.

That finding gave the false-positive half of the problem. Here is the **true-positive** half — two
objects that genuinely are orphaned, so a fixed pruner can be tested against a case where it
*should* delete rather than only cases where it must not.

### The two orphaned logos under `tenant_demo/school-logo/`

Found 2026-08-21 while establishing provenance for demo's branding fixtures.

| Key | Size | LastModified |
|---|---|---|
| `tenant_demo/school-logo/7edb9739-a209-417f-9a85-1e488196d592.jpg` | 320,991 B | 2026-07-24T04:18:52.253Z |
| `tenant_demo/school-logo/d3aeb3db-0836-403a-bceb-0bf8de57aa5a.jpg` | 85,716 B | 2026-07-24T04:18:09.630Z |

**Why they are genuinely orphaned:** `tenants.logoUrl` for `slug='demo'` points at
`…/tenant_demo/school-logo/295ad772-a755-4031-b8da-f42cf96bdfcd.png` — a different object, and the
only one of the three the column can reach. `school-logo` is the one public-read kind, so the column
stores a public URL rather than a bare key; a reference set that matches on *key* must therefore
handle the URL form for this kind, or it will report the live PNG as an orphan too. That is a second
thing STOR-1 has to get right and a second reason these two make a useful fixture: the prefix holds
one referenced object stored as a URL and two unreferenced ones, in the same place.

**Do not delete them as cleanup.** They are worth more as a test case than as 400KB of reclaimed
space, and deleting them by hand removes the only known true positive.

### The cached-document question STOR-1 must rule on deliberately

The pruner also flags the entire `bill-pdf/` and `bill-receipt/` cache as orphaned — nothing in any
table references those keys, by design; they are content-addressed by
`{paymentId|invoiceId}-v2-{format}-{lang}` and looked up by construction, not by stored pointer.

Deleting that cache silently breaks BILL-8-UI addendum A6's byte-identical-reprint guarantee: a
reprint would re-render rather than return the stored artifact, and a document that has already been
handed to a parent would no longer be reproducible. A fix must **rule on this cache explicitly** —
either exclude the prefixes, or teach the reference set to reconstruct the keys — not merely add the
three missing columns and consider the job done.
