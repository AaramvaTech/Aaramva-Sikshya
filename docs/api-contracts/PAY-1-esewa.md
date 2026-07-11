# PAY-1 — eSewa Online Fee Payment (ePay v2)

**Save location:** `docs/api-contracts/PAY-1-esewa.md`
**Scope:** apps/api (gateway integration, new tenant migration) + minimal apps/web (redirect landing pages) + minimal apps/mobile (parent "Pay online" button). Khalti is PAY-2; ConnectIPS later.
**Baseline:** 329 tests, all-green on main.

---

## Non-negotiable security invariants (the whole design hangs on these)

1. **The redirect is never trusted.** eSewa redirects the payer back with a signed base64 payload — treat it as a hint only. Money is recognized ONLY after a server-to-server **status-check API call** to eSewa confirms `COMPLETE` for that transaction_uuid + amount.
2. **Amounts come from the server.** The payable amount is computed from the invoice server-side at initiation; the client sends an invoice id, never an amount. Verification re-checks the confirmed amount equals the recorded expected amount to the paisa.
3. **Idempotent by transaction_uuid.** Callback replays, double-clicks, and status-check retries must never double-credit an invoice. The verified→payment-recorded transition happens exactly once (DB-level guard: status transition inside a transaction with a conditional UPDATE).
4. Secrets (`ESEWA_PRODUCT_CODE`, `ESEWA_SECRET_KEY`, plus sandbox-vs-prod base URLs) via Joi — optional, absent = gateway disabled with boot notice (established pattern). Never logged.

## Step 0 — Read, research, report

1. **Verify eSewa ePay v2 current contract against their live documentation** (developer.esewa.com.np — fetch it; do not trust training data or this spec's memory of field names). Confirm: form-POST endpoint URL (sandbox + prod), required fields, `signed_field_names` + HMAC-SHA256-base64 signature scheme, the redirect payload format, and the status-check endpoint + response states. Paste the key facts with the doc URL. Known-published sandbox facts to verify: product code `EPAYTEST`, the public test secret, test wallet credentials for manual payment.
2. The existing payment recording path: the atomic payment service the audit praised — exact method signature, what it needs (invoice, amount, method enum, recorder), how ONLINE/eSewa fits the existing `payment_method` enum values.
3. The parent fees screen (mobile) — where an invoice's payable state renders; the smallest sane place for a "Pay online" action.
4. Invoice model: partial-payment semantics (can an invoice be part-paid? does the gateway flow pay the outstanding balance or full amount? — report, then implement outstanding-balance).

## T1 — Migration `0005_payment_transactions` (runner, canary-first)
Tenant-schema table: id, invoice_id FK, gateway (`ESEWA`), transaction_uuid (unique), amount NUMERIC(10,2), status (`INITIATED`→`VERIFIED`|`FAILED`|`EXPIRED`), gateway_ref, raw payload JSONB (redirect + status-check responses, for disputes), initiated_by user, timestamps.

## T2 — Gateway service + endpoints
- `POST /finance/payments/esewa/initiate` (auth: PARENT for own children's invoices + staff roles; object-scoped like everything else): computes outstanding from the invoice, creates INITIATED row, returns the form fields + signature + target URL for the client to auto-submit.
- `GET /finance/payments/esewa/callback/success` + `/failure` (public, throttled): parse redirect, then **always** status-check server-to-server; on confirmed COMPLETE → conditional-transition to VERIFIED + record payment via the existing atomic payment service (method: the eSewa enum value) → redirect to a web result page. On anything else → FAILED with reason, redirect to failure page.
- `GET /finance/payments/esewa/status/:transactionUuid` (auth, scoped): re-runs verification for stuck INITIATED rows (user closed the browser mid-payment) — same idempotent transition.
- Signature util with unit tests against a fixed known-key test vector (compute expected HMAC by hand in the test).

## T3 — Web result pages
`/payment/success` + `/payment/failure`: minimal, tenant-branded, shows invoice ref + amount + gateway ref, "return to app" guidance. These are landing pages for a mobile-initiated browser flow — no auth required to *view* (they display only what the query params + a public receipt-lookup by transaction_uuid expose: no student PII beyond invoice ref).

## T4 — Mobile (parent)
"Pay online with eSewa" button on an unpaid invoice → calls initiate → opens the returned URL via `Linking.openURL` (system browser; no webview credential-capture concerns). On return/refocus, the fees screen refetches. Small; no deep-link plumbing in this session.

## T5 — Tests + docs
Unit: signature vector, amount-from-server, idempotent transition (simulate double callback), disabled-gateway path. Suite ≥329. Runbook section: going live = swapping env base URLs + merchant credentials; reconciliation query for VERIFIED-vs-recorded-payments.

## Verification — raw output
1. Runner: 0005 canary → all tenants, ledger read-backs.
2. Signature unit vector + live initiate response (sandbox) showing correctly signed fields.
3. Status-check connectivity: call eSewa sandbox status API for a fabricated uuid → paste the NOT_FOUND-class response (proves the server-to-server leg works).
4. **Manual sandbox payment (Srijan, guided):** session pauses with exact instructions — which demo invoice, the button/URL, eSewa sandbox test-wallet credentials from Step 0. Srijan pays; session then shows: callback hit → status-check COMPLETE (raw response) → transaction VERIFIED → payment row created via the atomic service → invoice balance reduced → `email_log`/notification side-effects if any. Read-backs for every row.
5. Idempotency proof: replay the same callback → no second payment row (count unchanged), response still graceful.
6. Stuck-payment proof: initiate + abandon → status endpoint → remains INITIATED/expires cleanly, invoice untouched.
7. Suite ≥329, push, all-green. Cleanup: test transactions against demo tenant removed with read-backs (or retained deliberately as sandbox history — report which and why).

## Out of scope
Khalti (PAY-2), ConnectIPS, receipts PDF, refunds, webhooks/IPN beyond redirect+status-check (verify in Step 0 whether eSewa v2 even offers server webhooks; report), reconciliation cron.
