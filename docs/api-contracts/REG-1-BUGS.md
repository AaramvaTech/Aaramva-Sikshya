# REG-1 — Bug & Findings Log

`| # | Module | Feature | Repro | Expected | Actual | Root cause | Fix | Re-verified |`

Bugs and flagged observations for REG-1 (Registration & Credential Delivery). Same
convention as `QA-1-BUGS.md`: real bugs get a full row; design/spec conflicts and
deferrals are recorded as `REG-OBS-*` entries and surfaced at the owning checkpoint.

---

## Phase 1 — Data model & validation

### REG-OBS-1 (Phase 1) — `must_change_password` already shipped (POL-1 T4 / migration 0006) — NO new tenant migration

The spec (§3, §7 Phase 1) lists a `must_change_password` migration as Phase-1 work.
On the **tenant** `users` table this **already exists**: `0006_must_change_password.sql`
(POL-1 T4, which "absorbs" the same PAY-1 backlog item REG-1 cites) added
`must_change_password BOOLEAN NOT NULL DEFAULT false`, and provisioning/resend paths
already set it TRUE for generated passwords. **No new tenant migration added** — doing
so would duplicate an applied migration (immutable-file rule). Verified present live
(see Checkpoint 1 proof). The auth-guard *behavior* (§3: block all but change-password
when the flag is set, error code `PASSWORD_CHANGE_REQUIRED`) is **Phase 2** — the flag
column is the only Phase-1 slice of this item.

### REG-OBS-2 — Platform-side migrations: is `PlatformAdmin` in REG-1 scope? — **RESOLVED (2026-07-14)**

> **RULING:** Tenant side is sufficient. `PlatformAdmin` accounts are out of REG-1 scope; their
> password hygiene belongs to OPS-1. Spec §3/§4/§5 amended — removed the platform copy of
> `credential_deliveries` and the platform resend variant. `POST /platform/schools` creates the
> tenant + its `SCHOOL_OWNER` and delivers credentials via the new tenant's own ledger.


Spec §3 ("platform users table gets its own migration") and §4 ("platform copy for
school-admin deliveries") assume a platform-side `users` table + credential ledger.
Reality: the public schema has **no `users` table** — platform SaaS owners live in
`PlatformAdmin` (Prisma-managed). A **school admin** (§2 row 1, "created by super
admin") is a **tenant** `SCHOOL_OWNER` user in `tenant_<slug>.users`, so the tenant
`must_change_password` (0006) and the tenant `credential_deliveries` (0010) **already
cover school-admin creation**. `PlatformAdmin` accounts are the platform operators and
are **not** created by any REG-1 registration surface.

**Decision needed:** does REG-1 want `must_change_password` + a `credential_deliveries`
copy on `PlatformAdmin`/public for platform-operator onboarding (out of the §1 scope
list), or is the platform side satisfied by the tenant tables because school admins are
tenant users? **Not implemented speculatively** (per §9 — Claude Code does not make
product decisions). Tenant side implemented in full.

### REG-OBS-3 — spec assumed BullMQ, but BullMQ was removed (OPS-1) — **RESOLVED (2026-07-14)**

> **RULING:** Outbox poller — do NOT reinstate BullMQ. Spec §4 amended: the delivery worker is a
> `@nestjs/schedule` poller using `SELECT ... FOR UPDATE SKIP LOCKED` over PENDING ledger rows.
> Added `next_attempt_at TIMESTAMPTZ` to `credential_deliveries` (migration 0012) for exponential
> backoff; 3 attempts then `FAILED` with `last_error`. The BullMQ-payload plaintext model is
> replaced by table `credential_delivery_secrets` (one row per user; temp password encrypted
> AES-256-GCM, key from env `CREDENTIAL_SECRET_KEY`, IV + auth-tag columns). The secret row is
> deleted in the same transaction that moves the user's last non-terminal delivery row to
> `SENT`/`SENT_DRY`/`FAILED`. Plaintext never in the ledger, never in logs; the redaction test
> also asserts plaintext is absent from a `pg_dump` of the tenant schema (encrypted blob expected).


Spec §3/§4 specify a `credential-delivery` **BullMQ** queue with `removeOnComplete`/
`removeOnFail` and exponential backoff. **BullMQ was fully removed in OPS-1** (zero
`bullmq`/`Queue`/`Processor` in the codebase; the only scheduler is `@nestjs/schedule`,
Redis is disabled-by-design in dev). Phase 3 cannot use BullMQ as written. **Resolve
before Phase 3:** reinstate a queue (Redis/BullMQ back on) vs. a `@nestjs/schedule`-driven
outbox worker over the `credential_deliveries` ledger (append-only PENDING rows are
already an outbox — a poller can drain them without a broker). No Phase-1 impact.

### REG-OBS-4 — Guardian/student write-path E.164 storage deferred; existing guardian phones not E.164 — **RESOLVED (2026-07-14)**

> **RULING:** Backfill migration at the **start of Phase 4**, before touching any guardian write
> path. Forward-only migration normalizing `98XXXXXXXX` / `0977…` / `977…` variants to `+977…`.
> Rows that don't cleanly normalize to `^9[678]\d{8}$` are left untouched and listed here in
> REG-1-BUGS.md — no guessing. Before applying: produce a dry-run report (per-tenant counts + full
> list of non-normalizable rows) and **STOP for approval** at that point within Phase 4 (forward-only
> is irreversible). Find-or-create on phone must normalize the lookup key the same way.


Phase 1 implements E.164 **storage** on the **staff** registration path (proven live).
It is **not** wired into the guardian/student write paths this phase because:
(1) those paths (`GuardianService.insertGuardiansTx` / `provisionGuardian`) do
**find-or-create keyed on `phone`** against **existing raw (non-E.164) guardian rows**,
so transforming only new writes would miss existing rows and could create duplicates;
(2) the guardian/student registration + delivery **fan-out is Phase 3/4** (student
routing), where these writes are exercised end-to-end. **DTO-level validation** (Nepali
`^9[678]\d{8}$` + mandatory-field matrix) **is applied to the staff, guardian, and
student DTOs now**, so any new HTTP registration is format-guaranteed. A one-time
**backfill** of existing `guardians.phone` / `staff_profiles.phone` / `users.phone` to
E.164 (`UPDATE … WHERE phone ~ '^9[678][0-9]{8}$'`) is a separate migration to schedule
with Phase 3/4. Send-time delivery is unaffected: `communication/sms.normaliseNepalPhone`
already tolerates raw input.

### REG-NOTE — Registration-contract tightening (consumer impact) — **RESOLVED (2026-07-14)**

> **RULING:** In scope as new **Phase 5 (web clients)**. Update web admin registration forms —
> staff phone mandatory, guardian email mandatory, primary-guardian selector on the student form,
> field-level rendering of the 400 errors, and treat `403 PASSWORD_CHANGE_REQUIRED` (REG-NOTE-2) as
> a redirect-to-change-password signal in the web shell. First confirm whether mobile has any
> registration or `/auth/me`-polling surface; if it does, add the force-change redirect there too,
> otherwise Phase 5 is web-only. The existing security-probes phase becomes the **final** phase
> (renumbered 5 → 6). _(Spec §7 numbering note added.)_


Making staff `phone` mandatory, guardian `email` mandatory, and requiring **exactly one
primary guardian** on `POST /students` is a deliberate contract change (§2). Existing
web/mobile registration forms must send these fields or they will 400. Wiring those
clients is out of Phase-1 scope (data model & validation only); flagged so the endpoint/
client phases update the forms.

---

_No functional bugs found in Phase 1._

> **All four Phase-1 flags are now RESOLVED** (rulings recorded above, 2026-07-14) and the
> spec was amended accordingly (§3/§4/§5/§7).

---

## Phase 2 — Temp password & forced-change auth guard

### REG-VERIFY-1 (Phase 2) — temp-password generation meets §3 (no change)

`generateTemporaryPassword` (`mail/password.util.ts`) is CSPRNG-based
(`crypto.randomInt`), default length **12**, guarantees ≥1 lower/upper/digit/symbol,
excludes ambiguous chars, and is never derived from name/phone/DOB. Already covered by
`password.util.spec` (length, charset, all-classes, distinctness across 200 calls).
Meets §3 — verified, no change. All REG-1-created accounts set `must_change_password=true`
(already true from Phase 1 / POL-1).

### REG-NOTE-2 (Phase 2) — the forced-change guard blocks `GET /auth/me` (consumer impact)

Per §3, a flagged user may reach ONLY change-password + logout, so **every** other
authenticated route — including `GET /auth/me` — returns **403 `PASSWORD_CHANGE_REQUIRED`**.
Clients already receive `mustChangePassword` in the **login** response (POL-1/POL-2), so
they can route to change-password without `/auth/me`; and a `403 PASSWORD_CHANGE_REQUIRED`
from any endpoint is itself an unambiguous "go change your password" signal. **Web/mobile
shells that poll `/auth/me` mid-session must treat that 403 as the force-change state**
(not a hard error). Flagged for the client phases; no backend change (the spec is explicit
that only change-password + logout are reachable).

### Design notes (Phase 2)

- **Flag read FRESH from the DB** in `PasswordChangeRequiredGuard`, not baked into the JWT,
  so a successful change-password unblocks the **same access token** immediately (no
  re-login, no stale-token window). change-password already clears the flag in-transaction
  and revokes refresh tokens (access token stays valid to expiry — the proof's "→ 200").
- **`HttpExceptionFilter`** was extended to honor a machine-readable `code` on the exception
  body (it previously hardcoded `code = HttpStatus[status]`), so the guard can surface the
  exact `PASSWORD_CHANGE_REQUIRED` code the spec mandates. Backward-compatible (absent code →
  HTTP status name); regression-tested both ways.
- **Platform admins (tenantId null)** are skipped by the guard (no tenant users row; not
  REG-1-provisioned) — consistent with the still-open REG-OBS-2 platform-scope question.

_No functional bugs found in Phase 2._

---

## Phase 3 — Delivery pipeline & ledger (outbox poller, REG-OBS-3 design)

### REG-NOTE-3 (Phase 3) — credential SMS must NOT go through `SmsService` (plaintext-at-rest avoidance)

`communication/SmsService.send` persists the message body into `sms_logs` **and**
console-logs it in MOCK mode. Routing the credential SMS (which contains the temp
password) through it would leak the plaintext into `sms_logs` (→ visible in a `pg_dump`)
and the console. The poller therefore handles credential SMS itself: `SMS_DRY_RUN=true`
→ `SENT_DRY` with **no message built**; real send → an in-memory Sparrow POST that never
persists the body. Redaction-safe by construction.

### Design notes (Phase 3)

- **Outbox, no BullMQ** (REG-OBS-3): `CredentialDeliveryPoller` (`@nestjs/schedule` interval,
  iterates tenants like the fine-recalc job) drains PENDING rows via `SELECT … FOR UPDATE SKIP
  LOCKED` — one row per tx, safe under concurrent/multi-instance pollers. Backoff via
  `next_attempt_at`; 3 attempts → `FAILED` + `last_error`. Manual per-tenant trigger:
  `POST /credential-deliveries/run` (tenant admin).
- **Secret at rest**: `credential_delivery_secrets` (migration 0012) holds the AES-256-GCM
  ciphertext + iv + auth_tag (base64), one row per user, key from `CREDENTIAL_SECRET_KEY`.
  Deleted in the same tx that moves the user's last non-terminal delivery to a terminal state.
- **Registration never fails on delivery**: the enqueue runs inside the registration tx only
  when `credentialKeyConfigured()`; with no key it falls back to the legacy MAIL event, so the
  account is always created. Guardian path (`createGuardianAccount`) wired; staff/student/owner
  paths migrate in later phases.
- **Env** (all in the gitignored `.env` for dev): `CREDENTIAL_SECRET_KEY` (64 hex / 32-byte
  base64), `SMS_DRY_RUN`, `CREDENTIAL_DELIVERY_POLL` (=false to disable the auto-interval; manual
  trigger still works).

_No functional bugs found in Phase 3._

---

## Phase 4 — Data quality (REG-OBS-4 backfill)

### REG-DQ-1 (Phase 4) — 4 non-normalizable phones left untouched by migration 0013

The REG-OBS-4 backfill (`0013_backfill_phone_e164.sql`) normalized **63** bare/`977…`/`0977…`
phones to E.164 across `guardians`/`staff_profiles`/`students`/`users` (demo 3, motherland 60).
Per the ruling, rows that don't cleanly match `^9[678]\d{8}$` were **left untouched and are
recorded here** (no guessing). All 4 are US-format faker-seed numbers in `tenant_motherland_school`:

| Table | id | raw_phone |
|---|---|---|
| guardians | `3a93c18f-8a6e-48c1-a352-c7257042a3bc` | `+1 (533) 285-4301` |
| guardians | `c07c54c2-eb08-45fe-b333-b20557837dd1` | `+1 (561) 677-3876` |
| students  | `00dac627-b436-422b-a3d1-7825d67de3b3` | `+1 (189) 689-9076` |
| students  | `f7fe32fe-3e46-4991-8798-222de993f226` | `+1 (981) 957-3077` |

**Edit-path 400 note:** REG-1 Phase 1 made the registration phone rules strict
(`^9[678]\d{8}$`). These 4 stored values are not valid Nepali mobiles, so any attempt to
**update** these rows through the validated write path (which re-validates `phone`) will
**400** until the phone is first corrected to a valid Nepali number. They cannot be
silently normalized (ambiguous origin) — correction is a manual data-quality task for the
school (or a targeted re-seed of motherland's faker data). Credential delivery to these
rows would also fail the E.164 recipient expectation; the poller records it (no silent loss).

**Post-apply verification (live):** `count(*) WHERE phone !~ '^\+977'` across all 4 columns ×
6 tenants = **4** (exactly the rows above); `phone ~ '^\+977'` = **63**.

### Design notes (Phase 4 — routing, resend, ledger migration)

- **Find-or-create normalization** (REG-OBS-4): `GuardianService.provisionGuardian` +
  `insertGuardiansTx` normalize the phone lookup key AND the stored value to E.164, so a
  bare/`977…` input matches a backfilled `+977…` row (no duplicate). Live-proven: an inline
  guardian phone `9815556666` stored as `+9779815556666`.
- **Student fan-out** (§4): `createStudentAccount` fans out in-tx — primary guardian email +
  phone (`recipient_user_id` = the guardian's user id) ALWAYS, plus the student's own login
  email and phone (when present). Guardian-routed rows use a template that **names the student
  + username** (signal = `recipient_user_id IS NOT NULL`). Live: 4 rows; `email_log` subject
  "Login details for Aarav FanOut" (guardian) vs "Your school account credentials" (student).
- **Ledger migration**: `createStaff`, `createStudentAccount`, and `TenantProvisioningService`
  (owner) now enqueue on the ledger when a temp password is generated + a key is configured,
  falling back to the legacy MAIL event otherwise (registration never fails on delivery).
  Live-proven for staff (`email_log` = 0 → went to the ledger). **Owner path** is code-wired +
  the tenant-admin MAIL emit gated on `result.enqueued`; its live gate is the **super-admin
  onboarding** flow (`POST /platform/schools`, generated password) — register-school always
  carries a chosen password, so it never triggers owner delivery.
- **Resend** (`POST /users/:id/resend-credentials`, tenant admin): new temp password, old hash
  invalidated, `must_change_password` re-set, sessions revoked, new ledger rows + secret.
  Live-proven: old password → **401**, decrypted new password → **200 + mustChangePassword:true**.
  Soft-deleted / unknown user → **404** (unit-tested), no enqueue.
- **REG-NOTE-3** comment added at the Sparrow call site (credential SMS bypasses `SmsService`
  to avoid persisting the password to `sms_logs`).

---

## Phase 5 — Web admin clients

### REG-OBS-5 — register-school must not accept a chosen password — **RESOLVED (2026-07-14)**

> **RULING:** `register-school` no longer accepts a `password`. The `SCHOOL_OWNER` receives a
> **generated** temp password with `must_change_password = true` and **ledger delivery**,
> identical to every other REG-1 account (no more chosen-password special case). This closes the
> gap where the owner was the one REG-1 account NOT delivered via the ledger.

**Change (API + DTO):** `CreateSchoolDto.password` removed. `AuthService.register` generates the
temp password (`generateTemporaryPassword`) and calls `provision({ ..., mustChangePassword: true })`,
so the Phase-4 owner enqueue fires (owner creds delivered on the new tenant's own ledger). The
register-school response surfaces `mustChangePassword: true` so the web form redirects to
change-password. `register-school` still auto-issues a session (the flag gates it); the owner
completes the forced change with the emailed temp password.

**Phase-6 live-proof plan (owner path, deferred here per the Phase-4 note):** provision a
**throwaway tenant via live HTTP** `POST /auth/register-school` (no password) → `SELECT` the
`SCHOOL_OWNER` user (`must_change_password = t`, phone E.164) + `credential_deliveries` ledger
rows in the **new** tenant schema → drain the poller → SENT/SENT_DRY + secret deleted → then
`DROP SCHEMA tenant_<slug> CASCADE` teardown, recorded here with `psql` proof. (Not done now —
register-school does a full CREATE SCHEMA + DDL; the throwaway tenant + teardown belongs in the
Phase-6 security/regression sweep.)
