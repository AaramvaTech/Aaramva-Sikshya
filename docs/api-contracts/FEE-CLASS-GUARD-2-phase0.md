# FEE-CLASS-GUARD-2 — Phase 0

**Status: discovery only. No implementation code written.**

**Scope as given:** four bare INSERT paths need hard blocks — ledger adjustment, soft-deleted
transport route, soft-deleted discount reason, and override on a never-billed fee head. Prior
ruling: none has a legitimate cross-entity case, so **no override flag and no accountability
stamp**, unlike FEE-CLASS-GUARD where overrides are routine.

**Headline: the ruling holds for all four, but two findings need your attention before it locks.**
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

## 7. Open questions for the ruling

1. **Path 2's consumer fix** — in this ticket, or handed off? And if in: skip the line, or fail the
   run, when an assigned route has been retired? (§6.2)
2. **Path 4's block definition** — A, B, or B-with-recheck? (§6.4)
3. **Path 3's second door** — `update()` sets `discount_reason_id` as well as `create()`. Both
   blocked, or is update out of scope?
4. **Path 1's academic year** — block only the soft-deleted student, or also validate that the
   `academicYearId` exists and belongs to that student's enrolment? The second is a wider check than
   the ruling names.
5. **Consistency of the 4xx** — all four are "the referenced thing exists but is not usable",
   which is what ERR-MAP-1's new `RELATED_RECORD_NOT_FOUND` (422) already describes. Reuse it, or
   mint per-path codes so a client can tell *which* reference was bad?
