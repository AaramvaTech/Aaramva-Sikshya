# BILL-5 Checkpoint C — Pre-flight Plan (gateway re-pointing)

**Status:** Research only. No code touched. Answers Srijan's four questions before any implementation starts on the R10-frozen rail. Stop point: Srijan rules on the open decisions below before Checkpoint C build begins.

**Method:** Read the actual current code (not assumed from the spec) — `esewa.service.ts`, `khalti.service.ts`, `payment.service.ts`, `payment_transactions` migration (`0005`), `payment-gateways.controller.ts`, `esewa-public.controller.ts`, `esewa.controller.ts`, `esewa.dto.ts`, and the live frontend call sites in `apps/mobile` and `apps/web`.

---

## 1. Exactly which files change

**Backend, modified:**

| File | What changes |
|---|---|
| `apps/api/src/modules/finance/bill-payment.service.ts` | Extract `recordPaymentInTx(tx, dto, receivedById)` from the existing `recordPayment` — same split already done twice in Checkpoint B (`LedgerService.postEntry`/`postEntryInTx`, `LedgerService.reverse`/`reverseInTx`). `recordPayment()` becomes a thin wrapper: validate, open the lock, call `recordPaymentInTx`. This is the "reuse the Checkpoint A path" the spec asks for — a gateway credit needs to compose into the SAME transaction as its own conditional claim, exactly like the old rail already does with `PaymentService.recordPaymentInTx`. |
| `apps/api/src/modules/finance/esewa/esewa.service.ts` | `initiate()`: query `bill_invoices` instead of `invoices`; outstanding balance computed as `total_receivable − SUM(CLEARED allocations)`, not `invoice.balance`. `creditOnce()`: claim under `ledgerService.withStudentLock(studentId, …)` instead of a bare `tenantPrisma.run(...)`; call `billPaymentService.recordPaymentInTx(...)` instead of `paymentService.recordPaymentInTx(...)`; the tracking `UPDATE` writes `bill_payment_id`, not `payment_id`. `getReceipt()`: join `bill_invoices` instead of `invoices`. Constructor swaps `PaymentService` for `BillPaymentService` + `LedgerService`. |
| `apps/api/src/modules/finance/khalti/khalti.service.ts` | Identical shape of changes, mirroring eSewa's — `khalti.service.ts` is structurally a near-exact copy of `esewa.service.ts` today (confirmed by reading both in full), so the diff is symmetric. |
| `apps/api/src/modules/finance/dto/esewa.dto.ts`, `dto/khalti.dto.ts` | **No field rename.** `InitiateEsewaPaymentDto.invoiceId` stays named `invoiceId` on the wire (avoids a breaking contract change for any caller) — its doc comment updates to say it now means a `bill_invoices.id`. See open decision #1. |

**Backend, NOT modified (confirmed by reading them):**

| File | Why untouched |
|---|---|
| `esewa-public.controller.ts`, `khalti-public.controller.ts` | Pure delegation to the service — no table references live in the controller. |
| `esewa.controller.ts`, `khalti.controller.ts` | Same — `initiate(dto, user)` / `getStatus(id, user)` signatures don't change. |
| `payment-gateways.controller.ts` | Just reports `.enabled` booleans — untouched. |
| `payment.service.ts` (old rail) | **Untouched, in full.** `recordPaymentInTx` (old), `recordPayment`, `cancelPayment`, `findAll`/`findOne` against `payments`/`invoices` keep working exactly as today. |
| `FinanceController`'s manual cash-payment recording (old `POST /finance/payments`) | Unrelated to gateways, untouched — schools still recording cash against the old `invoices` table are unaffected. |

**Migration (new), additive only:**

```sql
ALTER TABLE payment_transactions
  ALTER COLUMN invoice_id DROP NOT NULL,
  ADD COLUMN bill_invoice_id UUID REFERENCES bill_invoices(id),
  ADD COLUMN bill_payment_id UUID REFERENCES bill_payments(id);

ALTER TABLE payment_transactions
  ADD CONSTRAINT chk_payment_transactions_one_invoice_kind
  CHECK ((invoice_id IS NOT NULL)::int + (bill_invoice_id IS NOT NULL)::int = 1);
```

This mirrors the exact "one-of-two-kinds" CHECK pattern this codebase already used for `bill_invoice_items.fee_head_id`/`transport_route_id` (TRANSPORT-ITEM). Every historical row keeps its `invoice_id` (old rail, untouched, still NOT enforced-nullable in spirit — just relaxed at the column level so the CHECK can own the real constraint). Every new gateway-initiated row after Checkpoint C sets `bill_invoice_id` instead. `payment_id` stays nullable and untouched; `bill_payment_id` is its sibling, same one-column-per-rail split, populated only once `creditOnce` succeeds.

**Confirms the old `payment_transactions` audit contract stays intact:** the table is never dropped or renamed; every existing column keeps its current type, meaning, and constraint (`transaction_uuid UNIQUE`, `status`, `gateway_ref`, `raw_payload`, `verified_at`, timestamps, no `deleted_at`). The only schema change is additive (two new nullable columns + one CHECK) — a historical row referencing the old `invoices` table via `invoice_id` reads back identically before and after this migration. Nothing here is a rename or a backfill.

---

## 2. Gateway callback → `bill_payments` + ledger entry, and idempotency

**Today (old rail, for reference):**

```ts
const payment = await this.tenantPrisma.run(async (tx) => {
  const [claimed] = await tx.$queryRawUnsafe(
    `UPDATE payment_transactions SET status='VERIFIED', ... WHERE transaction_uuid=$1 AND status IN ('INITIATED','EXPIRED') RETURNING *`,
    txn.transaction_uuid, ...
  );
  if (!claimed) return null; // lost the race
  const paymentRow = await this.paymentService.recordPaymentInTx(tx, {...}, claimed.initiated_by);
  await tx.$executeRawUnsafe(`UPDATE payment_transactions SET payment_id=$1 WHERE id=$2`, paymentRow.id, claimed.id);
  return paymentRow;
});
```

**The idempotency mechanism is the conditional claim UPDATE itself — `transaction_uuid` is `UNIQUE`, and the `WHERE status IN ('INITIATED','EXPIRED')` guard means a second callback (double-click, gateway retry, replayed webhook) matches zero rows on its second attempt and `claimed` is `null` → no-op, `ALREADY_VERIFIED` returned.** This is already proven live in PAY-1/PAY-2 (double-callback tests exist today). **Checkpoint C does not need to invent a new idempotency mechanism — it reuses this exact one unchanged.** The only thing that changes is what runs *inside* the claim once it succeeds.

**Proposed Checkpoint C shape:**

```ts
const payment = await this.ledgerService.withStudentLock(studentId, async (tx) => {
  const [claimed] = await tx.$queryRawUnsafe(
    `UPDATE payment_transactions SET status='VERIFIED', ... WHERE transaction_uuid=$1 AND status IN ('INITIATED','EXPIRED') RETURNING *`,
    txn.transaction_uuid, ...
  );
  if (!claimed) return null; // same race-loss path, unchanged

  const paymentRow = await this.billPaymentService.recordPaymentInTx(tx, {
    studentId, academicYearId,
    amount: claimed.amount,
    method: 'ESEWA', // or 'KHALTI'
    allocationMode: 'MANUAL',
    targets: [{ billInvoiceId: claimed.bill_invoice_id, amount: claimed.amount }],
    reference: gatewayRef,
  }, claimed.initiated_by);

  await tx.$executeRawUnsafe(`UPDATE payment_transactions SET bill_payment_id=$1 WHERE id=$2`, paymentRow.id, claimed.id);
  return paymentRow;
});
```

`studentId`/`academicYearId` need one extra lookup from `bill_invoices` (they're not columns on `payment_transactions` today — the old rail didn't need them because `recordPaymentInTx` (old) derives `student_id` from the invoice row it already re-selects; the new one needs them passed in explicitly per Checkpoint A/B's DTO shape). This happens before the lock opens, same place `initiate()` already looks the invoice up.

**Why `MANUAL` mode, targeting exactly the one invoice, not `AUTO_FIFO`:** the gateway flow's whole contract today is "pay *this specific* invoice you initiated a checkout against" — never a FIFO sweep across a student's other unpaid invoices. `AUTO_FIFO` could silently redirect a payer's money to an older invoice they never chose to pay right now, changing real behavior parents are already relying on. `MANUAL` here isn't going through `BillPaymentController` (no HTTP request, no human choosing to override FIFO) — it's an internal server-to-server call directly into `recordPaymentInTx`, so B5-3's `PRINCIPAL_AND_ABOVE` gate (enforced in the controller, not the service) never applies to it; that gate exists for a *human cashier* overriding allocation, not for the gateway crediting the one invoice it was told to.

**BILL-4/BILL-5's own one-entry invariants hold automatically:** `recordPaymentInTx` already posts exactly one `PAYMENT`/`DEPOSIT` ledger entry per call (Checkpoint A), so a gateway credit produces exactly one `bill_payments` row + one ledger entry, same shape the spec asks for, with zero new code for that part — it falls out of reusing the existing method.

---

## 3. What happens to the old `payments`/`invoices` rail

**Stays fully live, in parallel, indefinitely — this is not a cutover of the finance module, only of the gateway.** Confirmed from two independent sources: BILL-3's own migration comment ("no old finance table is dropped — that cutover is separate, 'after the ledger is proven', per BILL-SPEC.md §2 and R15") and Checkpoint C's own spec text ("the old `payments` table and `payment_transactions` contract are preserved"). Nothing about `payment.service.ts`, the old `invoices`/`payments` tables, or `FinanceController`'s manual cash-recording endpoints changes or goes dormant. A school still using the old system for manual invoice/payment tracking is completely unaffected.

**What DOES change, and this is the part the spec doesn't spell out but the live code forces into the open:** the *gateway services specifically* stop crediting the old rail going forward. After Checkpoint C ships, a *new* eSewa/Khalti checkout initiated against a `bill_invoices.id` credits `bill_payments`; the old rail's gateway path (crediting `invoices`/`payments`) has no live caller left pointed at it, but the CODE PATH itself isn't necessarily deleted in Checkpoint C (see open decision #2).

**The real coexistence risk, found by reading the frontend, not assumed:** `apps/mobile`'s parent Fees screen (`app/(parent)/fees.tsx`, `hooks/useEsewaPayment.ts`, `hooks/usePayments.ts`) is a **live, currently-shipped** "Pay with eSewa" / "Pay with Khalti" button, and it operates entirely on the OLD system today — it renders `type Invoice` (the old shape: `totalAmount`/`paidAmount`/`balance`/`status` values `UNPAID`/`PARTIAL`/`PAID`/`OVERDUE`), and `useInitiateKhaltiPayment`/`useInitiateEsewaPayment` POST `{ invoiceId }` sourced from that old invoice list. `apps/web` has **no** gateway-initiation call site at all (confirmed by grep — matches WEB-P Phase 5's own explicit exclusion of checkout from the new parent portal).

**This means mobile is the only live real-world entry point into the gateway rail today, and it is wired to the table Checkpoint C is re-pointing away from.** If Checkpoint C ships exactly as the spec describes it (backend-only) with no coordinating mobile change, the existing "Pay with eSewa" button keeps sending old `invoices.id` values to an `initiate()` that now expects `bill_invoices.id` — every real payer's tap would 404 with "Invoice not found." This is flagged as **open decision #3** below, not decided here.

---

## 4. PAY-1/PAY-2 manual sandbox steps — Srijan's action, not mine

The spec requires live sandbox proofs against the new table, and per the existing eSewa/Khalti PAY-1/PAY-2 sessions' own documented precedent, these specific steps need a human at a real browser with real sandbox credentials — I cannot do these:

**eSewa (sandbox = UAT `rc-epay.esewa.com.np`):**
1. Confirm `ESEWA_PRODUCT_CODE`/`ESEWA_SECRET_KEY` are still the sandbox test credentials (already configured per the current boot log: "eSewa gateway enabled (product EPAYTEST, ...)").
2. After I initiate a sandbox checkout against a real `bill_invoice` and hand you the `paymentPageUrl`, open it in a browser.
3. Complete the eSewa test-account login + payment flow (eSewa's own documented sandbox test credentials — these were already used successfully in the original PAY-1 session per the memory notes, so you should already have them).
4. Let it redirect back to our success callback.
5. Repeat the callback hit a second time (refresh the success URL, or I can replay it server-side once you confirm the first one landed) — this is the double-callback proof; you only need to do the *first* real payment click-through, I can drive the replay.

**Khalti (sandbox = `dev.khalti.com`):**
1. Confirm `KHALTI_SECRET_KEY` is a real sandbox merchant key from `test-admin.khalti.com` — per the PAY-2 session notes, this was still **pending** merchant signup last time (no shared public test key exists for Khalti, unlike eSewa). **If you haven't completed that signup yet, this is the actual blocker for the Khalti half of Checkpoint C's live proof — flagging it now, not discovering it mid-build.**
2. Once the key is live: same shape as eSewa — I initiate against a real `bill_invoice`, hand you the hosted `payment_url`.
3. Complete the payment using Khalti's documented test payer credentials (`9800000000-5` / MPIN `1111` / OTP `987654`, per the PAY-2 session notes).
4. Let it redirect back; I'll drive the double-callback replay.

**After both:** I clean up the crafted `bill_invoice`/`bill_payment`/`payment_transactions` rows the same way every prior checkpoint's live proof did — read-back-proven, nothing left dangling.

---

## Open decisions — flagged for your ruling, not decided

1. **DTO wire field name.** Keep `invoiceId` (no breaking rename, just a doc-comment update saying it now means a `bill_invoices.id`), or rename to `billInvoiceId` on the wire (clearer, but touches every caller — currently only mobile, per §3). **Recommendation: keep `invoiceId`** — the semantic drift is fully contained server-side, and renaming buys nothing since mobile needs to change its *data source* (which invoice list it reads from) regardless of the field's name.
2. **The mobile pay-button gap (§3).** Three ways to handle it, all reasonable, none decided here:
   - (a) Ship Checkpoint C backend-only exactly as spec'd, and treat "point mobile's Fees screen at `bill_invoices`" as an explicit follow-up item logged in `BILL-BUGS.md` — the old button keeps working against old invoices in the meantime (nothing breaks *today*, since no real school has `bill_invoices` data yet outside `demo`'s live-proof scaffolding).
   - (b) Widen Checkpoint C's own scope to include the minimal mobile change (repoint `useEsewaPayment`/`usePayments`/`fees.tsx` to a `bill_invoices`-shaped source) so the button never silently breaks for a real user between merge and follow-up.
   - (c) Temporarily keep BOTH gateway paths alive (old-invoice-targeting and new-bill-invoice-targeting), selected by which table the given id resolves against — closer to zero frontend risk, but contradicts the spec's explicit "move eSewa/Khalti from `invoices` to `bill_invoices`" (a single move, not a dual rail) and meaningfully increases the R10-touch surface area, which cuts against the whole point of isolating this checkpoint.
   **My recommendation is (a)** — matches the spec's literal backend-only framing, matches every prior BILL-* checkpoint's discipline of not silently expanding scope, and the actual blast radius today is zero (no live tenant has real `bill_invoices` money flowing through it yet — `demo`'s BILL-5 data is proof scaffolding). But this is your call, not mine, given it's a real product/UX tradeoff, not an engineering detail.
3. **Old gateway code path fate.** Once nothing calls `PaymentService.recordPaymentInTx` from a gateway context anymore (only the OLD rail's own manual-recording paths would still use it, if any — needs confirming), does the OLD `EsewaService`/`KhaltiService` logic get replaced in place (my proposal above) or does a NEW pair of classes get added alongside, leaving the old ones dead but present? **Recommendation: replace in place** — the spec frames this as re-pointing the *existing* services, not adding new ones, and `payment.service.ts` itself (the thing actually being bypassed) stays completely untouched either way, so there's no old code left orphaned that anything else still depends on.

---

## What Checkpoint C's live proof will look like (once you rule on the above)

Same discipline as A and B: canary-first migration, TDD for `recordPaymentInTx` extraction + the re-pointed `creditOnce`/`initiate`/`getReceipt`, full suite + `tsc` before and after, then the two manual sandbox click-throughs (your action, §4) with raw `SELECT` read-backs proving a `bill_payment` + ledger entry landed, plus a server-driven double-callback replay proving the idempotency claim still holds against the new table. Stop there — no Checkpoint D exists in BILL-5-SPEC.md; this is the phase's last checkpoint.
