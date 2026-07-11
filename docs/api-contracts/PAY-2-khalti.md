# PAY-2 — Khalti Online Fee Payment (KPG / ePayment API)

**Save location:** `docs/api-contracts/PAY-2-khalti.md`
**Scope:** apps/api + small web/mobile touches. Reuses PAY-1's rails: same table, same invariants, same result pages. eSewa's open real-payment proof is separate (retry when their sandbox recovers) and NOT part of this session.
**Baseline:** 377 tests, all-green on main.

---

## Same four invariants as PAY-1 — restated because they're the spec
1. Redirect/callback is a hint; money is recognized only after a server-to-server **lookup** call confirms Completed for that pidx.
2. Amounts computed server-side from the invoice (note: Khalti amounts are in **paisa** — the NUMERIC(10,2) rupee value × 100, integer; conversion gets its own unit test, off-by-100 bugs are the classic Khalti mistake).
3. Idempotent by gateway transaction id (pidx) — replays never double-credit; the VERIFIED transition + payment insert share one DB transaction via the existing `recordPaymentInTx`.
4. `KHALTI_SECRET_KEY` + base URLs via optional-Joi; absent = disabled with boot notice. Never logged.

## Step 0 — Read, research, report
1. **Verify Khalti's current ePayment contract against their live docs** (docs.khalti.com — fetch; don't trust memory): initiate endpoint (server-to-server POST returning `pidx` + `payment_url`), auth header format, callback params, lookup endpoint + status vocabulary (Completed/Pending/Expired/User canceled/Refunded), sandbox base URL, test credentials for the manual payment. Paste key facts + doc URLs.
2. How PAY-1 structured things, for maximal reuse: the gateway service shape, `payment_transactions.gateway` column type (enum/check/text — does adding KHALTI need a migration 0006 or is it free?), the result pages' gateway-awareness, the mobile pay button.
3. The `payment_method` enum: confirm KHALTI exists as a value (audit said eSewa/Khalti were already enum values).

## T1 — Migration if needed (gateway column) — runner, canary-first. If the column is unconstrained text, no migration; report which.

## T2 — KhaltiGatewayService + endpoints, mirroring PAY-1's URL structure (`/finance/payments/khalti/initiate`, `/callback`, `/status/:pidx`, public pay page). Key structural difference from eSewa, honor it: Khalti initiation is a **server-to-server POST** (secret key header) that returns a `payment_url` to redirect to — no client-side signed form, so no CSP concerns this time; the pay page is just a redirect. Callback → mandatory lookup → conditional transition → atomic payment → result pages (reuse PAY-1's, parameterize gateway name/branding).

## T3 — Client: the parent fees screen's pay action becomes a two-option chooser (eSewa / Khalti) when both gateways are enabled; single button when one is. Web result pages show the right gateway name.

## T4 — Tests + docs: paisa-conversion vector, idempotent replay, disabled path, lookup-state mapping (Pending stays INITIATED; Expired/canceled → FAILED/EXPIRED). Suite ≥377. Runbook: Khalti go-live swap + reconciliation additions.

## Verification — raw
1. Migration proof if T1 applied (canary → all, ledger read-backs) or the no-migration report.
2. Live sandbox initiate: real POST to Khalti dev returning a pidx + payment_url (paste).
3. Live lookup for a fabricated/stale pidx → paste the real error/state response (S2S leg proven).
4. **Manual sandbox payment (Srijan, guided):** pause with exact instructions + Khalti test credentials from Step 0. Then the full evidence chain: lookup Completed (raw) → VERIFIED → payment row → invoice balance → notification. Read-backs everywhere.
5. Idempotency replay + abandoned-payment expiry (real sandbox where possible).
6. Chooser renders correctly with both gateways enabled (DOM/text proof).
7. Suite ≥377, push, all-green. Cleanup with read-backs (temp users/invoices; retain transaction rows deliberately if noted).

## Out of scope
ConnectIPS, refunds via Khalti's refund API, webhooks beyond callback+lookup, receipts PDF, eSewa retry (separate, standing "retry" prompt).
