# FEE-CLASS-GUARD-2 — Phase 0

**Status: discovery only. No implementation code written.**

**Scope as given:** four bare INSERT paths need hard blocks — ledger adjustment, soft-deleted
transport route, soft-deleted discount reason, and override on a never-billed fee head. Prior
ruling: none has a legitimate cross-entity case, so **no override flag and no accountability
stamp**, unlike FEE-CLASS-GUARD where overrides are routine.

**Headline: the ruling holds for all four, but two findings need your attention before it locks.**

**Post-ruling update:** the §8 audit (ruling 3) found the soft-delete blindness is not confined to
transport routes — `fee-preview.service.ts` filters `deleted_at` on nothing at all, a retired FEE
HEAD is billed to every student on any structure containing it, and five academic-year existence
guards accept a deleted year. The ticket is three parts, not one. See §8.2.
One path's real leak is *not* the INSERT and a block there fixes nothing. One has an ordering
workflow that a naive block would break. Details in §6.

---

## 0. The one thing all four have in common

**None of these is a foreign-key problem.** Every invalid case *passes* its FK, because a
soft-deleted parent row still exists. `transport_routes`, `discount_reasons`, `fee_heads`,
`students`, `academic_years` and `bill_fee_structures` all carry `deleted_at` (verified against
`tenant_demo`), and a FK cannot see it.

So ERR-MAP-1's `23503` mapping is **irrelevant here** — it never fires for any of these. These need
application-level checks, and there is no database constraint that could substitute.

---

## 1. Ledger adjustment

| | |
|---|---|
| **INSERT** | `finance/ledger.service.ts:73`, in the private `insertEntry()` |
| **Called from** | `LedgerService.adjustment()` (`:169`) |
| **Endpoint** | `POST /finance/ledger/adjustments` — **`@Roles(...OWNER_ONLY)`** |
| **Reachable** | **Yes, from the API.** SCHOOL_OWNER only — the narrowest of the four |
| **Validation today** | **None beyond DTO shape.** No check that the student exists, is not soft-deleted, or that the academic year exists or corresponds to that student |

**What happens now:**

- *Nonexistent* student or academic year → FK `23503` → `P2010` → **500 `INTERNAL_ERROR`**. Neither
  constraint is on ERR-MAP-1's allowlist, so it stays a 500 by design.
- *Soft-deleted* student → **the FK passes**. The adjustment posts, and `bumpBalance()` then writes
  a balance row for a student who is off the roll. Money state is created for someone the school
  has removed, and it is invisible to every list endpoint (all filter `deleted_at IS NULL`).

## 2. Soft-deleted transport route

| | |
|---|---|
| **INSERT** | `finance/student-transport-assignment.service.ts:23`, `create()` |
| **Endpoint** | `POST /finance/transport-assignments` — `@Roles(...ACCOUNTANT_AND_ABOVE)` |
| **Reachable** | **Yes, from the API** |
| **Validation today** | **None.** The file imports `NotFoundException` but `create()` never uses it — the INSERT is the first thing that happens |

**What happens now — this is the most severe of the four, and it charges real money.**

`fee-preview.service.ts:180` reads the route with **no soft-delete filter at all**:

```sql
SELECT name, monthly_amount FROM transport_routes WHERE id = $1::uuid
```

`fee-preview.service.ts` contains **zero** occurrences of `deleted_at`. So a soft-deleted route is
found, priced, and added to `grossTotal` exactly like a live one. A school that retires a route
keeps billing every student still assigned to it.

## 3. Soft-deleted discount reason

| | |
|---|---|
| **INSERT** | `finance/student-concession.service.ts`, `create()` — and `update()` (`:83`) sets `discount_reason_id` too, so there are **two** doors, not one |
| **Endpoint** | `POST /finance/concessions` — `@Roles(...ACCOUNTANT_AND_ABOVE)` |
| **Reachable** | **Yes, from the API** |
| **Validation today** | **None** |

**What happens now — no money effect.** The concession's own `type` and `value` drive the discount;
`discount_reason_id` is metadata. A concession citing a retired reason still applies at full
strength, and `findActiveForStudent` filters only the concession's own `deleted_at`.

The damage is **attribution**, not arithmetic. `concession-register-report.service.ts:88` does
`JOIN discount_reasons dr ON dr.id = sc.discount_reason_id` — the row still joins (the id still
exists), so the report renders normally while attributing the concession to a reason the school
retired. `discount_reasons` carries `gl_account_code`, so this is a **GL / audit-trail** problem:
money is posted against a retired account code and nothing anywhere flags it.

## 4. Override on a never-billed fee head

| | |
|---|---|
| **INSERT** | `finance/student-fee-override.service.ts:20`, `create()` |
| **Endpoint** | `POST /finance/fee-overrides` — `@Roles(...ACCOUNTANT_AND_ABOVE)` |
| **Reachable** | **Yes, from the API** |
| **Validation today** | **None** |

**What happens now — the row is silently inert.** `fee-preview.service.ts:135` builds
`overrideByHead` from the student's active overrides, then walks the **fee-structure items**:

```ts
const heads = items.map((item) => {
  const override = overrideByHead.get(item.fee_head_id);
  const effectiveBase = override ? toMoney(override.override_amount) : gross;
```

An override whose `fee_head_id` is not among `items` **never matches**. No error, no warning, no
money change. The accountant sets an override, the API returns 201, the row is listed back to
them — and it does nothing, forever. This is the only one of the four whose failure mode is
*silence rather than wrongness*.

## 5. Severity, since the four are not alike

| Path | Failure mode | Severity |
|---|---|---|
| 2 — transport route | **Charges real money** for a retired route, indefinitely | highest |
| 1 — ledger adjustment | Creates money state for an off-roll student, invisible to every list | high |
| 4 — fee-head override | Silent no-op; the user is misled into thinking it applied | medium |
| 3 — discount reason | Correct money, wrong GL attribution in the audit trail | medium |

---

## 6. Does the no-legitimate-case ruling hold?

**Yes for all four — but two need a decision before locking.**

### 6.1 Path 1 — holds, and the obvious counter-example does not apply

The counter-example worth testing was: *a student leaves owing money, and an accountant needs to
post a correcting adjustment or write-off afterwards.* That would be a real business case.

**It does not apply, because departure is a STATUS, not a delete.** `STUDENT_STATUSES` is
`ACTIVE | PASSED_OUT | EXPELLED | TRANSFERRED | DROPPED` — a departed student keeps
`deleted_at IS NULL` and remains fully adjustable. `deleted_at` is set only by
`removeStudent()` (`student.service.ts:556`), which stamps the column and changes no status: it
means *removed from the roll / entered in error*.

Confirmed against live data: **3 of 18 demo students are soft-deleted while still
`status = 'ACTIVE'`** — the two fields are orthogonal, so a soft delete cannot be standing in for
withdrawal.

So: no legitimate case. Ruling holds.

### 6.2 Path 2 — holds, but **a block on the INSERT fixes almost nothing**

This is the finding that matters most, and it is not about the INSERT.

Blocking assignment to an already-deleted route closes one door. It does **nothing** for the far
more likely sequence:

1. Route is live; 40 students are assigned to it. Every assignment is valid.
2. The school retires the route (`deleted_at` set).
3. **Every one of those 40 keeps being billed**, because `fee-preview.service.ts:180` never filters
   `deleted_at`.

Nothing in the codebase blocks or even warns on step 2, and the INSERT guard is upstream of a
sequence that never passes through it. **The actual leak is the consumer.** A ticket that adds the
INSERT block and closes would leave the real defect untouched while looking like it fixed it.

**This needs a decision:** does FEE-CLASS-GUARD-2 own the consumer fix (adding the soft-delete
filter, and ruling what a bill run does when an assigned route has been retired — skip the line,
or fail the run), or is that a separate ticket? It should not be silently absorbed either way.

*(Note the two answers differ in money: skipping the line quietly reduces a bill a parent may
already expect; failing the run stops billing for the whole class until someone fixes the data.)*

### 6.3 Path 3 — holds; one thin edge, and the better answer is not an override

Edge worth naming: **backdating**. "We retired *Sibling Discount* in Shrawan, and we now need to
record a concession that should have applied in Ashadh, under that reason." The concession's
`effective_from` genuinely predates the retirement.

I do **not** think this justifies an override flag. The cleaner remedies already exist: un-retire
the reason, record it, retire it again; or create an explicit correction reason. Both leave a
better audit trail than a flag saying "we knowingly cited a retired GL code."

Ruling holds — but if backdating turns out to be routine at real schools, the block should be
scoped to the *concession's effective date* rather than to now.

### 6.4 Path 4 — holds, but the BLOCK'S DEFINITION decides whether it breaks a workflow

Two different blocks both satisfy "override on a never-billed fee head", and they behave very
differently:

| Candidate block | Breaks anything? |
|---|---|
| **A.** The fee head must exist and not be soft-deleted | No. Safe. |
| **B.** The fee head must be in the student's *currently assigned* fee structure | **Yes — ordering.** |

Under **B**, an accountant who sets overrides *before* assigning the fee structure is blocked. That
sequence is plausible: configuring a scholarship student's custom amounts, then assigning the
structure; or bulk-preparing overrides ahead of a new academic year. Nothing in the code enforces
an order today, and `create()` accepts any `academicYearId`, including a future year.

**This needs your ruling:** is the block A, B, or B-with-a-later-recheck (accept the row, but
surface it as inert until a matching structure is assigned)? The third option is the only one that
fixes the *silence* — which is the actual harm in this path — without forbidding the ordering.

---

## 7. THE RULINGS (Srijan, 2026-08-21)

| # | Ruling |
|---|---|
| 1 | **Path 2 owns the consumer.** Blocking the INSERT alone would discharge the concern without removing the defect — the realistic sequence never passes the guard. Fee preview and any other billing consumer must filter `deleted_at`. |
| 2 | **Fail the run, don't skip the line.** Silently changing what a school charges is worse than halting a supervised act with a named cause. |
| 3 | **Audit the same pattern across all six tables before Phase 1** (below). |
| 4 | **Path 4 takes the third option** — accept but surface as inert, plus the safe half (head must exist and not be deleted). The harm is the silence, not the ordering; forbidding override-before-assignment would invent a constraint nobody enforces today. |
| 5 | **Mint per-path error codes.** Do NOT reuse `RELATED_RECORD_NOT_FOUND` — that code must keep meaning "a guard is missing" for ERR-MAP-1 §12.2's alarm to work. |
| 6 | **Path 1's counter-example is dismissed** — the soft-delete/status orthogonality settles it. |

---

## 8. Ruling 3 — the audit, and it changes the ticket's shape

**Method.** Every backtick SQL literal under `modules/finance` (plus the dashboard and finance-report
consumers) was extracted, matched against the six soft-deletable tables by `FROM|JOIN|INTO|UPDATE`,
and checked for a `deleted_at IS NULL` in the same statement. **63 literals** touch the six tables —
51 reads, 12 writes. Each raw hit was then triaged by hand, because the scanner cannot see a filter
built in a `${where}` conditions array outside the literal.

### 8.1 The answer to "if fee-preview misses it on transport routes, does it miss it elsewhere?"

**Yes. `fee-preview.service.ts` contains ZERO occurrences of `deleted_at` — it filters nothing at
all.** The transport route was not an oversight in one query; it is the whole file's posture. The
same is true of the resolver's fee-head metadata read.

**Real defects — a billing decision consumes a soft-deleted parent:**

| # | Site | Table | Effect |
|---|---|---|---|
| D1 | `fee-preview.service.ts:180` | `transport_routes` | **Retired route still billed** (the known one) |
| D2 | `fee-preview.service.ts:120-131` | `fee_heads` | **Retired fee head still billed** — `JOIN fee_heads fh` with no filter, and the item's amount comes through with it |
| D3 | `fee-preview.service.ts:114` | `bill_fee_structures` | Retired structure still named and priced (gated by the assignment, so lower risk) |
| D4 | `bill-line-resolver.service.ts:121` | `fee_heads` | A retired head's `is_taxable` / `recurrence` / `proration_policy` still drive the line |
| D5 | `bill-correction.service.ts:56,154,206` | `academic_years` | `SELECT id FROM academic_years WHERE id = $1` — an existence guard that **accepts a soft-deleted year** |
| D6 | `bill-payment.service.ts:74` | `academic_years` | same guard, same hole — on the payment path |
| D7 | `opening-balance-import.service.ts:60` | `academic_years` | same |
| D8 | `bulk-assign-runner.service.ts:87` | `bill_fee_structures` | reads the structure's class/section scope unfiltered — and this feeds FEE-CLASS-GUARD's own mismatch check |

**D2 is bigger than the transport case that started this ticket.** A retired transport route affects
students assigned to that route; a retired fee head affects **every student on any structure
containing it**. And all four soft-deletes are reachable from the UI —
`bill-catalog.controller.ts` has `@Delete` routes for fee-heads, discount-reasons, transport-routes
and bill/fee-structures.

**By design — NOT defects (do not "fix" these):** seven `students` joins in
`bill-invoice.service.ts:44`, `bill-run.service.ts:181`, `bill-receipt-document.service.ts:195`,
`bill-correction.service.ts:412`, `bill-print-job.service.ts:87`, `dashboard.service.ts:273` and
`concession-register-report.service.ts:76`. Each joins `students` to render a **name on a row that
is already scoped** by its invoice/payment/correction. A soft-deleted student's historical invoice
must still show who it belonged to; filtering here would erase history rather than protect it.

**False positives — the filter lives in a `${where}` array outside the literal** (verified
individually): `transport-route.service.ts:49`, `discount-reason.service.ts:49`,
`fee-head.service.ts:51`, `bill-fee-structure.service.ts:98`, `bulk-assign-job.service.ts:45`
(`['class_id = $1', 'deleted_at IS NULL', "status = 'ACTIVE'"]`), `bill-print-job.service.ts:87`.

**Not affected:** `bill_fee_structure_items` has **no** `deleted_at` column — it hard-deletes, so
the unfiltered `bfsi` half of D2 is correct as written.

### 8.2 How this changes the ticket

Phase 0 scoped one consumer fix behind one INSERT block. The real shape is three parts:

1. **Four INSERT blocks** (unchanged).
2. **The billing read path's soft-delete blindness** — D1-D4, D8, concentrated in two files.
3. **Five academic-year existence guards that accept a deleted year** — D5-D7. These are a
   *different* fix from the reads: they are already guards, they just ask the wrong question.

Part 3 also answers §9 Q4 below: the academic-year hole is not a path-1 concern, it is five sites
on the correction, payment and opening-balance paths.

---

## 9. Remaining questions — answered against the rulings

**Q1. Path 2's consumer — in this ticket, and skip or fail?**
Ruled: in this ticket (ruling 1), and **fail the run** (ruling 2). Extend to D1-D4 and D8 by the
same reasoning — the argument "silently changing what a school charges is worse than halting a
supervised act" is about billing consuming retired data, and does not depend on which parent table
was retired.

**Q2. Path 4's block definition.**
Ruled (4): the safe half — the head must exist and not be soft-deleted — plus surfacing an
unmatched override as **inert** rather than rejecting it. Ordering stays legal.

**Q3. Path 3's second door — is `update()` in scope?**
**Yes, block both.** `student-concession.service.ts:83` sets `discount_reason_id` in `update()` and
reaches exactly the same invalid state as `create()`. Blocking only the create leaves a bypass that
is one PATCH away, and a guard with a trivially reachable hole is worse than none: it reads as
protection in review while providing none.

**Q4. Path 1's academic year — block the deleted year only, or also validate it belongs to the
student's enrolment?**
**Block the soft-deleted year; do NOT add the enrolment-relationship check.** The first is this
ticket's shape (referenced-but-unusable) and the audit shows it is five sites, not one (§8.1 D5-D7).
The second is a different shape — a *relationship* constraint, not a soft-delete one — and no ruling
covers it. It also carries real risk: a correction or opening balance legitimately targets a year
the student may not be currently enrolled in, so enforcing the relationship could block ordinary
back-year accounting. If it is wanted, it deserves its own decision.

**Q5. Error codes.**
Ruled (5): mint per-path codes; `RELATED_RECORD_NOT_FOUND` stays reserved for the ERR-MAP-1 filter
backstop so its rate keeps meaning "a guard is missing". Phase 1 proposes the names; each also needs
a `CODE_MESSAGES` entry in `apps/web/lib/errors.ts`, and the new catalogue-completeness test
(`errors/__tests__/catalog-completeness.spec.ts`) will fail if any is thrown without being
cataloged.
