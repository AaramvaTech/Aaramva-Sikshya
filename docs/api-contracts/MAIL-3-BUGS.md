# MAIL-3 — Bug & Findings Log

Findings for MAIL-3 (Tenant-Aware Sender Identity & Per-Recipient Credential Templates).
Same convention as `MAIL-2-BUGS.md` / `REG-1-BUGS.md`: real bugs get a full row; design/spec
conflicts and deferrals are recorded as `MAIL-3-OBS-*` and surfaced at the owning checkpoint.
Proof standards per spec §5.

Branched off `main` at **`18055e9`** (MAIL-2 #16 + #17 + #18 merged).

---

## Phase 1 — §3 discovery report (REQUIRED BEFORE ANY MIGRATION)

### MAIL-3-OBS-1 — school name + office email BOTH already exist on `public.tenants` → NO `official_email` column, NO new web field

Inspected the school/tenant profile shape (spec §3 "discovery first"):

- **School name**: `public.tenants.name` (Prisma `Tenant.name`) — exists. Reuse verbatim.
- **Office/official email**: **`public.tenants.email`** (Prisma `Tenant.email String?`, nullable) —
  **already exists**, sitting in the school profile beside `phone`, `website`, `address`,
  `principalName`, etc. It is:
  - **Read/written by the school-admin endpoint** `GET/PATCH /settings/profile`
    (`modules/settings/`): `PROFILE_SELECT` includes `email`; `UpdateProfileDto` has
    `@IsEmail() @IsOptional() email?` (field-level 400 on a bad email already enforced by the API).
  - **Already editable in the web settings form** (`app/(school)/settings/page.tsx` — a
    `FieldText label="Email" type="email"` with placeholder `info@school.edu.np`, school-admin editable).

**Rulings (per §3 "Only add a new column if none exists"):**
1. **Reuse `tenants.email` as the MAIL-3 Reply-To / official school email. Do NOT add an
   `official_email` column** (0015 is `template_type` only; no new public-schema column).
2. **Do NOT add a new web settings field** — it already exists. The **only** web gap vs §3 is
   **error rendering**: the settings form's submit currently does a generic
   `catch { toast.error('Failed to update profile') }` — not field-level. Phase 1 wires
   `extractApiErrors` there so the server's `@IsEmail` 400 renders per REG-1 Phase 5 convention.
3. **Sender resolver reads `SELECT name, email FROM tenants WHERE slug = $1`** (public schema,
   via the existing `schoolContext()` in CredentialDeliveryService, extended to also select
   `email`). `email` NULL → omit Reply-To (never platform), template still shows the school name.

### MAIL-3-OBS-2 — enqueue/resend path map + the split resend paths (scoping decision for Phase 1)

`template_type` lives on the **ledger** (`credential_deliveries`) and is rendered by the **poller**.
Mapped every path that produces a credential delivery:

**Ledger enqueue sites (`credentialDelivery.enqueueInTx`) — Phase 1 sets `template_type` per target:**

| Site | Flow | template_type |
|---|---|---|
| `tenant-provisioning.service.ts` | register-school owner | `NEW_SCHOOL_OWNER` |
| `hr/staff.service.ts` (createStaff) | staff registration | `STAFF` |
| `student/guardian.service.ts` (createGuardianAccount) | guardian's own account | `GUARDIAN_SELF` |
| `student/student.service.ts` (createStudentAccount) | student fan-out | `STUDENT_SELF` (own targets) + `STUDENT_VIA_GUARDIAN` (guardian targets, `recipientUserId` set) |
| `credential-delivery.service.ts` (resendForUser, `POST /users/:id/resend-credentials`) | generic resend | **re-derived** from `users.role` (+ `recipient_user_id`) |

**Legacy MAIL-event resends (currently DO NOT use the ledger — emit `MAIL_EVENTS.credentialsIssued`
`kind:'reset'` → `CredentialMailer`, so they carry no `template_type` and no tenant sender identity):**
`student.resendStudentCredentials` (`POST /students/:id/account/resend`),
`guardian.resendGuardianCredentials`, `staff.resendStaffCredentials` (`POST /hr/staff/:id/resend-credentials`).

**Ruling (Phase 1):** spec §2 requires "resend re-derives the same type", so these three resends are
**routed through the ledger** (regenerate temp password + revoke sessions + `enqueueInTx` with the
re-derived `template_type`), replacing their legacy MAIL-event emit — unifying resend on the ledger
with `resendForUser`. Their unit tests are updated from "emits MAIL event" to "enqueues with
template_type". The legacy `CredentialMailer`/MAIL-event path remains only as the **no-key fallback**
and for **password-reset-link / login-email-changed** (out of MAIL-3 credential scope).

### MAIL-3-OBS-3 — backfill derivation for existing `credential_deliveries` rows (0015)

`template_type` is `NOT NULL` with a 5-value CHECK and **no default** (new enqueues must set it).
Existing rows are backfilled by derivation joining `users` (the row's `user_id` FK; users are
soft-deleted, never hard-deleted, so the join holds):

```
SCHOOL_OWNER                                   → NEW_SCHOOL_OWNER
STUDENT + recipient_user_id IS NOT NULL        → STUDENT_VIA_GUARDIAN
STUDENT + recipient_user_id IS NULL            → STUDENT_SELF
PARENT                                         → GUARDIAN_SELF
everything else (TEACHER/PRINCIPAL/… staff)    → STAFF
```

Add column nullable → backfill → `SET NOT NULL` → add CHECK, all in 0015 (idempotent guards).

### Sender identity model (as it will be built)

- **Tenant-scoped** (STAFF / GUARDIAN_SELF / STUDENT_SELF / STUDENT_VIA_GUARDIAN):
  `From: "{tenants.name} (via Aaramva Shikshya)" <MAIL_FROM_ADDRESS>`, `Reply-To: {tenants.email}`
  (omitted when null). Template header = school name; footer = "powered by Aaramva Shikshya (आरामवा शिक्षा)".
- **Platform-scoped** (NEW_SCHOOL_OWNER): `From: "Aaramva Shikshya" <MAIL_FROM_ADDRESS>`, no Reply-To.
- `MailService.send` gains optional `fromName` + `replyTo`; the poller resolves them per row via the
  `template_type` + `schoolContext()`. Redaction invariant unchanged (temp password in-memory only).

---

## Phase 1 — Implementation log

### Files changed

New:
- `apps/api/migrations/tenant/0015_credential_delivery_template_type.sql` (LF, sha256 `8b0dc247…`).
- `apps/api/src/modules/credential-delivery/credential-template.util.ts` (+ spec, 7 tests) — the 5
  email templates + 5 SMS bodies, `deriveTemplateType`, `resolveSenderIdentity`.

Modified (API):
- `credential-delivery.service.ts` — `DeliveryTarget.templateType` (enqueue MUST set it), ledger
  INSERT + poller SELECT carry `template_type`, `schoolContext()` now reads `tenants.email`
  (officialEmail), `deliverEmail`/`deliverSms` render via the util + resolve sender identity
  (`fromName`/`replyTo`), `resendForUser` re-derives the type. Old inline MAIL-2 templates removed.
- `mail.service.ts` — `SendMailInput.fromName` + `replyTo`; `deliver()` applies them (tenant From
  display name + Reply-To).
- Enqueue sites set `template_type`: `hr/staff.service` (STAFF), `student/guardian.service`
  (GUARDIAN_SELF), `student/student.service` (STUDENT_SELF own + STUDENT_VIA_GUARDIAN guardian),
  `super-admin/tenant-provisioning.service` (NEW_SCHOOL_OWNER).
- **Resend unified on the ledger (OBS-2 ruling):** `resendStaffCredentials` / `resendStudentCredentials`
  / `resendGuardianCredentials` now delegate to `resendForUser` (regenerate + revoke + enqueue with the
  re-derived type), replacing their legacy MAIL-event emit. Return shape → `{ userId, deliveryIds }`.

Modified (web):
- `app/(school)/settings/page.tsx` — the existing Email field's submit now surfaces the server's
  field-level 400 via `extractApiErrors` (MAIL-3-OBS-1: the field itself already existed).
- `lib/api/students.api.ts` — resend response types updated to `{ userId, deliveryIds }`.

### Migration 0015 — applied canary → all (LIVE)

`template_type TEXT NOT NULL` + CHECK on the five values, **no default**; backfill by derivation.
LF-verified checksum `8b0dc247…`.
- Canary (`--tenant demo`): applied ms=72. Read-back: column `NOT NULL`, no default, CHECK present;
  backfill of demo's existing rows = 8 STAFF + 3 STUDENT_SELF (historical guardian-target rows had
  `recipient_user_id` NULL — no parent account existed — so correctly derive STUDENT_SELF).
- All tenants (`migrate:tenants`): 5 more applied (stacey-mejia, kaye-nashh, motherland-school,
  raja-mcintyres, jorden-donovan) + demo already had it → 6 tenants total.
- Read-back: **6 schemas** with `template_type NOT NULL`; ledger **6 rows, 1 distinct checksum** (`8b0dc247…`).

### Verification (Checkpoint 1)

| Check | Result |
|---|---|
| Test floors (main `18055e9`) | API **612** / web vitest **15** / mobile jest **112** — held. |
| API tests | **621 passed / 79 suites** (+9: template-util 7, credential-delivery +2 net). ≥ 612 ✅ |
| web | tsc clean; vitest **15** (floor held). ✅ |
| mobile | **untouched** (no `apps/mobile` diff) → **112** holds. ✅ |
| API typecheck | `tsc -p tsconfig.build.json` → exit 0. ✅ |
| Redaction re-run | `staff.service.spec` `'REG-1 §3: never writes the generated temp password to any log output'` → **PASS** (util renders the temp password only into the body handed to `mail.send`; never logged). ✅ |
| Identity resolver unit proofs | NEW_SCHOOL_OWNER → plain platform From, no Reply-To; tenant types → "{School} (via Aaramva Shikshya)" + Reply-To when `officialEmail` set; null email → **no Reply-To (never platform)**. ✅ |
| Per-type render proofs (live poller path via spec) | STAFF subject/footer/role; STUDENT_VIA_GUARDIAN names student + "for your child"; officialEmail → Reply-To; NEW_SCHOOL_OWNER platform identity. ✅ |
| SMS ≤160 ASCII | all 5 types ≤160 printable-ASCII at max-length realistic fixtures; Devanagari names ASCII-stripped and still ≤160. ✅ |

### Deferred to Phase 2 (needs Srijan)

One live send per template type to Srijan's real inbox (register-school throwaway for NEW_SCHOOL_OWNER
with DROP SCHEMA teardown; staff; guardian; student both routed + self) — ledger `template_type`
read-backs + **human confirmation of From display name, Reply-To (hit reply → school official email),
and body**. Push + PR then. **Checkpoint 2 — Srijan's inbox confirmation is the acceptance bar.**

**⏹ STOP — Checkpoint 1.** Phase 1 code complete, migration applied + read-back on all 6 tenants,
floors held, redaction re-run green. Committed (not pushed). Awaiting review before Phase 2.
