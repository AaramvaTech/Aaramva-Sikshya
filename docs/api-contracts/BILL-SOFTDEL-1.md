# BILL-SOFTDEL-1 — billing reads that ignore `deleted_at`

**Status: open. Phase 1 BLOCKED on the production forensic (§2).**

Split out of FEE-CLASS-GUARD-2 on 2026-08-21 and re-sequenced **ahead** of it. One root cause:
**the billing read path does not filter `deleted_at`, so retired parents are still billed.**

> The INSERT guards prevent future bad state; the read path is producing wrong bills today.

That is the whole reason for the ordering. Guarding the INSERTs first would leave the live defect
running while the ticket that fixes it waits behind a ticket that prevents a problem nobody has yet.

**The defect inventory (D1-D8) and its full triage live in
`FEE-CLASS-GUARD-2-phase0.md` §8** — deliberately not duplicated here, because the triage
(which "missing filter" hits are real, which are display joins that must NOT be changed, which are
`${where}` false positives) is the part that rots if it exists in two places.

**Scope:** D1-D4 and D8 (soft-delete filters on the billing read path) plus D5-D7 (five
academic-year existence guards that accept a deleted year). **Fail the run, never skip the line.**

---

## 1. Phase 1 is blocked, and this is not a formality

### 1.1 The production forensic is a REQUIRED pre-ship step, and it cannot be run from a session

`docs/api-contracts/BILL-SOFTDEL-1-forensic.sql` is read-only and parameterised per tenant schema.
**It must be run against production, by a human with production database access, before any fix
ships.** No coding session can do it: production is a separate database on the VPS that no session
reaches, and every forensic result recorded so far is from the **dev** database.

Do not treat the dev numbers as evidence about production. They are a baseline for building
against, nothing more.

### 1.2 If §6 is non-zero, the fix ships WITH a per-student diff in hand — not after

§6 of the forensic is the forward-looking query: *what would the next run bill that the fix will
remove?* A non-zero result means live assignments are pointed at retired parents, and the first run
after the fix will produce smaller bills than the run before it.

**A school must not discover the change by noticing a bill dropped.** So if §6 is non-zero:

- produce the **per-student diff first** — which students, which line, how much less;
- ship the fix and the diff together, so the school is told before they ask;
- treat "we will explain it if someone queries it" as not shipping it.

The diff is cheap to produce *before* the change and awkward afterwards, because once the read path
filters correctly the query that would have shown the difference no longer returns the rows.

### 1.3 If §2-§5 are non-zero, that decision comes BEFORE the read path changes

Non-zero backward counts mean money has already been charged for retired items. That needs a
deliberate answer — credit notes via BILL-6, or an explicit decision to let it stand — and it must
be made **first**, because after the fix the evidence of what was billed and why is harder to
reconstruct.

---

## 2. Dev is behaviour-neutral, so the tests need crafted fixtures

The dev forensic came back **zero on every backward query across all 9 tenant schemas**, and §6's
forward exposure is armed but idle: 7 soft-deleted fee heads still sit in live structure items, but
no live assignment points at those structures, so nothing would bill differently.

**Consequence for Phase 1: there is no found data to assert against.** Every correctness test must
build its own fixture — create a fee head / route / structure, bill it, soft-delete the parent, bill
again, and assert the second run *fails* (ruling: fail the run) rather than silently producing a
smaller invoice.

This is worth stating because "the suite is green against demo" will be true both before and after
the fix, and it proves nothing. A test that passes on dev without a crafted fixture is not testing
this ticket.

---

## 3. `tenant_bill_scratch` — leave in place, logged to STOR-1

Found during the forensic: `tenant_bill_scratch` is a **partial schema**. It has no billing tables
at all and errors on every billing query (`relation "tenant_bill_scratch.bill_invoice_items" does
not exist`). It is not a tenant.

**Ruling: leave it. Do not drop it.** Two reasons:

1. **It is a useful negative case.** A schema that is registered but structurally incomplete is
   exactly the input that breaks fleet-wide tooling — migration runners, the orphan pruner, any
   "for each tenant" loop. Having one in dev means that class of bug gets found here instead of in
   production.
2. **Dropping it is precisely the obviously-safe cleanup STOR-1 exists to be careful about.** The
   pruner's own history is the argument: its reference set looked complete and would have deleted
   live data. "This is clearly unused, delete it" is the reasoning that produces those incidents.

Logged against STOR-1 (`STOR-1-notes.md`) rather than actioned here.
