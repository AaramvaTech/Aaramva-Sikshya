# Credential Provisioning Emails — Design

**Date:** 2026-06-20
**Status:** Approved (design), pending implementation plan
**Author:** Session — credential emails

## Problem

When a school admin creates or updates a login account (student, staff, parent) or
when the platform super-admin onboards a new school, there is no way to deliver the
login credentials to the account holder. Admins currently type a password by hand and
must relay it out-of-band. We want the system to email the **login email + password +
school code** to the account holder automatically on create, and provide an admin CRUD
surface to update the login email and reset the password (which re-sends).

## Constraints / context

- Passwords are stored as `bcrypt` hashes. **Plaintext is only available at the moment it
  is set** (create or reset). We can never retrieve and re-email an existing password.
- No email infrastructure exists today. Only SMS (Sparrow SMS) and in-app notifications.
- Redis/BullMQ is not running in dev (per CLAUDE.md), so v1 must not depend on a queue.
- Multi-tenant: student/staff/parent live in tenant schemas; school onboarding happens in
  the public schema (super-admin, `tenantId = null`).
- School code = tenant `slug`.

## Decisions (from brainstorming)

1. **Auto-generate passwords.** The system generates a strong temporary password on
   create/reset, stores only the hash, and emails the plaintext once. Admins never type
   passwords. (Email address is still admin-supplied — students/guardians may not have one
   on file.)
2. **Transport: nodemailer over SMTP**, configured by env. Any provider works without code
   changes. A dev **mock transport** logs instead of sending when SMTP is unconfigured.
3. **Scope: all four flows** — students, staff/teachers, parents/guardians, school owner.
4. **Best-effort delivery + `email_log` table.** Account create/update/reset always
   succeeds even if the email fails. Every attempt is recorded (`PENDING → SENT/FAILED/MOCK`).
5. **"Force change password on first login" enforcement is OUT OF SCOPE for v1** — advisory
   text only in the email.

## Architecture

New module: `apps/api/src/modules/mail/`

- **`MailService`** — transport wrapper over `nodemailer`.
  - Reads SMTP config from env. If `SMTP_HOST` is absent, uses a **mock transport** that
    logs the message and records status `MOCK` (mirrors SMS `PENDING → MOCK`).
  - Single method: `send({ to, subject, html, text, type, tenantId?, relatedUserId? })`.
  - **Always writes an `email_log` row** and **never throws to the caller** (best-effort).
    Returns `{ status, logId }`.
- **`CredentialMailer`** — composes credential + email-changed messages (one place so all
  flows are identical). Methods:
  - `sendNewCredentials({ to, schoolName, slug, loginEmail, password, relatedUserId, tenantId })`
  - `sendPasswordReset(...)` — same body, "password was reset" framing.
  - `sendLoginEmailChanged({ to, schoolName, slug, newLoginEmail, ... })` — no password.
- **`password.util.ts`** — `generateTemporaryPassword()`: 12 chars, mixed character classes,
  ambiguous chars (`0/O/1/l/I`) excluded.

`MailModule` exports `MailService` + `CredentialMailer`. Imported by `StudentModule`,
`HrModule`, `StudentModule` (guardian), and `SuperAdminModule`.

## Data model

New table **`email_log`** in the **public schema** (nullable `tenant_id`, like
`platform_audit_logs`), written via `PublicPrismaService`:

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid null | null for school-onboarding emails |
| `recipient_email` | text | |
| `email_type` | text | `CREDENTIALS_NEW`, `CREDENTIALS_RESET`, `LOGIN_EMAIL_CHANGED` |
| `subject` | text | |
| `status` | text | `PENDING` / `SENT` / `FAILED` / `MOCK` |
| `provider_message_id` | text null | nodemailer messageId |
| `error` | text null | failure reason |
| `related_user_id` | uuid null | the `users.id` the email is about |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | |

**No plaintext passwords and no full message bodies are stored** — metadata only.

Migration: `apps/api/prisma/migrations/<ts>_add_email_log/migration.sql` + Prisma schema model.

## Endpoints & flows

School code = tenant slug. Auto-generate password everywhere.

### Students (`student.service.ts` / `student.controller.ts`)
- `POST /students/:id/account` — **changed**: `password` optional; omitted → auto-generate.
  On success → `CredentialMailer.sendNewCredentials` to the supplied email.
- `PATCH /students/:id/account` — **new** (CRUD update of login email). Validates email
  uniqueness, updates `users.email`, sends `sendLoginEmailChanged` to the new address.
- `POST /students/:id/account/reset-password` — **new**: generate + hash + store + email.
  This is the "resend credentials" action.

### Staff (`hr/staff.service.ts`)
- Staff create — **changed**: `password` optional → auto-generate → `sendNewCredentials`.
- `PATCH /hr/staff/:id/account` — **new**: update login email + `sendLoginEmailChanged`.
- `POST /hr/staff/:id/account/reset-password` — **new**: reset + email.

### Parents / Guardians (`student/guardian.service.ts`)
- `POST /students/:sid/guardians/:gid/account` — **changed**: optional password →
  auto-generate → `sendNewCredentials` to guardian email.
- `POST /students/:sid/guardians/:gid/account/reset-password` — **new**.

### School owner (`super-admin/tenant-provisioning.service.ts`)
- Onboarding — **changed**: `adminPassword` optional → auto-generate → `sendNewCredentials`
  to the owner with the **new school code**.
- `POST /super-admin/tenants/:id/resend-owner-credentials` — **new**: reset owner password
  + email.

All new/changed write routes keep existing `@Roles(...)` guards (school-admin roles for
tenant flows; platform admin for onboarding).

### Resend semantics
Because plaintext passwords are never stored, a credential email cannot be replayed
verbatim. The reset-password endpoints (and `resend-owner-credentials`) **regenerate** a
password and re-send — these ARE the resend mechanism. `email_log` is observability only;
there is no generic "replay this exact email" endpoint in v1.

## Email content

One template, HTML + plaintext fallback:
- Greeting + school name.
- **School code:** `<slug>` (entered in the mobile app).
- **Login email:** `<email>`.
- **Temporary password:** `<generated>` (omitted in `LOGIN_EMAIL_CHANGED`).
- How to log in: web portal `https://<slug>.<APP_DOMAIN>` **and** mobile ("open the app →
  enter school code → log in").
- Advisory to change the password after first login.

## Configuration (env)

```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
MAIL_FROM=no-reply@aaramvashikshya.com
MAIL_FROM_NAME=Aaramva Shikshya
```
Missing `SMTP_HOST` → mock transport (logs + `MOCK` status). Dev works with zero config.

## Error handling

- Best-effort: a thrown/failed send never rolls back the account operation; it is recorded
  as `FAILED` in `email_log` and logged via Nest `Logger`.
- Email uniqueness conflicts on create/update return `409` as today.
- Password generation is local and deterministic in test via a seam (see Testing).

## Testing

- `password.util` — length, character-class coverage, excluded ambiguous chars, uniqueness
  across many calls.
- `CredentialMailer` — rendered content contains slug, login email, and password (and that
  `LOGIN_EMAIL_CHANGED` omits the password).
- `MailService` — writes an `email_log` row; returns `MOCK` with no SMTP config; swallows a
  transport error and records `FAILED` without throwing.
- Each modified service path — auto-generates when password omitted; triggers the mailer;
  the account survives a mailer that throws (best-effort).
- Gate: `cd apps/api && npx tsc --noEmit` exits 0 and `npm test` green.

## Out of scope (v1)

- Force-change-password-on-first-login enforcement (advisory text only).
- BullMQ queue / retry with backoff (best-effort only; revisit when Redis is up).
- Generic "replay exact email" endpoint (reset endpoints cover resend).
- Email for the existing parent-account in-app notification flows (unchanged).
