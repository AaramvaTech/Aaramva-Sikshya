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

### REG-OBS-2 (Phase 1) — Platform-side migrations: is `PlatformAdmin` in REG-1 scope? — **OPEN QUESTION for Srijan**

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

### REG-OBS-3 (Phase 3 forward-conflict, flagged now) — spec assumes BullMQ, but BullMQ was removed (OPS-1)

Spec §3/§4 specify a `credential-delivery` **BullMQ** queue with `removeOnComplete`/
`removeOnFail` and exponential backoff. **BullMQ was fully removed in OPS-1** (zero
`bullmq`/`Queue`/`Processor` in the codebase; the only scheduler is `@nestjs/schedule`,
Redis is disabled-by-design in dev). Phase 3 cannot use BullMQ as written. **Resolve
before Phase 3:** reinstate a queue (Redis/BullMQ back on) vs. a `@nestjs/schedule`-driven
outbox worker over the `credential_deliveries` ledger (append-only PENDING rows are
already an outbox — a poller can drain them without a broker). No Phase-1 impact.

### REG-OBS-4 (Phase 1) — Guardian/student write-path E.164 storage deferred; existing guardian phones not E.164

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

### REG-NOTE (Phase 1) — Registration-contract tightening (consumer impact)

Making staff `phone` mandatory, guardian `email` mandatory, and requiring **exactly one
primary guardian** on `POST /students` is a deliberate contract change (§2). Existing
web/mobile registration forms must send these fields or they will 400. Wiring those
clients is out of Phase-1 scope (data model & validation only); flagged so the endpoint/
client phases update the forms.

---

_No functional bugs found in Phase 1._
