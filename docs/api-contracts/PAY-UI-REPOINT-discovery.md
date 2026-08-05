# PAY-UI-REPOINT — Discovery Report

**Status:** Discovery only. No code touched, no branch created beyond reading. Answers the six questions Srijan asked before any spec or change is written.

**Method:** Read the actual current code (not assumed) — `apps/mobile/app/(parent)/fees.tsx`, `hooks/useEsewaPayment.ts`, `hooks/usePayments.ts`, `types/index.ts`, `apps/api/src/modules/finance/{esewa,khalti}/{esewa,khalti}.service.ts`, `bill-invoice.controller.ts`/`.service.ts`, `finance.controller.ts` + `report.service.ts` (old rail), `apps/web`'s finance API client and parent-portal fees page, `apps/mobile/eas.json` + `.env`, and this repo's own prior discovery docs (`BILL-5-checkpoint-c-preflight.md`, `BILL-BUGS.md` → `PAY-UI-REPOINT`, `docs/ops/RUNBOOK.md`).

**Headline finding, up front:** this was already discovered once before, on 2026-07-29, during BILL-5 Checkpoint C's own pre-flight — re-confirmed here independently, live, against today's code, with nothing having changed in the interim. What's new in this pass: the exact shape of the two backend gaps that block a clean repoint, and the much larger finding in §6 — the web admin app has **no UI of any kind** for the entire BILL rail, which reframes what "repoint" actually has to mean.

---

## 1. The mobile Pay flow, traced end to end

**Screen:** `apps/mobile/app/(parent)/fees.tsx` (`ParentFees`).

1. `useMyChildren()` → `GET /students/my-children` → child picker.
2. `useChildLedger(childId, academicYearId)` → `GET /finance/reports/student/:studentId?academicYearId=` → returns a `StudentLedger` (`{ student, academicYear, invoices: Invoice[], summary }`).
3. Each `Invoice` with `balance > 0` (and `status !== 'WAIVED'`) renders `<PayChooser>`, fed by `usePaymentGateways()` → `GET /finance/payment-gateways` (rail-agnostic — just reports which gateways are configured).
4. Tap "Pay with eSewa" → `useInitiateEsewaPayment().mutateAsync(inv.id)` → `POST /finance/payments/esewa/initiate { invoiceId: inv.id }` → response's `paymentPageUrl` (built against the app's own `API_BASE_URL`, mirroring the server's own `paymentPageUrl`) opened via `Linking.openURL` in the system browser.
5. Tap "Pay with Khalti" → `useInitiateKhaltiPayment().mutateAsync(inv.id)` → `POST /finance/payments/khalti/initiate { invoiceId: inv.id }` → response's `paymentUrl` (Khalti's own hosted page, absolute URL) opened the same way.
6. An `AppState` listener marks `paymentLaunched` before opening the browser; when the app comes back to the foreground, it refetches step 2's ledger query — the mobile app never handles the gateway redirect itself, it just re-polls its own invoice list and expects the number to have moved.
7. The actual success/failure redirect landing page is **web-only** (`apps/web`'s `/payment/success|failure`, per PAY-1's own build notes) — the system browser, not the app, receives eSewa's/Khalti's redirect.

**Files involved:** `app/(parent)/fees.tsx`, `hooks/useEsewaPayment.ts`, `hooks/usePayments.ts`, `hooks/useParentChild.ts` (`useChildLedger`), `components/ui/PayChooser.tsx`, `types/index.ts` (`Invoice`, `StudentLedger`, `EsewaInitiateResponse`, `KhaltiInitiateResponse`, `PaymentGateways`).

---

## 2. Old rail vs new rail — exactly where the split is

**Not a clean "shows old, pays old" split. It's worse: the list side and the pay side each independently talk to a *different* rail, with no bridge between them.**

| Step | Endpoint | Rail | Confirmed by |
|---|---|---|---|
| List invoices | `GET /finance/reports/student/:studentId` | **OLD** — `FinanceController` → `ReportService.getStudentLedger` → `SELECT * FROM invoices WHERE student_id = ...` (`report.service.ts:214-220`) | Direct read |
| Pay via eSewa | `POST /finance/payments/esewa/initiate` | **NEW** — `EsewaService.initiate` → `SELECT bi.* ... FROM bill_invoices bi WHERE bi.id = $1` (`esewa.service.ts:181-192`) | Direct read |
| Pay via Khalti | `POST /finance/payments/khalti/initiate` | **NEW** — identical `FROM bill_invoices` query (`khalti.service.ts:156-167`) | Direct read |

The `Invoice` type the mobile app renders (`types/index.ts:215-229`) is unmistakably the old shape: `totalAmount`/`paidAmount`/`balance`, status values `UNPAID`/`PARTIAL`/`PAID`/`OVERDUE`/`WAIVED`, `items[].feeCategoryName`. The app takes that old invoice's `id` (an `invoices.id` row) and hands it, unmodified, as `invoiceId` to an endpoint that only ever queries `bill_invoices`. `invoices` and `bill_invoices` are two structurally separate tables populated by two separate pipelines (`InvoiceService.generateInvoices` vs `BillRunPostRunnerService`) with independently-generated UUIDs — there is no overlap, by construction. Every real tap on "Pay with eSewa/Khalti" hits:

```ts
if (!invoice) throw new NotFoundException(`Invoice ${dto.invoiceId} not found`);
```

— a 404, for every real parent, every time. This is not a hypothetical; it's the current, live, shipped behavior.

**Why it doesn't 404 *today* in practice:** no real school's billing data lives in `bill_invoices` yet (per §6) — `demo`'s `bill_invoices` rows are exclusively this project's own live-proof scaffolding, created and deleted by hand throughout the BILL-4 through BILL-7 sessions. A real parent hitting Pay today gets routed through the *old* invoice list, and the old invoice's `id` genuinely doesn't exist in `bill_invoices` — so the failure is live and reproducible right now, on `demo`, for anyone who taps Pay. It just hasn't been a *reported* incident because no real school's parents are using online payment yet.

---

## 3. `apps/web` — no parent-facing Pay flow, by deliberate design

**Confirmed: zero.** `grep -ri "finance/bill|bill-runs|bill_invoices|billRun"` across all of `apps/web` returns no hits at all. `apps/web/lib/api/finance.api.ts` — the *only* finance API client file in the web app — calls exclusively old-rail routes (`/finance/fee-categories`, `/finance/fee-structures`, `/finance/invoices`, `/finance/payments`).

This is not an oversight — it's a locked decision from `docs/web/WEB-P-PORTAL.md` Phase 5 (the parent portal build): Fees is explicitly **view-only**, and a **hard exclusion** in that phase's own spec bars any screen from calling `GET /finance/payments/{esewa|khalti}/status/:transactionUuid` (side-effecting despite being a GET — it can finalize/credit a stuck transaction) or `GET /finance/payment-gateways`. "Checkout stays fully out of scope for v1" is the phase's own wording.

**Traced the read-only view anyway, since it still touches the same rail question:** `apps/web/app/(portal)/parent/fees/page.tsx` renders `useStudentLedger()` (`apps/web/lib/hooks/use-finance.ts:234`), which calls `financeApi.getStudentLedger` → `GET /finance/reports/student/:studentId` — **the identical old-rail endpoint mobile uses.** So web's fees view has the same stale-data-source problem as mobile's list side, just with no Pay button attached to make it 404 — it would simply keep showing an empty or wrong ledger for any school that moved its real billing into `bill_invoices`.

---

## 4. Backend endpoints — what exists, what's missing

**Payment initiation — exists, already `bill_invoices`-based, PARENT-scoped correctly:**

- `POST /finance/payments/esewa/initiate` — `{ invoiceId }` (must be a `bill_invoices.id`). PARENT callers are object-scoped via `assertParentOwnsStudent` (guardians-linkage check, same pattern used everywhere else in this codebase). Amount is server-computed (`total_receivable − SUM(CLEARED allocations)`) — the client never sends an amount.
- `POST /finance/payments/khalti/initiate` — identical shape, identical scoping.
- `GET /finance/payment-gateways` — rail-agnostic, already correctly used by mobile today.

**Invoice listing — exists, but incomplete for this use case:**

- `GET /finance/students/:studentId/bill/invoices` (`bill-invoice.controller.ts:36-44`, PARENT-scoped via `assertGuardianOwnsStudent`) — this is the endpoint the 2026-07-29 pre-flight said **did not exist yet** ("no such endpoint is built as of Checkpoint C either"). It exists now, built as part of BILL-4 Checkpoint C's own read endpoints. **This closes the gap the earlier discovery flagged as blocking.**
- **What it returns is missing the one field the whole UI is built around.** `BillInvoiceResponseDto` (`entities/bill-invoice.entity.ts:54-82`) has `totalReceivable` but no `paidAmount`/`balance`/`outstanding` field at all — confirmed by reading `findAll`'s SQL directly (`bill-invoice.service.ts:39-50`): no payment-allocation join, no CLEARED-sum computation, nothing. The mobile screen's entire layout depends on `inv.balance` (decides whether the Pay button even renders, drives the card's amount-due display) and `inv.paidAmount` — neither exists on this response today. **A repoint needs a small, real backend addition here — this is not purely a frontend change.** The exact CLEARED-allocation-sum logic already exists, written independently three times (`esewa.service.ts:initiate`, `khalti.service.ts:initiate`, `bill-payment.service.ts`'s `fetchUnpaidInvoicesOldestFirst`/`fetchInvoicesByIds`) — a natural candidate to factor into one shared helper the moment this is touched, rather than writing a fourth copy.
- **Status-enum mismatch.** `bill_invoices.status` is `POSTED | SETTLED | PARTIALLY_PAID | VOIDED` (the BILL-4 schema's own CHECK constraint). The mobile UI's `FEE_STATUS` map is keyed on `UNPAID | PARTIAL | PAID | OVERDUE | WAIVED` — none of which are `bill_invoices` status values. There is no stored `OVERDUE` status on the new rail at all (BILL-7's own late-fee engine treats "overdue" as *derived* — `today > due_date`, never a stored flag); there is no `WAIVED` status either (a waiver on the new rail is a BILL-6 credit-note/write-off correction against the ledger, not a flag on the invoice itself). The status-badge mapping and the "is this overdue" visual logic both need real remapping, not a find-and-replace of field names.
- **Item field rename**, already a known, mechanical change: `items[].feeCategoryName` → `items[].itemName` (the TRANSPORT-ITEM migration's rename, already established elsewhere in this codebase).

---

## 5. Build/test implications — this is not a backend-SELECT proof

Every BILL-x checkpoint so far has been provable with `curl` + raw Postgres `SELECT`s. A repoint's live proof cannot be — it needs an actual tap on a device or emulator, a real redirect into a system browser, and a real (sandbox) payment completed by a human.

**Local iteration (fastest, matches this whole project's established pattern):** `cd apps/mobile && npm run start` (or `android`/`ios`) — Expo dev client/Expo Go against Metro. `lib/api.ts`'s `resolveApiBaseUrl` auto-derives the API base from the Expo dev host's current LAN IP (per `.env`'s own comment — "no more editing this file when DHCP changes your IP"), so as long as the local `apps/api` dev server (`npm run start:dev`) is running, any device/emulator on the same network reaches it with zero config. This is exactly the setup used throughout every live-proof session so far, including this one.

**On a real physical Android device specifically:** the EAS-1 finding is still load-bearing — Android 9+ blocks cleartext `http://` by default. `app.config.ts`'s `usesCleartextTraffic` override is scoped to non-production build profiles only, so a `development`/`preview` build (or Expo Go/dev-client) can reach a plain LAN dev server; a `production` build cannot, by design.

**Installable builds** (`apps/mobile/eas.json`): three profiles — `development` (dev-client APK), `preview` (installable APK, bakes `EXPO_PUBLIC_API_URL=https://api.82-112-236-82.sslip.io/api/v1` — a real deployed host, HTTPS, no cleartext concern), `production` (AAB, store-bound). A repoint fix would realistically be verified either (a) locally against the dev API + hand-crafted `demo`-tenant `bill_invoices` fixtures (cheapest, fastest), or (b) via a fresh `eas build --profile preview` sideloaded onto a real device pointed at the deployed staging API, mirroring EAS-1's own proven "does this work on a real phone" path.

**Sandbox payment availability, checked live in `apps/api/.env` just now:**
- **eSewa: usable today.** `ESEWA_PRODUCT_CODE=EPAYTEST` + a real secret key are configured — the same UAT sandbox already used successfully throughout PAY-1's own proofs.
- **Khalti: not usable.** `KHALTI_SECRET_KEY=""` — still empty, matching PAY-2's still-open backlog note ("live sandbox proofs pend that key," needs a `test-admin.khalti.com` merchant signup that was never completed). A repoint's Khalti half can be code-path-verified (initiate returns the right shape, targets the right invoice) but cannot get a completed real payment click-through until that key exists.

**Who does what:** same division of labor as every prior PAY-1/PAY-2/BILL-5-Checkpoint-C proof — I can craft the `bill_invoices` fixtures, drive everything up to handing over a real `paymentPageUrl`/`paymentUrl`, and verify+clean up backend state afterward; the actual tap-through-a-real-sandbox-login is a human-at-a-device action, same as it's always been for this gateway rail.

---

## 6. What makes this bigger than a straight repoint

**(a) — the load-bearing finding.** `apps/web` has **no admin UI for the BILL rail at all.** Not "an incomplete one" — none. `finance.api.ts` is the only finance API client in the web app, and it calls exclusively old-rail routes. There is no catalog UI, no bill-run UI (draft → post), no corrections UI, no cashier UI, nothing that would let a real school's staff actually generate a `bill_invoices` row through the product. Every `bill_invoices`/`bill_fine_accruals`/`bill_corrections` row that exists anywhere in this database right now is either `demo`'s hand-crafted live-proof scaffolding or raw API calls made by an agent session — never a real accountant clicking through a real screen. **Repointing the mobile Pay button fixes nothing for a real school on its own** — there is currently no way for that school's actual monthly billing to land in `bill_invoices` in the first place. The mobile fix and "give schools a way to actually use the BILL rail" are two different, unstarted pieces of work, and the second one is far larger than the first.

**(b)** The invoice-list endpoint mobile would need is missing a computed balance/outstanding field (§4) — a real backend addition, not a pure frontend change.

**(c)** The status-enum and item-field vocabulary genuinely differs between rails (§4) — real UI remapping work, including deriving "overdue" client-side since it's no longer a stored value.

**(d)** `apps/web` has zero payment UI, by deliberate WEB-P Phase 5 design. `docs/ops/RUNBOOK.md`'s own PAY-UI-REPOINT gate names *both* `apps/mobile` **and** `apps/web`, but web never had a Pay button to begin with — building one there isn't a "repoint," it's new-feature work (a checkout flow that has never existed), and WEB-P Phase 5 deliberately ruled it out of v1 scope. Worth resolving explicitly before any spec is written: does "PAY-UI-REPOINT" mean (i) fix mobile's Pay button + repoint web's read-only ledger view to the new data source, or (ii) *also* build web checkout from scratch. Those are very different sizes of work, and the runbook's wording currently reads as if it means both.

**(e)** Khalti's sandbox is still unconfigured (§5) — not new, but it bounds how completely a repoint's live proof can close the loop.

---

## Summary table

| Question | Answer |
|---|---|
| Mobile lists invoices from | OLD rail (`invoices`/`invoice_items`, `GET /finance/reports/student/:id`) |
| Mobile pays invoices via | NEW rail (`bill_invoices`, `POST /finance/payments/{esewa,khalti}/initiate`) — **mismatched IDs, real parents 404 today** |
| Web parent Pay button | Does not exist — deliberately excluded, WEB-P Phase 5 |
| Web's read-only fees view | Also OLD rail (`useStudentLedger` → same endpoint mobile uses) |
| New-rail payment-initiate endpoints | Exist, correct, PARENT-scoped, already `bill_invoices`-based (BILL-5 Checkpoint C) |
| New-rail invoice-list endpoint | Exists (closes the 2026-07-29 gap) but returns no balance/outstanding field |
| Blocking backend gap | A computed outstanding field on the invoice-list response |
| Blocking product gap | No web UI generates real `bill_invoices` for any real school at all |
| Live-proof method | Device/emulator + real sandbox payment (eSewa usable now, Khalti blocked on a merchant key) — not a SELECT-only proof |
