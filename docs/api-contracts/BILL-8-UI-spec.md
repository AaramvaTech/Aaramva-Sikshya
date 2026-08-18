# BILL-8-UI — Print / PDF Surface for the Web Admin

**Status:** Spec — not yet built
**Touches:** `apps/web` billing admin only. **Zero `apps/api` diff expected.**
**Depends on:** BILL-8 print engine (pdfkit, merged, on main)
**Origin:** `docs/api-contracts/BILLING-AUDIT-2026-08.md` — BILL-8's entire
print surface is built and merged but unreachable from the product.

## Problem

The pdfkit print engine ships bilingual EN/NE invoice PDFs, thermal
receipts, bulk print, and per-tenant brand colour. None of it can be
reached from the web admin or mobile. A school office counter cannot hand
a parent a receipt. The backend is done; the buttons were never built.

## Ruling: this is a UI-only ticket

No new endpoints, no migration, no change to the print engine. If any
requirement below appears to need an API change, **stop at the checkpoint
and report it** rather than widening the ticket.

Print-reprint audit logging is explicitly **out of scope** and tracked
separately as **BILL-8-AUDIT** (see "Deliberately deferred").

## Decided context

- **Thermal receipts are web-only**, printed from the office desk. Mobile
  gets no print surface in this ticket.
- **Bulk print serves both** a month-end batch over a whole bill run and
  ad hoc clerk-initiated printing of a hand-picked set.

## Phase 0 — Inventory (checkpoint, no code)

Before building anything, report:

1. Every print/PDF endpoint on main: route, method, auth roles, request
   shape.
2. Response type per endpoint — streamed PDF, base64, a URL, a job id?
3. Is bulk print synchronous or a background job? If a job, what does its
   progress/result surface look like, and does it reuse the bulk-assign
   job pattern?
4. How is EN/NE language selected — request parameter, tenant setting, or
   baked in? Same question for the per-tenant brand colour.
5. What page size does the thermal receipt PDF declare?
6. Are invoice PDF and receipt separate endpoints, or one parameterised?

**Stop here.** Several rulings below are conditional on these answers.

## Phase 1 — Single-document print

### Invoice PDF

Reachable from wherever a posted invoice is visible — at minimum the
student Billing tab and the bill run detail page. A print action per
invoice row, plus one on any invoice detail view.

Behaviour: fetch the PDF and open it for the user. Do not attempt direct
printer control from the browser — it does not exist. The correct flow is
PDF → browser print dialog (or download), with the OS handling the
printer.

### Thermal receipt

The load-bearing moment is **immediately after a payment is recorded** —
that is the counter interaction this whole ticket exists to serve. A
print action must appear on the payment-recorded confirmation, not only
buried in payment history.

Also reachable from payment history rows, for reprints.

**Thermal-specific constraint:** browser print dialogs default to scaling
to fit the selected paper, which destroys a narrow thermal receipt. The
PDF must declare its true page size (Phase 0 item 5), and the UI must
tell the user to print at actual size / 100% scale, not "fit to page".
If the engine's declared page size makes correct printing impossible
from a browser, say so at the Phase 1 checkpoint — that is a real finding,
not something to paper over in the UI.

### Language

If language is a request parameter, offer an EN/NE choice at print time,
defaulting to the tenant setting. A parent may specifically want Nepali.
If it is baked in or tenant-only, leave it alone and note the limitation.

## Phase 2 — Bulk print

Two entry points, one underlying capability:

- **Month-end:** from bill run detail, print every invoice in a posted
  run. This is the high-volume path.
- **Ad hoc:** a **class + period dialog** over
  `POST /finance/bill/print/class` (`{classId, sectionId?, bsYear,
  bsMonth}`). "Ad hoc" in this ticket means exactly this and nothing
  more — see addendum A1. Arbitrary hand-picked invoice selection has no
  endpoint and is deferred to **BILL-8-ADHOC** (A2).

If bulk print is a background job, reuse the existing job progress
surface rather than building a parallel one. If it is synchronous,
consider what happens on a 200-student run and report if it is a problem
rather than silently shipping a request that will time out.

Only posted invoices are printable. Draft bill runs must not offer bulk
print.

## Deliberately deferred — BILL-8-AUDIT

Reprints of receipts are a real cash-handling risk: a duplicate receipt
is a plausible fraud vector in a school office taking cash payments. Every
print should eventually be logged append-only — document type, entity id,
user, timestamp — with any print after the first identifiable as a
reprint.

This is **not in this ticket** because it needs a migration and an API
change, and conflating it would cost this ticket its zero-API-diff
property. It gets its own spec once BILL-8-UI is merged.

## Out of scope

- Mobile print surface
- Any change to the print engine, its layout, or its brand-colour handling
- BILL-7 late-fee UI and BILL-3 opening-balance import — separately
  orphaned, separately ticketed
- Print logging (BILL-8-AUDIT, above)

## Proof

This is a UI ticket over an existing API, so the standard live-HTTP proof
applies to reachability rather than to writes:

1. Every print action in the UI must be shown hitting its real endpoint
   and returning a real PDF — not a mocked fetch.
2. Confirm zero `apps/api` diff (`git diff <base>..HEAD -- apps/api/` empty).
3. There is no browser automation in this repo. Do not fake click-through
   proof with a jsdom test driving a PDF flow. Make the load-bearing rules
   unit-testable, run a real production build, and disclose precisely what
   remains visually unverified.
4. Devanagari output is my review gate — I will eyeball the NE invoice and
   receipt myself. Flag it for me explicitly at the final checkpoint.

---

## Addendum — rulings (2026-08-18, Phase 0 checkpoint)

Binding. Phase 0's inventory findings are recorded in the chat checkpoint;
only the decisions are restated here.

### A1. "Ad hoc" means class + period, not a hand-picked list

Phase 2's ad-hoc entry point is a dialog over the existing
`POST /finance/bill/print/class`. Chosen because it keeps the ticket's
zero-API-diff property while still covering the realistic counter case
("print Grade 5 section B for Shrawan"). Phase 2 wording amended above.

### A2. Deferred — BILL-8-ADHOC (hand-picked invoice ids)

No endpoint accepts an explicit invoice-id list; bulk print offers only
RUN scope and CLASS+period. Selecting an arbitrary cross-class set needs
a new endpoint or a `PrintClassDto` change, i.e. an API diff. Deferred to
its own ticket, **BILL-8-ADHOC**, along with the question of whether the
Bulk Assign hand-picked idiom should be reused there.

### A3. Deferred — BILL-8-PARENT (parent-facing print)

`GET /finance/bill/invoices/:id/pdf` and
`GET /finance/bill/payments/:id/receipt` already grant `PARENT` and
already object-scope to the caller's own child. No parent UI exists on
web or mobile. That surface is deliberately **not** built here — this
ticket is the office counter. Tracked as **BILL-8-PARENT**.

Note for that ticket: the `?lang=` override is staff-only by design
(both controllers drop it for a PARENT caller and fall back to the
tenant default), so a parent-facing language choice would itself need an
API decision.

### A4. Presigned URLs are fetch-then-open, never cached or persisted

The print endpoints return `{ presignedUrl, generated }`, and
`READ_URL_TTL_SEC = 300` — the link is dead after 5 minutes. Therefore:

- fetch the URL at click time and use it immediately;
- never store it in TanStack Query cache, component state, `localStorage`,
  or a link `href` rendered ahead of time.

Implemented as a **mutation, not a query**, precisely so nothing caches
it. This rule is unit-tested.

### A5. `STORAGE_UNAVAILABLE` gets its own error path

Object storage is a hard dependency of the entire print surface: with S3
unconfigured, `presignRead` throws `503 STORAGE_UNAVAILABLE` and every
print action fails. That must **not** surface as a generic "couldn't
print" toast — the message names storage as the cause and says it is a
configuration problem, not a problem with the document or the user's
action.

### A6. PDF immutability per (invoice, language) is deliberate and stays

A generated PDF is an immutable artifact at a deterministic key; a second
request returns the same stored object rather than re-rendering. Reprints
are byte-identical, which is the point — a bill already handed to a
parent cannot silently change.

Accepted consequence, recorded so it is never "fixed" by accident:
**changing the tenant's brand colour (or any header field) does not alter
already-generated documents.** Only documents generated afterwards pick
up the change. Same for a language that was already rendered — EN, NE and
BOTH are separate cached artifacts under separate keys.

### A7. Draft runs hide the print action

`createForRun` rejects a run with no postable invoices with a `400`, and
a DRAFT run has none (invoice rows are only written at post time). The UI
must **hide** bulk print on a non-posted run rather than render a button
that produces that error. The 400 stays as the backstop, not the UX.
