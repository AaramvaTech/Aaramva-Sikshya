# BILL-PRINT-1 — merge handoff

Branch `feat/bill-print-1`, **stacked on `feat/bill-8-ui`** (not on `main`). BILL-8-UI must land
first — three web files this branch edits (`print-document.ts`, `bill-print.api.ts`,
`print-document-button.tsx`) do not exist on `main`.

**1278 API tests, 608 web tests, `nest build` clean, web `tsc --noEmit` clean.**

---

## 0. Merge order, and what merging does NOT do

### Deploy does not trigger off `main`

**Merging ships nothing.** Verified against the workflows, not taken from documentation:

- `.github/workflows/` contains exactly one file, `ci.yml`. Its jobs are `api`, `web`, `mobile`,
  `bs-calendar`, `all-green` — **there is no deploy job**.
- Triggers are `push: branches: ['**']` and `pull_request`. No tag trigger, no `environment:`, no
  `secrets.*`, no registry push — zero matches anywhere under `.github/`.
- `DEPLOY-1-vps-deployment.md` describes a **manual, SSH-based, phased** process: clone on the VPS,
  `docker compose build`, run migrations by hand.
- Production is deliberately weeks behind `main` (deferred by ruling, 2026-08-14).

**CLAUDE.md line 28 claims `CI/CD | GitHub Actions | On push to main → staging, on tag → prod`.
That is not true and never was** — it describes intent that was never wired. It is the kind of line
that makes someone believe a merge ships something. **Worth correcting in its own commit**; not
done here because it is outside this ticket.

**What this means for sequencing:** the cache cutover (§1) and BILL-RCPT-STATUS's unfixed
bounced-receipt printing do not reach users on merge. They reach users at the **next manual
deploy**, which is a separate deliberate act and the right moment to have the support note (§4) in
hand and BILL-RCPT-STATUS decided.

### Merge order — each rebased onto the previous, full gate re-run at each step

```
chore/ci-typecheck-gate   ->   feat/bill-8-ui   ->   feat/bill-print-1
```

1. **`chore/ci-typecheck-gate`** (branched off `main`). Adds `tsconfig.spec.json` + the CI
   `Typecheck (specs)` step, and fixes the 18 stale spec fixtures that step immediately found.
   Goes first so everything after it is measured by the fuller gate.
2. **`feat/bill-8-ui`** rebased onto that. Must precede BILL-PRINT-1 regardless — three web files
   BILL-PRINT-1 edits (`print-document.ts`, `bill-print.api.ts`, `print-document-button.tsx`) do
   not exist on `main`.
3. **`feat/bill-print-1`** rebased onto that.

**Re-run the full gate at each step, not only at the end** — `npm test`, `npx tsc -p
tsconfig.build.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, and the web suite. The
spec typecheck has never run against BILL-8-UI's or BILL-PRINT-1's spec files in CI; they were
clean when run manually against each branch, but the branches have never been merged together.

### BILL-8-UI's gates: two RETIRED, one STANDS

Written down because **a retired gate looks identical to a skipped one**, and a future session
reading the BILL-8-UI PR will otherwise re-open them.

| BILL-8-UI gate | Status | Why |
|---|---|---|
| Devanagari / Nepali review | **RETIRED — moot** | It gated the Nepali output of the renderers **this ticket replaced**. Those renderers no longer exist, so passing it would prove nothing about what ships. Nepali is separately gated OFF at runtime (`BILL_PRINT_1_NEPALI_REVIEWED = false`), and its review is tracked here as open item 5.1 against the CURRENT strings. |
| Physical thermal print at 100% scale | **RETIRED — superseded** | Same reason: it gated the pre-BILL-PRINT-1 thermal renderer, which has since had nine changes including a measured page height and a signature-overprint fix. **One physical print covers both tickets** — the kit in `thermal-print-kit/` prints the CURRENT renderer, so satisfying it satisfies BILL-8-UI's gate too. Do not print twice. |
| Click-through of the print surfaces | **STANDS — satisfied** | Still meaningful: the surfaces are BILL-8-UI's and BILL-PRINT-1 only changed what they produce. Satisfied by the surface → format matrix in §6, which was read from code and confirms all seven entry points send the ruled format. |

**Neither retirement is a shortcut.** Both gates verified artefacts that no longer exist. Re-running
them would be verifying deleted code.

---

## 1. PR description

### What changed

The billing module's invoice and receipt print output is rebuilt to the approved stationery design:
**one A4 sheet holding two A5 documents with a cut line between them**, replacing BILL-8's
single-A4-per-invoice layout. Rendering only — **no migrations, no billing-calculation changes**.
Columns were added to existing `SELECT`s, which is not a schema change.

**Still pdfkit, not headless Chromium.** The ticket assumed an HTML/CSS print path this codebase
does not have; BILL-8 Checkpoint A had already ruled out a Chromium dependency on the KVM 1 box,
and that ruling stands. It also means the "no px/rem/viewport units" requirement holds *by
construction* — a drawing API with no CSS cannot leak a design token into print geometry.

Five of the seven named defects are fixed (the other two — a watermark and a web-component print
path — never existed here):

- the solid accent-filled "total" pill is gone; hierarchy is weight, size and a 0.75pt rule;
- content no longer floats at the top of a mostly-empty page;
- money columns are fixed-width, right-aligned, tabular-figured;
- copy designation, cut line, fiscal year and computer-generated note are all present;
- image slots render designed placeholders, not bare rectangles.

**New:** `finance/print/{mm,a5-sheet,invoice-half,receipt-half}.ts` — units/palette/type scale, the
sheet skeleton and drawing primitives, and one renderer per document. One partial rendered twice per
sheet; two flags (`stackMode`, `locale`).

**Fee table** holds 6 rows at spec density, padded to that minimum with **empty ruled rows** the way
a pay-in slip does, so the table's rhythm is identical at every line count (verified: 1/2/3/6 lines
all draw exactly 11 rules). Beyond capacity a continuation row carries the omitted count *and* the
summed residual, so printed lines always foot to the subtotal.

**Receipt gained** the balance-after-payment line (computed **as of the payment's own ledger entry**,
never live — a reprint must not contradict the slip the parent holds), a split of unallocated money
into *Applied to balance* / *Advance credit*, method display labels, and gateway-payment suppression
of the received-by slot.

**Overflow fails loudly.** In CSS a flex spacer self-corrected; here it is arithmetic on a draw
cursor, so every renderer asserts the body ends above a fixed footer baseline and throws
`PrintOverflowError` rather than printing on top of itself. A table that cannot hold one real line
beside a continuation row throws `PrintCapacityError` rather than emitting a bill that itemises
nothing.

### Deviations accepted (Srijan, during review)

| # | Spec asks | Shipped | Why |
|---|---|---|---|
| D1 | Weights 400/500/600/700 | **Two-face ramp**: 400/500 → Regular, 600/700 → Bold | Only two Noto faces are embedded. Every weight *contrast* survives (money 500 vs Total 600 still reads regular vs bold); the two-step ramp flattens to one. Ruled: money at Regular against totals at Bold is more contrast than 500-vs-600, and photocopies better. Do not add faces. |
| D2 | "Overlay them and see the same document" (§8) | **≤1.13mm vertical drift** between EN and NE | SPEC contradicts itself: §4 mandates per-locale line-height (1.35 vs 1.40), §8 asks for exact overlay. §4 wins. Column x-positions are byte-identical except the totals block, which §4 itself specifies as 74mm/82mm. 1.13mm over a 148.5mm half is not perceptible. |
| D3 | `BOTH` language mode | **EN on the top half, NE below** | §8's model is one locale per sheet, and the old inline `"English / Nepali"` labels cannot hold the design's fixed label widths. This matches how the reference files are laid out. **The copy eyebrow is suppressed in BOTH** — the two halves are not copies of each other, so labelling them Student/Office Copy would be actively wrong. Asserted by test. |

Three further deviations, flagged and accepted in passing: **lakh grouping** (`en-IN`, correct for
Nepal, verified to fit every column at 8pt up to 1 crore); the **✂ glyph dropped** from the cut
marker (U+2702 is absent from both embedded Noto Latin faces — confirmed with fontkit — and printed
as tofu on every sheet; the word alone carries it next to a dashed line); and the **signing gap at
4.4mm rather than SPEC's 2.6mm**, which costs nothing because the footer band's height is
`max(QR, signature stack)` and the stack reaches only 14.95mm against the QR's 15mm.

### Cache cutover v1 → v2, and the support consequence

Document keys bump `-v1-` → `-v2-`; receipts additionally gain a format segment
(`{id}-v2-{thermal|a5}-{lang}.pdf`). **v1 objects are deliberately not backfilled** — an
already-issued document stays as issued, which is correct for an immutable financial artifact.

**Consequence, documented rather than discovered in support:** the day this ships, a clerk who
reprints last month's bill to compare will get the **old design** and report it as broken.
**12 of 15 cached bill/receipt objects in the demo tenant today are pre-cutover.** See §4 for the
support note. A forced-regenerate path is out of scope; note it for BILL-PRINT-2.

### English ships alone — NE and BOTH are gated OFF

This ticket added ~28 Nepali label keys that the 2026-07-30 review never saw. They are
design-supplied, which is not the same as native-speaker-reviewed.

`BILL_PRINT_1_NEPALI_REVIEWED = false`, ANDed with the existing flag as `NEPALI_PRINT_PERMITTED`.
A deliberate *second* constant rather than flipping the first back, which would falsely claim the
earlier review never happened. Both paths are closed:

- **render** — `resolvePrintLanguage` returns `EN` for any NE/BOTH input, including the staff
  `?lang=` override (silent: language must never block generating a money document);
- **write** — `settings.service` rejects saving `printLanguage: 'NE'` with a 400, so a tenant
  cannot save a setting that then silently does nothing.

Where the design's Nepali differs from an already-reviewed string (5 keys), **the reviewed string is
in force** and the design variant is recorded as a candidate only.

---

## 2. What was deleted — nothing left orphaned

Verified by symbol count against `main`:

| Symbol | On main | Now | |
|---|---|---|---|
| `renderHeader`, `renderInvoiceTitleRow`, `renderMetaPanel`, `renderItemsTable`, `renderBottomSplit`, `renderSignature` | 2 refs each | **0** | the six old invoice draw methods |
| `WARM_PANEL` | 3 | **0** | warm off-white panel fill — the design has no filled backgrounds |
| `AMBER` | 2 | **0** | concession colour — concessions are now parenthesised grey, greyscale-safe |
| `computeHeight` | 3 | **0 code** (1 comment) | the thermal height estimate; replaced by the measured extent |
| `drCr` | — | **0** | local sign helper, replaced by the ledger's own `balanceSign` |
| `accentColor` / `accentTint` **on the invoice** | 1 | **0 code** (1 comment) | SPEC §4 fixes the accent and permits it in four places, none a fill |

**`accentColor` is still live on the 80mm thermal slip** (`bill-receipt.service.ts:31,157`) — that
format keeps its per-tenant accent. Not orphaned.

**Assets:** no files deleted; **all four embedded Noto TTFs are still referenced.** The only file
move is `docs/design/billing-print/BILL-PRINT-1-nepali-review.md` → `docs/i18n/` (moved, not copied —
two review sheets is how a reviewer answers the stale one).

**Not removed, though an earlier draft of this ticket did remove it:** the invoice still fetches and
draws `principalSignatureUrl` / `schoolStampUrl`. They were briefly dropped on the reading that
SPEC §6's signature block has no image slot; that was **rejected on review** — a school that
uploaded a signature and finds it silently gone reads that as the software breaking, and on a
financial record it may matter more. They are reinstated into the reserved signing space above the
rule, and what *is* gone is the **unguarded** fetch: every asset load is now best-effort and falls
back to the designed blank slot.

---

## 3. Frozen thermal renderer — the freeze did NOT hold

**Asked to confirm the diff is still just the balance-after line and its height budget. It is not.**

`git diff main -- bill-receipt.service.ts` is **132 insertions, 32 deletions**. The full list:

1. **balance-after line + height budget** — the sanctioned change.
2. **Method display label** (1 line) — `metaRow(label('method'), methodLabel(...))`. Was printing
   the raw enum `ESEWA` on a parent's receipt. Flagged at the time as a deliberate one-line
   exception: the counter copy and the office copy describe the same payment, and `ESEWA` on one
   with `eSewa` on the other is worse than what the freeze protects.
3. **ZERO balance carries no DR/CR marker** — was printing `Rs. 0.00 (DR)`, telling a parent they
   owe zero rupees.
4. **Balance line suppressed for unposted payments** (`balanceAfter: null`) — a payment that never
   posted has no "after".
5. **Unallocated money split** into two rows (*Applied to balance* / *Advance credit*).
6. **`PAID TOWARDS` header covers the whole table** — an advance-only receipt printed the row with
   no heading above it.
7. **Signature overprint fixed** — via the shared `drawMixedText`, not this file, but this file's
   caller is what surfaced it. **Pre-existing since BILL-8, proven with a worktree at `main`
   showing the same 0.58mm gap** — not caused by this ticket.
8. **Height measured rather than estimated** — `computeHeight()` deleted; two-pass measure/draw with
   page breaks made structurally impossible. Trailing blank roll 48mm → 7.4mm.
9. **Data-shape additions** — letterhead fields, section/roll, txnRef, the split fields.

Every one is a correctness defect on a document handed to a parent, not tidying. But the renderer is
no longer the untouched thing the freeze intended, and **the label should stop being used** rather
than quietly stop being true.

---

## 4. Support note — pre-cutover reprints

> **"A reprinted bill looks different from the new ones."**
>
> Expected, not a fault. Bills and receipts are stored as immutable documents at the moment they are
> issued. BILL-PRINT-1 changed the design, and documents generated **before** that change keep the
> design they were issued with — reprinting one returns the original file rather than re-rendering
> it in the new layout.
>
> This is deliberate. A bill is a financial record: what was handed to a parent in Shrawan should
> still look like what was handed to them in Shrawan, and re-rendering an old bill under new rules
> could also change figures if any downstream calculation had moved.
>
> **How to tell:** the old design is one bill filling the whole A4 page. The new one is two
> half-page copies with a dashed cut line between them.
>
> **What to do:** nothing. Any bill issued after the upgrade prints in the new design. There is
> currently **no way to force an old bill to re-render** — if a school needs one, escalate; it is
> tracked as a possible BILL-PRINT-2 item.

---

## 5. Still open — context for a cold start

### 5.1 Nepali native-speaker review — BLOCKS NE/BOTH
**Sheet:** `docs/i18n/BILL-PRINT-1-nepali-review.md`. 28 new keys (Part A) plus 5 divergences where
an already-reviewed string disagrees with the design file (Part B — reviewed string is in force,
design variant is a candidate). Also asks whether Nepali needs a distinct plural for the
continuation row (`+ 1 थप शुल्क शीर्षक` vs `+ 3 …`) — the key already exists to hold one.
**To close:** apply answers to `bill-print-labels.ts`, then flip
`BILL_PRINT_1_NEPALI_REVIEWED` in its own reviewable commit, restoring the `.toBe('NE')`
expectations in `bill-print-labels.spec.ts` in the same commit (they currently assert the closed
state and are written to fail loudly on the flip, deliberately).

### 5.2 Staging container render of the Devanagari half — BLOCKS NE/BOTH
Never done; no Docker in the dev environment. The structural argument is sound — fonts are
repo-resident TTFs embedded into the PDF, not OS-resident, and all four land in `dist` via
`nest-cli.json`'s `"assets"` — but it is an argument, not a proof.
**Pair it with 5.1**: both must clear before NE goes live, and the highest-risk case (Devanagari at
8pt on a 203dpi thermal head) should be tested *after* the review, against final copy.

### 5.3 FILE-1-BLOB — unchanged, still open
`StorageService`'s public-URL builder double-appends the bucket when `S3_PUBLIC_URL` is already
bucket-qualified, and `motherland-school.principalSignatureUrl` holds a legacy 318KB
`data:image/…;base64` URI that `getObjectBuffer` rejects.
**What changed here:** bills no longer *fail* on it — every asset load is best-effort and falls back
to the designed blank slot, with a WARN naming the cause. **The underlying defect is untouched and
every other reader still trips on it.** Do not read this ticket as having fixed it.

### 5.4 BILL-PRINT-2 — real tenant columns
Four columns do not exist: **bank name, account, branch, signatory designation**. Today the footer
renders `tenants.paymentInstructions` free text unbolded (clamped to a measured 183-char / 3-line
budget so unbounded tenant text cannot grow the fixed half), and the designation comes from the
label catalogue as `Principal`. SPEC §6 wants the bank name and account bolded as separate values.
**Also fold in:** a forced-regenerate path for cached documents (§4), and the `data:`-URI-should-be-
4xx-not-500 half of FILE-1-BLOB.

### 5.5 Real-world maximum fee-structure size — needed for a structural decision
The invoice holds **6 fee lines at spec density, 7 compressed**, then a continuation row. The dev
database is not evidence: `tenant_demo` maxes at **2** lines per invoice (avg 1.16 over 19),
`motherland_school` at **1** (over 66), and the largest fee *structure* anywhere has 2 items.
**The question:** does a real Nepali school with tuition + transport + hostel + lab + exam + library
exceed 6? If routinely yes, the continuation row stops being an exception and high-line-count
invoices need a structural answer (a taller table with the two-up format abandoned for those
invoices) rather than a fitting one. **Gap-stretching was measured and rejected** — a 1-line invoice
needed a 4.31× scale factor, well past the point where the document is inflated rather than
distributed; the A/B renders are in
`~/Documents/aaramva-print-review/BILL-PRINT-1-final/invoice-line-count-comparison/`.

### 5.6 BILL-RCPT-STATUS — blocking, ruled, not implemented
`docs/api-contracts/BILL-RCPT-STATUS-phase0.md` §6 carries the ruling. **Follows BILL-PRINT-1
immediately, ahead of STOR-1 and ERR-MAP-1.**

---

## 6. Surface → format matrix (read from code)

Evidence for BILL-8-UI's click-through gate (§0). Seven entry points, **all staff-side**. Read from
the call sites, not from memory.

| Surface | File | Endpoint + params | Output | Cache |
|---|---|---|---|---|
| Payment-recorded confirmation | `finance/bill/payments/new/page.tsx:216` | `.../payments/:id/receipt?lang=` — **no `format`** | **Thermal 80mm** | get-or-generate |
| Payment detail modal | `components/finance/payment-detail-modal.tsx:141` | same — **no `format`** | **Thermal 80mm** | get-or-generate |
| Payments list row menu | `finance/bill/payments/page.tsx:198` | `...?lang=&format=a5` | **A5 two-up** | get-or-generate |
| Student invoices panel | `components/finance/student-invoices-panel.tsx:74` | `.../invoices/:id/pdf?lang=` | **Invoice A4 two-up** | get-or-generate |
| Bill run detail, per line | `finance/bill/runs/[id]/page.tsx:162` | same | **Invoice A4 two-up** | get-or-generate |
| Bulk print — run scope | `runs/[id]/page.tsx:235` → `bulk-print-dialog.tsx:77` | `POST .../runs/:id/print?lang=` | **Merged A4**, 2/sheet | always generates |
| Bulk print — class scope | `runs/page.tsx:195` → `:78` | `POST .../bill/print/class?lang=` | same | always generates |
| Bulk job download | `bulk-job-progress.tsx:56` | `GET /finance/jobs/:id` → `downloadUrl` | the merged PDF | re-fetches at click |

**Matches the ruling exactly, zero deviations:** counter moments (confirmation, detail modal) send
no `format` and get the server default `thermal`; the payments-list reprint sends `format: 'a5'`;
invoices are A4 two-up. Only the receipt endpoint accepts `format` — an invoice has one format by
design.

**No parent-portal or mobile print surface exists.** The endpoints permit PARENT; nothing calls
them.

**Two status observations, both pre-existing:** the payment detail modal already excludes VOIDED
(`payment.status !== 'VOIDED'`) and the invoice panels exclude VOIDED invoices — but **the payments
list does not**, so a bounced or voided payment is reprintable there today. That is
BILL-RCPT-STATUS (§5.6), and the list is where it will be seen.

---

## Verification state at handoff

- 1278 API tests, 138 suites. 608 web tests. `nest build` clean, web `tsc --noEmit` clean.
- 46 artifacts in `~/Documents/aaramva-print-review/BILL-PRINT-1-final/` — every one verified as
  exactly one page (bulk 2), A4 or exactly 80mm.
- **Not verified:** the thermal slips on real hardware (kit in `thermal-print-kit/`, Srijan runs it),
  the Devanagari container render (5.2), and any browser click-through — this repo has no browser
  automation.
- `tsconfig.spec.json` and its CI step live on **`chore/ci-typecheck-gate`** (branched off `main`),
  not here. When both land, BILL-PRINT-1's ~14 new spec files hit that gate for the first time; they
  were clean when run against this branch manually, but the branches have not been merged together.
