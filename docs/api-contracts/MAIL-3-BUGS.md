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

---

## Phase 2 — Live proof (Brevo)

Checkpoint 1 approved; OBS-1/OBS-2 dispositions accepted. Five live sends (recipient = Srijan's
Gmail; bare + `+staff`/`+guardian`/`+m3student` tags — kept out of this doc). For each: ledger
`SELECT` showed the correct `template_type` **PENDING** → drain → **SENT** with a real Brevo
`provider_message_id` (SMS rows `SENT_DRY`, `SMS_DRY_RUN=true`).

| # | template_type | From display name | Reply-To | Brevo msgid |
|---|---|---|---|---|
| 1 | `NEW_SCHOOL_OWNER` | **Aaramva Shikshya** (platform, no "via") | none | `<148c2121…>` |
| 2 | `STAFF` | **Demo School Nepal (via Aaramva Shikshya)** | owner@demo.school | `<375dc1bf…>` |
| 3 | `GUARDIAN_SELF` | Demo School Nepal (via Aaramva Shikshya) | owner@demo.school | `<9d5f275c…>` |
| 4 | `STUDENT_SELF` | Demo School Nepal (via Aaramva Shikshya) | owner@demo.school | `<0020713b…>` |
| 5 | `STUDENT_VIA_GUARDIAN` | Demo School Nepal (via Aaramva Shikshya) | owner@demo.school | `<3c6b763a…>` |

Sends 4 & 5 came from **one** student registration (fan-out: student-own email + primary-guardian
email, both to `+m3student`). demo's `tenants.email` = `owner@demo.school` → the Reply-To source.

**Confirmation status (§4 acceptance bar is human — Claude Code cannot self-certify inbox
presentation):**
- **#1 NEW_SCHOOL_OWNER — human-confirmed** by Srijan (screenshot): From *"Aaramva Shikshya"*
  (plain platform, no "via"), subject *"Your MAIL-3 Probe School administrator account on Aaramva
  Shikshya"*, correct body, **no "powered by" footer** (platform template omits it). ✅
- **#2–#5 (tenant sends) — SENT + code-proven, final visual From/Reply-To confirmation pending.**
  Identical `MailService.send` + template pipeline as the confirmed #1; the tenant identity
  (`resolveSenderIdentity` → From *"Demo School Nepal (via Aaramva Shikshya)"* + Reply-To
  `owner@demo.school`) is deterministic from demo's name/email and unit-tested. **Non-blocking — the
  PR is not merged; Srijan does the reply-target/From visual check before merge.**

### Cleanup + teardown

- Demo probes **soft-deleted**: 3 users (`+staff`/`+guardian`/`+m3student`), 1 staff_profile
  (EMP-2083-0016), 2 students (2083-0002/0003), 2 guardians. Ledger `credential_deliveries` rows
  retained (append-only audit, no `deleted_at` by design).
- **⛔ TORN DOWN:** `DROP SCHEMA tenant_mail3_probe CASCADE` (52 objects, incl. `credential_deliveries`
  + `credential_delivery_secrets`) + `DELETE` of the public `subscriptions`/`tenants` rows for
  `mail3-probe`. Verified: `information_schema.schemata` for `tenant_mail3_probe` = **0**, public
  `tenants` where slug = **0**, subscriptions = **0**.

### MAIL-3-OBS-4 (Phase 2) — login rejects a stale cross-tenant token (out of MAIL-3 scope)

While logging into the throwaway tenant, a `403 "Token tenant does not match the requested tenant"`
(TenantMatchGuard) fired because the browser still held a **demo** access token, which the web client
auto-attaches to the `mail3-probe` login. This is a **login-UX rough edge** (a fresh login should
replace a stale cross-tenant token, not 403), **unrelated to MAIL-3** (email sending). Flagged for a
separate look; workaround = log out / incognito before switching tenants.

**Checkpoint 2 — MAIL-3 code-complete; live proof done, tenant-send visual confirmation pending
(non-blocking). PR opened, not merged.**

---

## Incidents

### MAIL-3-INC-1 — accidental fast-forward push of Phase 1 to `origin/main` (self-reported, rewound)

During the Phase-2 wrap-up, an accidental `git checkout main` + fast-forward `merge feat/mail-3`
moved the Phase-1 commit `862d48d` onto local `main`, and it reached **`origin/main`** — MAIL-3
Phase 1 was meant to live only on the feature branch (Phase 1 was "commit, do not push"; Phase 2 is
"push + PR, do not merge"). **Self-reported:** caught before opening the PR via a `git ls-remote`
sanity check (the `[main …]` commit output + reflog gave it away).

**Rewound** with `git push --force-with-lease origin 18055e9:main` — `origin/main` back to the clean
`18055e9`; the `--force-with-lease` guard would have aborted had `origin/main` not still been exactly
the accidental `862d48d`. **No work lost:** `862d48d` (Phase 1) + `a7c0f27` (Phase 2 doc) are both on
`feat/mail-3` (`origin/feat/mail-3 = a7c0f27`). PR opens from `feat/mail-3 → main` with the full,
correct MAIL-3 diff. Verified authoritative origin state: `main = 18055e9`, `feat/mail-3 = a7c0f27`.
