# REG-1 — Registration & Credential Delivery

**Repo path:** `docs/api-contracts/REG-1-registration-and-credential-delivery.md`
**Depends on:** MAIL-1 (email infra), Sparrow SMS integration, existing auth module
**Absorbs:** PAY-1 backlog item "force-change-temp-password-on-first-login" (closed here, remove from PAY-1 backlog on completion)
**Bugs file:** `REG-1-BUGS.md` (create alongside this spec)
**Branch:** `feat/reg-1-registration-credential-delivery` → PR → CI green → Srijan merges. Claude Code never merges.

---

## 1. Scope

Two registration surfaces:

1. **Platform (super admin):** Register a school → provision tenant schema (existing flow) → create the school-admin user → deliver credentials.
2. **Tenant (school admin):** Register **staff**, **guardians/parents**, and **students** → create user accounts → deliver credentials.

Out of scope: self-registration, bulk CSV import, iOS, password-reset changes (MAIL-1 owns reset).

---

## 2. Contact-field rules (hard requirements)

| Actor | Email | Phone | Credentials delivered to |
|---|---|---|---|
| School admin (created by super admin) | **Mandatory** | **Mandatory** | Own email + own phone |
| Staff | **Mandatory** | **Mandatory** | Own email + own phone |
| Guardian/parent | **Mandatory** | **Mandatory** | Own email + own phone |
| Student | Optional | Optional | **Primary guardian's** email + phone; **plus** student's own email/phone for each that is filled |

### Validation
- Email: standard format, lowercased on write, unique within tenant (unique platform-wide for school admins).
- Phone: Nepali mobile, regex `^9[678]\d{8}$` on input; **stored as E.164 `+977XXXXXXXXXX`**. Reject anything else with 400 and a field-level error.
- Student registration **must fail with 400** if no guardian link with `isPrimary = true` is provided. Exactly one primary guardian per student (DB-level partial unique index on the join table: `UNIQUE (student_id) WHERE is_primary = true AND deleted_at IS NULL`).
- If a student's email or phone is provided, it is validated with the same rules as above.

---

## 3. Temp password & forced change

- Generation: `crypto.randomBytes`-derived, 12 chars minimum, satisfies the existing password policy. Never derived from name/phone/DOB.
- Stored only as a hash (use the existing hashing utility — do not introduce a second hasher).
- New column on `users`: `must_change_password BOOLEAN NOT NULL DEFAULT false` (set `true` on every REG-1-created account). Forward-only migration via the tenant migration runner; platform users table gets its own migration.
- Auth guard behavior: a user with `must_change_password = true` can log in and call **only** `POST /auth/change-password` (and logout). Every other authenticated endpoint returns `403` with error code `PASSWORD_CHANGE_REQUIRED`. Successful change clears the flag in the same transaction.
- Applies on **web and mobile** (mobile uses the same guard; verify with `X-Client-Type: mobile` in tests).

### Plaintext handling (non-negotiable)
- Plaintext temp password exists only: (a) in memory during registration, (b) in the BullMQ job payload.
- Queue config: `removeOnComplete: true`, `removeOnFail: true` after final retry (ledger holds the failure record; the job does not).
- The plaintext must never appear in structured request logs, Sentry breadcrumbs, or the `credential_deliveries` table. Add an explicit redaction test: register a user, grep captured log output for the generated password, assert absent.

---

## 4. Delivery pipeline & ledger

**BUG-1 lesson applies: no silent delivery failure, ever.**

### Table (per tenant; platform copy for school-admin deliveries)
```
credential_deliveries
  id              UUID PK
  user_id         UUID NOT NULL      -- account whose credentials were sent
  recipient_user_id UUID NULL        -- guardian, when routing student creds
  channel         TEXT NOT NULL      -- 'EMAIL' | 'SMS'
  recipient       TEXT NOT NULL      -- email address or E.164 phone
  status          TEXT NOT NULL      -- 'PENDING' | 'SENT' | 'FAILED' | 'SENT_DRY'
  attempts        INT NOT NULL DEFAULT 0
  last_error      TEXT NULL
  created_at / updated_at
```
No `deleted_at` — this is an append-only ledger; rows are never deleted or updated except by the worker.

### Behavior
- Registration handler writes one PENDING row per (channel × recipient) inside the registration transaction, then enqueues jobs on a `credential-delivery` BullMQ queue after commit.
- Worker: email via MAIL-1 infra; SMS via Sparrow. 3 attempts, exponential backoff. Final failure → status FAILED with `last_error` populated.
- **Registration succeeds even if delivery later fails** — the account exists; delivery status is inspectable and resendable. The API response includes the created delivery row IDs so the client can poll.
- `SMS_DRY_RUN=true` env flag for dev/CI: worker skips the Sparrow call and marks `SENT_DRY`. Real SMS proof is a manual gate step (see §8).
- Admin endpoints:
  - `GET /credential-deliveries?userId=` — admin-only, returns ledger rows.
  - `POST /users/:id/resend-credentials` — admin-only. Generates a **new** temp password (invalidating the old hash), re-sets `must_change_password = true`, writes new ledger rows, enqueues. Never returns or re-sends an old password.

### Student routing
On student registration, deliveries fan out to:
1. Primary guardian email (always)
2. Primary guardian phone (always)
3. Student email (only if filled)
4. Student phone (only if filled)

`recipient_user_id` set to the guardian's user ID for rows 1–2. Message template for guardians must state clearly these are the **student's** credentials (include student name + username), in the existing template language conventions.

---

## 5. Endpoints

Align with existing controllers/DTOs; adjust paths to match current routing rather than inventing parallel ones.

- `POST /platform/schools` (SUPER_ADMIN) — existing tenant provisioning + school-admin creation; extend to enforce mandatory email/phone and wire credential delivery.
- `POST /staff` (tenant ADMIN)
- `POST /guardians` (tenant ADMIN)
- `POST /students` (tenant ADMIN) — accepts guardian links inline (`guardians: [{ guardianId, relationship, isPrimary }]`) or creates guardian + student in one transaction if the existing API shape supports it; primary-guardian rule enforced either way.
- `POST /users/:id/resend-credentials` (tenant ADMIN; platform variant for SUPER_ADMIN on school admins)
- `GET /credential-deliveries` (tenant ADMIN)
- `POST /auth/change-password` — verify it clears `must_change_password`; add if the flag path doesn't exist.

All writes stamp the acting user per the accountability convention.

---

## 6. Security probes (mandatory, per QA-1 conventions)

- TEACHER, PARENT, STUDENT tokens → 403 on all registration, resend, and ledger endpoints.
- Cross-tenant probe: tenant-A admin token + tenant-B slug → 403/404, no data leak.
- `must_change_password = true` token → 403 `PASSWORD_CHANGE_REQUIRED` on a sample of protected endpoints (attendance write, fee read, profile read) on **both** web and mobile client types; change-password itself succeeds.
- Resend endpoint on a soft-deleted user → 404/409, no delivery enqueued.
- Log-redaction probe from §3.

---

## 7. Phases & checkpoints

Each phase ends at a checkpoint. **Stop and wait for Srijan's explicit "continue."**

- **Phase 1 — Data model & validation.** Migrations (`must_change_password`, `credential_deliveries`, primary-guardian partial unique index), DTO validation (email/phone rules, mandatory-field matrix), 400-path tests. Live-write proof: register a staff member via HTTP, `SELECT` read-back of user row + E.164 phone. **Checkpoint 1.**
- **Phase 2 — Temp password & forced change.** Generation, hashing, auth-guard behavior, change-password clearing, mobile-header variant, redaction test. Live proof: log in with delivered temp password, hit protected endpoint (expect 403 PASSWORD_CHANGE_REQUIRED), change password, hit again (200). **Checkpoint 2.**
- **Phase 3 — Delivery pipeline & ledger.** Queue, worker, retries, ledger writes, `SMS_DRY_RUN`, ledger read endpoint. Live proof: register guardian, `SELECT * FROM credential_deliveries` showing SENT (email) + SENT_DRY (SMS); kill MinIO-style failure simulation for email path and show FAILED + last_error after retries. **Checkpoint 3.**
- **Phase 4 — Student routing & resend.** Fan-out to primary guardian + optional student contacts; resend endpoint invalidating old password (prove old password fails login, new one works). **Checkpoint 4.**
- **Phase 5 — Security probes & regression.** Full §6 probe set; full suite ≥ 511 + new tests, raw output required; CI green on the PR. **Checkpoint 5 — REG-1 code-complete.**

---

## 8. REG-1 gate (manual, Srijan)

Not closeable by Claude Code:
1. Real Sparrow SMS proof: with `SMS_DRY_RUN=false` and real credentials, register a test user with Srijan's own phone number; screenshot/photo of received SMS; ledger row SENT. Then soft-delete the test user.
2. Real email receipt proof for the same flow.
3. On close: remove "force-change-temp-password-on-first-login" from the PAY-1 backlog list.

## 9. Proof standards (unchanged)

Raw terminal output only. Every write proven with a live HTTP call + PostgreSQL `SELECT` read-back. No mocked-only claims for anything touching SQL, auth, or delivery. Any ambiguity → stop at the checkpoint and surface it; Claude Code does not make product decisions.
