# BILLING-CALC-AUDIT-1 — Phase 0: discovery inventory

Branch `audit/billing-calc-audit-1`. **Reading only — no code changed, no tests written, nothing
executed against a database.**

Scope: every path in `apps/api/src/modules/finance/**`, `src/modules/reports/**`, `src/jobs/**`,
`src/common/money/**` and tenant migrations `0019`–`0038` that produces or mutates a figure.
Deliberately unranked (BILL-SOFTDEL-1 D1–D8 shape) — inventory before triage.

---

## 0. The arithmetic substrate

`common/money/money.ts` — decimal.js via Prisma's re-export. Arithmetic at full precision;
rounding half-up to 2dp happens in exactly one private method, reached only from `toDb()` and
`toNumber()`. `entities/finance.entity.ts::toMoney` is the single DB→Money boundary.
`is-money-string.validator.ts` keeps money out of JSON floats at the API edge.

This layer is sound. **Everything below is about what happens around it** — where figures leave
Money, where two Money computations of the same quantity exist, and where an invariant is stated in
a comment rather than in code or a constraint.

**Enforced by the database (real, not conventional):**

- `student_ledger_entries`: `CHECK (debit >= 0 AND credit >= 0)`, `CHECK (NOT (debit > 0 AND credit
  > 0))`, `CHECK (debit > 0 OR credit > 0)`, plus an unconditional `BEFORE UPDATE OR DELETE`
  trigger. **DR/CR is enforced, not conventional** — there is no signed-amount column and no way to
  represent a negative debit. This is the strongest thing in the module.
- `bill_payments.amount > 0`, `bill_payment_allocations.amount > 0`, `bill_corrections.amount > 0`.
- `uq_bill_invoices_student_period` — one invoice per (student, year, bs_year, bs_month).
- `bill_fine_accruals UNIQUE (bill_invoice_id, accrued_through)`.

**Enforced nowhere: every footing relationship.** `grep CHECK` across `0019`–`0038` returns only
enum, status and non-negativity checks. No constraint asserts `net = gross − concession + tax`, or
`total_receivable = net + previous_balance`, or `SUM(items) = header`. The word "footing" appears in
this codebase only inside the *print* layer.

---

## A. Fee assignment and structure resolution

Arithmetic lives in `student-fee-structure-assignment.service.ts`, `bill-fee-structure.service.ts`,
`bill-line-resolver.service.ts`.

### D1 — a fee head can appear twice in one structure, and is then charged twice

`bill_fee_structure_items` has no unique constraint on `(fee_structure_id, fee_head_id)` and no
overlap constraint on `effective_from`/`effective_to`. `bill-fee-structure.service.ts:61` and `:143`
insert items in a loop with no duplicate check. `FeePreviewService`'s item query selects every row
whose window covers `asOfDate`, so two overlapping rows for the same head both bill.

*Assumes:* one active amount per head per structure. *Enforced by:* nothing — not the DTO, not the
service, not the schema. *On failure:* silent double charge; both copies independently attract that
head's concessions.

### D2 — which override applies is nondeterministic when two overlap

`student_fee_overrides` has no uniqueness or overlap constraint. `findActiveForStudent` has no
`ORDER BY`, and `fee-preview.service.ts:141` collapses the result with
`new Map(overrides.map(o => [o.fee_head_id, o]))` — **last row wins, and "last" is whatever Postgres
returned.**

*On failure:* the same student can be billed two different amounts on two consecutive runs from
unchanged data.

### D3 — one bill line resolves its assignment twice, by two different queries

`bill-line-resolver.service.ts:106` calls `findAssignmentOverlappingPeriod(periodStart, periodEnd)`
and uses that row's `effective_from` to compute the proration fraction. It then calls
`feePreviewService.preview(..., asOfDate: periodEnd)` (`:130`), which independently calls
`findActiveAssignment(periodEnd)` to decide which structure's amounts to read. **Two resolutions,
two queries, no cross-check.**

They agree on ordinary data and diverge exactly when assignments change mid-period: an assignment
ending on the 20th is found by the first and not by the second (preview throws `NotFoundException`
→ the line becomes `FAILED`); a same-period handover means the fraction can come from one
assignment and the amounts from another.

*This is the two-pass failure in its clearest form — same quantity, two derivations, nothing
comparing them.*

### D4 — a mid-period structure change silently drops the earlier segment

`findAssignmentOverlappingPeriod` is `ORDER BY effective_from DESC LIMIT 1`. A student on structure
A for days 1–20 and structure B for 21–end is billed **only** B, prorated from the 21st. Days 1–20
are never billed by anything.

*Enforced by:* nothing. There is no per-segment billing code — the invariant "at most one assignment
touches a billing period" is held purely by the absence of a second code path.

### D5 — proration is start-only, and the fraction is a JS float

`bill-line-resolver.service.ts:117-122`: proration triggers only on `effectiveFromAd > periodStart`.
An assignment *ending* mid-period bills the full month. Separately,
`fraction = daysBilled / daysInMonth` is a binary double handed to `Money.mul(factor)` — so the one
arithmetic input that is *not* exact decimal is the one multiplying every prorated head.
`.mul(daysBilled).div(daysInMonth)` would be exact.

*On failure:* sub-paisa error per head, amplified by D13's per-item rounding.

---

## B. Discounts and concessions — stacking, ordering, caps

Arithmetic lives in `fee-preview.service.ts` (`resolveConcessionAmount`, the `heads.map`, the
whole-bill block) and `bill-line-resolver.service.ts`.

### D6 — `grossTotal − concessionTotal ≠ netTotal` whenever an override exists

`fee-preview.service.ts:160` accumulates `grossTotal` from the **structure** amount; `:172`
accumulates `headNetSubtotal` from `effectiveBase` (the **override**). A head with gross 1000,
override 800, no concessions returns `grossTotal: 1000, concessionTotal: 0, netTotal: 800`.

The service's own docstring states the rule ("an override is a different gross, not a discount") —
the code then reports a gross that contradicts it. *Enforced by:* nothing; the three totals are
independent accumulators and no assertion relates them.

### D7 — the resolver re-derives concession as `gross − net`, turning an override into a discount

`bill-line-resolver.service.ts:159`: `const concession = gross.sub(net)`, where `gross` is
`head.grossAmount` (structure) and `net` is `head.netAmount` (override-based). The invoice therefore
records the 200 from D6 as a **concession**, contradicting the preview's own `concessionTotal: 0`
for the same student, same period, same data.

Two places compute "this student's concession" and they disagree by construction. This figure feeds
`bill_invoice_items.concession_amount`, which feeds `concession-register-report.service.ts` and the
printed discount column.

### D8 — concessions stack additively against a fixed base, and overshoot is silently clamped

Every head concession is computed against `effectiveBase` (`:165`), not against the running net —
two 50% concessions remove 100%, not 75%. Same for whole-bill (`:196`, all against
`preWholeBillTotal`). Order-independent, so no ordering bug — but `clampNonNegative` (`:174`, `:203`,
and again at `bill-line-resolver.service.ts:227`) discards any excess with no record, no warning,
and no field capturing what was dropped.

*Assumes:* configured concessions never exceed the base. *Enforced by:* the clamp. *On failure:* the
excess vanishes; nothing downstream can tell a fully-waived bill from an over-waived one.

### D9 — a PERCENT concession's value is unbounded, and `cap_amount` is upper-only

`student-concession.dto.ts:17` is `@IsMoneyString()` — a non-negative decimal string. Nothing
restricts a `PERCENT` row to ≤ 100; `"500"` is accepted and yields a 500% discount (then clamped by
D8). The precedent for the fix already exists in the codebase: `tax-rate.dto.ts:17` is
`@IsNumber({maxDecimalPlaces:3}) @Min(0) @Max(100)`. The same gap exists on `late_fee_rules.value`
for `type = 'PERCENT'`.

Separately, `resolveConcessionAmount`'s docstring says `cap_amount` "bounds the result either way"
but the code (`:55`) only clamps the upper bound — **the comment describes a floor that does not
exist.**

### D10 — tax is charged on a base the whole-bill concession never touches

`bill-line-resolver.service.ts:174` accumulates `taxableBaseTotal` from each head's net *after head
concessions*; the whole-bill concession is subtracted later (`:231`) and never reduces the taxable
base. So the ordering is: head concession → tax base → whole-bill concession → clamp → add tax.
Whether that is intended is undocumented; it is not stated in the spec text quoted in either file's
docstring.

### D11 — which tax rate applies is nondeterministic

`bill-line-resolver.service.ts:145`: `SELECT rate, applies_to FROM tax_rates WHERE … LIMIT 1` with
**no `ORDER BY`**. `tax_rates` has no constraint preventing two rows with overlapping
`effective_from`/`effective_to`. Two overlapping rates → the applied rate is whatever the planner
returns.

---

## C. Invoice posting — rounding relative to summation

Arithmetic lives in `bill-run.service.ts` (draft) and `bill-run-post-runner.service.ts` (post).

### D12 — the invoice header is frozen and its items are re-derived: one row, two epochs

`bill-run-post-runner.service.ts:157-166` reads `gross`/`concession`/`tax`/`net` from
`bill_run_lines` (frozen at draft) but takes `taxable_base` and `tax_rate` from a **fresh**
`resolve()` call (`:131`). Both land in the same `INSERT` (`:196-201`).

So on a single `bill_invoices` row, `tax_amount` is from draft time and `tax_rate`/`taxable_base`
are from post time — **`tax_amount ≠ taxable_base × tax_rate` the moment a rate changes between
draft and post**, and nothing notices. The item rows come from the same fresh resolve, so
`SUM(bill_invoice_items.*)` reflects post-time data while the header reflects draft-time data. The
docstring names the split deliberately; it does not name this consequence.

### D13 — items never sum to the header, on ordinary data

Two independent reasons.

**(a) Rounding placement.** `bill-line-resolver.service.ts` accumulates `grossHeadTotal` /
`taxableBaseTotal` from **unrounded** Money and rounds once at the end (`:236`), while each item's
`grossAmount`/`netAmount` is rounded individually (`:184-186`). Sum-of-rounded ≠ rounded-sum
whenever proration produces fractional paisa.

**(b) Structural.** The whole-bill concession is applied to the header (`:230`) and attributed to
**no item at all** — documented at `:64-70` as "must-resolve-before-BILL-8". BILL-8 has since
shipped.

The consequence is that `bill-pdf.util.ts::apportionWholeBillConcession` exists as a **render-time
plug**: it computes `wholeBillConcession = invoice.concessionAmount − SUM(item.concessionAmount)`
(`bill-document.service.ts:164-167`) and spreads the difference by gross share. That subtraction
absorbs *any* discrepancy between header and items — including D7's override-as-concession and
D13(a)'s rounding drift — and prints it as though it were a whole-bill discount. **The printed
document always foots; it foots by construction, not because the stored data agrees.**

### D14 — the post-time re-derivation guard is a shape check, not a value check

`bill-run-post-runner.service.ts:135`: `if (resolved.outcome !== 'DRAFT') throw`.

This reads as "the fresh resolve still agrees with the draft", and is the only thing standing
between a changed catalog and a posted invoice — but it inspects **only the enum**, never a figure.
`resolved.gross`, `.net` and `.taxAmount` are all in scope at that line and none is compared to the
frozen line's values. On ordinary data `outcome` is always `'DRAFT'`; the assertion cannot fail for
the reason it appears to exist.

**This is the footing assertion, again.**

### D15 — `total_receivable` includes the entire prior balance, and six consumers treat it as this invoice's own value

`bill-run-post-runner.service.ts:170`: `totalReceivable = netAmount + previousBalance`, where
`previousBalance` is the **lifetime** ledger sum across all academic years (`:150`). The ledger entry
correctly debits only `netAmount`.

But `total_receivable` is the figure used as "this invoice's outstanding" by:
`fetchUnpaidInvoicesOldestFirst`, `recomputeInvoiceStatus`, `fee-aging-report`,
`bill-invoice.service` list/detail, `esewa.service`/`khalti.service` initiation, and
`bill-correction.service::creditableAmount`. Consequences are catalogued as D23, D25, D28, D32, D33.

Immediate consequence at the post site itself: the advance-consumption block (`:265-273`) allocates
a student's advance against **this** invoice for an amount that covers *other* invoices' arrears, so
`bill_payment_allocations` for one invoice can exceed that invoice's own `net_amount` while the
older invoices it actually paid down stay `POSTED`.

### D16 — `SKIPPED_ALREADY_BILLED` is a draft-time courtesy; the real guard is a unique index

`bill-run.service.ts:314` checks for an existing invoice at draft time only. A `CLASS`-scoped run
and a `WHOLE_SCHOOL` run for the same month have different `idempotency_key`s, both draft clean, and
both post. The `uq_bill_invoices_student_period` index catches it — as a raw 23505 surfaced as a
`FAILED` line with a Postgres error string in `skip_reason`. Correct outcome, undesigned path.

---

## D. Ledger — posting, reversal, balance derivation, reconciliation

Arithmetic lives in `ledger.service.ts`, `ledger.util.ts`, `jobs/reconcile-ledger-balances.job.ts`.

### D17 — signed quantities: enforced, and the enforcement has a sharp edge

`directionToDebitCredit` (`ledger.util.ts:26`) is the only signing helper; every posting site sets
one side to the literal `'0'`. Combined with the three CHECKs this is genuinely enforced.

The edge: `CHECK (debit > 0 OR credit > 0)` means **any amount that rounds to `0.00` at
`Money.toDb()` is a 500, not a validation error.** Each posting site independently guarantees
nonzero: the payment `> 0` check, the correction `> 0` check, the fine's `delta <= 0 → return null`,
and `BILL-4-ZERO-NET`'s explicit skip. That is five separate guards implementing one rule, with no
shared helper — a sixth caller inherits nothing.

### D18 — the balance cache vs the live sum: a drift check that cannot detect drift

`bumpBalance` (`:98`) runs inside the same transaction and the same advisory lock as the entry
insert. They commit or roll back together. **There is no application path that can desynchronise
them.** `reconcile()` (`:404`) nonetheless recomputes every student nightly, compares, silently
corrects, and logs the drifted IDs at `error` level. On ordinary data its
`truth.compare(cached) !== 0` branch is unreachable — its only real coverage is manual SQL.

This matters because the cache *does* have one non-ledger consumer:
`defaulters-report.service.ts:72` reads `student_account_balances.balance`, while every other balance
surface (`getBalance`, `getStatement`, `availableCredit`, `owedBalance`, `bill-run-post-runner`'s
`previousBalance`) recomputes the live SUM. **Two places, one figure — and the check that would
catch a disagreement is the one that cannot fail.**

### D19 — there is no fiscal-year close; "opening balance" and the prior year's entries both count

`getBalance` (`:288`) and `liveBalance` sum **all** entries for a student with no `academic_year_id`
filter. `student_account_balances` is `PRIMARY KEY (student_id)` — one lifetime row, with
`academic_year_id` overwritten to whichever year posted last (`:109`).

`openingBalance` (`:139`) guards only against a *duplicate* opening balance for the same year; it
does not check, and nothing else closes out, the prior year's residual entries. Importing a Year-2
opening balance while Year-1 entries remain counts the same arrears twice, permanently, with no
error.

*Enforced by:* the operator's discipline. There is no year-end close code, no carry-forward entry
type, and no per-year balance query anywhere in the module.

### D20 — voiding a CLEARED payment with a NULL `ledger_entry_id` silently skips the reversal

`bill-payment.service.ts:482`: `if (current.status === 'CLEARED' && payment.ledger_entry_id)`. There
is no `else`. A CLEARED payment whose `ledger_entry_id` is NULL is marked `VOIDED`, its invoice
statuses recomputed, and its ledger credit **left standing** — the student keeps money they did not
pay, and the payment record says otherwise. (Also: `payment.ledger_entry_id` is read from the
pre-lock fetch while `current` re-reads only `status`.)

### D21 — a reversal can itself be reversed, re-applying the original

`reverseInTx` (`:191`) guards only `WHERE reverses_entry_id = $1` — i.e. "has *this* entry been
reversed". Nothing prevents calling `reverse()` on an entry that is itself a reversal; the result is
a third entry with the original's direction.

*Assumes:* operators do not reverse reversals. *Enforced by:* nothing.

### D22 — `NUMERIC(12,2)` ceiling

All money columns cap at 9,999,999,999.99. `Money` is unbounded, so an overflow surfaces as a
Postgres 22003 mid-transaction rather than a validated rejection. Noted for completeness; not
reachable at school scale.

---

## E. Corrections — credit notes, refunds, write-offs

Arithmetic lives in `bill-correction.service.ts` (`creditableAmount`, `availableCredit`,
`owedBalance`, `approve`).

Direction handling is clean and explicit: credit note and write-off are CREDITs, refund is a DEBIT
against advance credit; `approve()` re-validates the cap under the lock rather than trusting the
request-time check. Four findings sit around that core.

### D23 — the item-scoped and invoice-scoped caps are asymmetric, and the asymmetry over-credits

`creditableAmount` (`:464`) has two branches. The invoice branch sums *all* corrections with
`target_invoice_id = bi.id` — which includes item-scoped ones, since `requestCreditNote` sets both
columns (`:120`). The item branch sums only corrections with `target_invoice_item_id = bii.id` —
which **excludes** invoice-scoped ones.

So: issue an invoice-scoped credit note for the full invoice, then an item-scoped one for a line's
full net. The second sees a cap of the item's full `net_amount` and is approved.
`BILL-BUGS.md CORRECTIONS-CAP-SHARED` closed the CREDIT_NOTE/WRITE_OFF half of this; the
item/invoice half is still open.

### D24 — a reversed correction consumes its cap forever, and this is the opposite convention to fines

`reverse()` leaves the row `APPROVED` by design ("both entries visible" is the ledger's own chain).
`creditableAmount`'s `credited` subquery filters on `status = 'APPROVED'` with **no
reversal-exclusion**. So reversing a wrong credit note restores the balance but does *not* restore
the room to re-issue a correct one.

The fine engine answers the identical question the opposite way: `bill-fine.service.ts:220` excludes
reversed accruals via `NOT EXISTS (… WHERE sle.reverses_entry_id = bfa.ledger_entry_id)`. **Two
sibling subsystems, opposite conventions, neither documented as a choice.**

### D25 — the credit-note cap is `total_receivable`-based, so it includes the carried-forward balance

`creditableAmount:486`: `total_receivable − paid − credited`. Per D15, `total_receivable` carries
every prior unpaid month. A credit note "against this invoice" can therefore legitimately be
approved for many times this invoice's own charges.

### D26 — cash refunds are invisible to the cashier's expected-cash figure

`cashier-shift.service.ts:116`:
`expected_cash = opening_float + SUM(amount) FILTER (method = 'CASH')` over `bill_payments`.
`bill_corrections` with `refund_method = 'CASH'` is not subtracted. A cash refund paid from the
drawer during a shift makes the count short and the variance attributes it to the cashier.

*Enforced by:* nothing — held by the absence of a second term in one SQL expression.

---

## F. Fines

Arithmetic lives in `bill-fine.util.ts` (`computeTotalFine`, `pickApplicableRule`) and
`bill-fine.service.ts::processInvoice`.

The compute-total-then-post-delta shape is right, and the DB's
`UNIQUE (bill_invoice_id, accrued_through)` is a real idempotency backstop. Five findings.

### D27 — reversing a fine accrual is undone by the next run

`reverseAccrual` (`:126`) reverses the ledger entry and leaves the accrual row untouched.
`already_posted` (`:219`) excludes reversed accruals. So the next run computes
`delta = totalFine − (reduced alreadyPosted) > 0` and posts the fine again, under a new
`accrued_through` so the unique index does not stop it. **A reversal has a one-day lifespan.**

This is the exact inverse of D24, in the same module.

### D28 — the fine base is the carried-forward balance, so PERCENT fines compound

`processInvoice`'s `outstanding` (`:203-213`) is
`total_receivable − CLEARED allocations − APPROVED credit notes/write-offs`. Per D15 that includes
every prior unpaid month. A PERCENT rule therefore charges a percentage of arrears that already had
a percentage charged against them last month — compounding, undocumented, unbounded except by
`cap_amount` (which is optional).

### D29 — over-accrual is never unwound

`if (delta.compare(Money.zero()) <= 0) return null` (`:229`). When a partial payment shrinks
`outstanding`, a PERCENT rule's recomputed `totalFine` drops below `alreadyPosted` and the excess
fine simply stays on the ledger. Fines ratchet; the guard reads as "already fully accrued" and also
silently covers "over-accrued".

### D30 — a FEE_HEAD-scoped rule fines the whole invoice

`pickApplicableRule` matches a `FEE_HEAD` rule if the invoice contains that head *anywhere*
(`bill-fine.util.ts:32`), then `computeTotalFine` applies it to the invoice's entire `outstanding`.
A "2% late fee on Tuition" is charged on tuition + transport + every other head + carried-forward
balance.

### D31 — unbounded candidate scan

`fetchCandidateInvoices` (`:186`) has no date floor and no `total_receivable > 0` filter; it
re-examines every overdue invoice in the tenant's history on every run.

---

## G. The same figure computed in more than one place

### D32 — four definitions of "this invoice's outstanding balance"

| Site | Formula |
|---|---|
| `bill-payment.service.ts` — `fetchUnpaidInvoicesOldestFirst`, `fetchInvoicesByIds`, `recomputeInvoiceStatus` | `total_receivable − CLEARED allocations` |
| `fee-aging-report.service.ts` — `AGED_INVOICES_CTE` | `total_receivable − CLEARED allocations` |
| `esewa.service.ts` / `khalti.service.ts` — initiate + claim | `total_receivable − CLEARED allocations` |
| `bill-fine.service.ts` — `processInvoice` | `… − APPROVED CREDIT_NOTE/WRITE_OFF` |
| `bill-correction.service.ts` — `creditableAmount` | `… − APPROVED CREDIT_NOTE/WRITE_OFF` |

An invoice fully cancelled by an approved credit note is still shown as outstanding by aging, still
selected by AUTO_FIFO allocation, and **is still the amount a parent is asked to pay at the eSewa /
Khalti checkout** — while the fine engine and the corrections engine correctly treat it as settled.

### D33 — the aging report double-counts arrears, and disagrees with the defaulters report by design

Aging sums `total_receivable`-derived balances across *every* outstanding invoice. Per D15, invoice
N's `total_receivable` already contains invoice N−1's unpaid amount, so a student three months in
arrears contributes their oldest debt three times to the grand total. The defaulters report reads
`student_account_balances` (the ledger sum, which counts each month's net exactly once).

**Two reports, same tenant, same day, two different "total outstanding" — and the divergence grows
with arrears, which is precisely the population both reports exist to measure.**

### D34 — one collection report, two breakdowns that cannot agree

`collection-report.service.ts:83`:
`SUM(bpa.amount * ii.net_amount / NULLIF(bi.total_receivable, 0))`.

The apportionment weights are `item_net / total_receivable`. Item nets sum to the invoice's own net
(less the unattributed whole-bill concession, D13); the denominator additionally carries the prior
balance. **The weights do not sum to 1**, so the by-fee-head breakdown under-reports total collection
relative to the by-method breakdown in the same response — silently, with no residual line.

### D35 — the daybook's `totalCollected` and `netMovement` disagree the moment anything is voided

`daybook-report.service.ts:100-103`:
`total_collected = SUM(credit) FILTER (entry_type IN ('PAYMENT','DEPOSIT'))`,
`net_movement = SUM(credit) − SUM(debit)`.

A voided or bounced payment's reversal keeps `entry_type = 'PAYMENT'` and mirrors into the **debit**
column (`ledger.service.ts::reverseInTx`), so it is invisible to the first figure and correctly
reflected in the second. `byMethod` (`:87`) has the same credit-only shape.

### D36 — the float ban is lexical, and the print layer still does float money arithmetic

`__tests__/no-float-coercion.spec.ts` bans `parseFloat(` / `\bNumber(` across
`modules/{finance,hr,dashboard,library}`. It does not — and lexically cannot — catch arithmetic on
`number`-typed money. Inside the scanned tree:

- `print/invoice-half.ts:213,220` — `visible.reduce((a, l) => a + l.total, 0)` then
  `Math.round((subtotal − shown) * 100) / 100`
- `print/receipt-half.ts:172,177` — the identical pair
- `bill-pdf.service.ts:222-223` — `item.grossAmount + item.apportionedConcession`,
  `item.grossAmount − concession`

`Math.round(x * 100) / 100` is the exact idiom `money.ts`'s own docstring says Money replaced. The
guard passes because it was written against the old idiom's *name*, not its *behaviour*. Money's
claim to be "the only representation allowed to touch arithmetic anywhere in the finance module" is
not currently true.

---

## Cross-cutting shapes

**Two-pass failures — same quantity, two derivations, nothing comparing them:**
D3 (assignment resolution), D6 / D7 (concession), D12 (header vs items, and `tax_rate` vs
`tax_amount` within one row), D13 (footing, papered over at render time by a plug figure),
D18 (balance cache vs live sum), D32 (four "outstanding" formulas), D33 (aging vs defaulters),
D34 (two breakdowns in one report), D35 (two totals in one report).

**Assertions that cannot fail on ordinary data:**
D14 (`resolved.outcome !== 'DRAFT'` — an enum check standing in for a value check, with the values
in scope), D18 (`reconcile`'s drift branch — unreachable through any application path),
D36 (a lexical ban that no longer covers its own bug class).

**Invariants held only by the absence of code:**
D1 (no duplicate-head guard), D4 (no per-segment billing), D5 (no end-proration), D8 (clamp instead
of rejection), D19 (no fiscal-year close), D20 (no `else` branch), D21 (no reversal-of-reversal
guard), D26 (a missing term in one SQL expression), D29 (a `return null` covering two different
conditions).

**Signed-quantity handling:**
genuinely enforced at the ledger — three CHECK constraints, an immutability trigger, and a single
`directionToDebitCredit` helper. The convention holds. The gaps are one level up: D17's five
independent nonzero guards, D20's missing reversal, D21's reversal-of-reversal, and D24 / D27's
opposite answers to "does a reversal restore capacity".

---

## Read but not reported on

`bulk-assign-runner.service.ts`, `concession-register-report.service.ts`,
`fines-report.service.ts`, `bill-print-*`, `khalti.service.ts` (structurally identical to eSewa on
the figures that matter here), and the `apps/web` money-display layer. None of these *originate* a
figure; all consume one of the above. Phase 1 should confirm that before closing the inventory.

`split-unallocated.ts` was read closely because it is a named money computation with its own spec —
it is correct, stays in Money throughout, and its two outputs provably sum to the input.
