# MAIL-2 — Real Email Transport for Credential Delivery

**Repo path:** `docs/api-contracts/MAIL-2-real-email-transport.md`
**Depends on:** REG-1 merged to main (PR #15)
**Bugs file:** `MAIL-2-BUGS.md`
**Branch:** `feat/mail-2-real-email-transport` from fresh `main` → PR → CI green → Srijan merges.

## 1. Scope

Replace the mock-only email path with a real, provider-agnostic SMTP transport so credential delivery (REG-1 ledger) and existing MAIL-1 flows (password reset, etc.) can send real email. SMS untouched (`SMS_DRY_RUN=true` remains; REG-G-SMS blocked on Sparrow demo account). No template redesign — existing guardian/student/staff templates stand.

## 2. Design

### Transport abstraction
- Env-driven: `MAIL_TRANSPORT=MOCK|SMTP` (default `MOCK` — dev and CI behavior unchanged).
- SMTP via nodemailer (add if absent): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`.
- One send interface used by both MAIL-1 flows and the REG-1 delivery poller; MOCK implementation preserves current test/log behavior exactly (recipient+subject only, never bodies — redaction invariant holds).
- Discovery first: inspect the current MAIL-1 service shape and adapt to it rather than building a parallel mailer. If MAIL-1 already uses nodemailer or an SMTP config, extend it; report what was found in MAIL-2-BUGS before restructuring anything. If restructuring is needed, stop and ask.

### Rate-limit-aware retry (poller change)
- Error classifier in the delivery poller: SMTP 421/450/451, HTTP 429, and provider "quota/limit" responses → **RETRYABLE_NO_ATTEMPT**: set `next_attempt_at = now + backoff`, do NOT increment `attempts`, status stays PENDING. Add a `retry_holds INT DEFAULT 0` counter (migration) so a stuck row is observable; cap holds at 50 → FAILED with `last_error = 'retry hold cap exceeded'`.
- All other errors: existing behavior (attempts++, 3 → FAILED).
- Classifier is channel-generic (lives on the poller, not the email sender) so the future real-SMS path inherits it.

### Safety rails
- `MAIL_TRANSPORT=SMTP` with any SMTP var missing → fail fast at boot with a clear error (no silent mock fallback — BUG-1 lesson).
- CI must never send real email: assert `MAIL_TRANSPORT` is MOCK/unset in the CI env; add a boot log line stating the active transport.
- Plaintext invariants unchanged: real sends read the decrypted temp password in memory only; nothing new lands in logs or DB. Redaction test re-run required.

## 3. Phases

**Phase 1 — Transport + classifier (code).** Discovery report on MAIL-1 internals → transport abstraction → nodemailer SMTP → boot fail-fast → poller classifier + `retry_holds` migration (canary → all tenants) → unit tests (transport selection, fail-fast, classifier: 429 doesn't burn attempts, cap → FAILED) → redaction re-run → full suite ≥ 595 API / 15 web / 112 mobile, tsc clean. **Checkpoint 1.**

**Phase 2 — Live proof (needs Srijan's SMTP creds in `apps/api/.env`).** With `MAIL_TRANSPORT=SMTP` + Brevo creds: register a test staff user with Srijan's real email → ledger PENDING → drain → SENT → Srijan confirms real inbox receipt (subject + temp password present, renders correctly) → login with delivered password → forced-change flow → change → soft-delete test user → ledger read-back. Also prove the classifier live if feasible (or via a forced 429 stub). **Checkpoint 2 — closes REG-G-EMAIL.**

## 4. Gates & bookkeeping

- **REG-G-EMAIL** closes at Checkpoint 2 (record in REG-1-BUGS).
- **REG-G-SMS** remains open, blocked on Sparrow demo account; when it arrives, real-send proof + template ≤160 ASCII chars check (1 credit) is its own short session.
- **MAIL-G-DOMAIN** (new, pre-production): buy/point domain, SPF + DKIM + DMARC, switch `MAIL_FROM_ADDRESS` to the domain, re-verify inbox placement. Blocked on domain purchase; OPS-adjacent.

## 5. Proof standards

Unchanged: raw terminal output, live HTTP + SELECT read-backs for every ledger/DB claim, no mocked-only claims for transport behavior that touches the poller or DB. Human-confirmed inbox receipt is the acceptance bar for Phase 2 — Claude Code cannot self-certify delivery.
