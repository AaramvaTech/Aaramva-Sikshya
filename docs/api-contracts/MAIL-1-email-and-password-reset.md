# MAIL-1 — Email Service, Credential Delivery, Password Reset

**Save location:** `docs/api-contracts/MAIL-1-email-and-password-reset.md`
**Scope:** apps/api + apps/web (reset/change-password UI). Kills three audit items at once: no email service (P1-15), no password reset anywhere, and the change-password gap OPS-1 exposed (no UI even for super-admin).
**Baseline:** 312 tests, all-green on main.

---

## Phase 1 — Inspect `feat/credential-emails` (read-only, STOP after reporting)

13 commits of prior email/credential work exist on that branch, written BEFORE SEC-1 (Joi env validation, throttler), MIG-2/3 (guardians normalized), and OPS-1 (logging/health). Before any plan:

1. `git log main..feat/credential-emails --oneline --stat` — the commit list.
2. Per commit-group, summarize: what it builds (MailService/MailModule, email_log table, temp-password generator, credential endpoints per the earlier triage), how mail transport is configured, whether env vars bypass the Joi schema, whether anything touches `students.guardians` JSONB (now dropped), how `email_log` was created (raw SQL? — there was no migration runner then; any table creation must become a numbered tenant migration or public-schema Prisma migration, whichever scope it belongs to), and test coverage.
3. Rebase feasibility: `git rebase --onto main` dry assessment — count conflicts, name the risky files.
4. **Recommend one of:** (a) rebase + adapt, (b) cherry-pick selectively, (c) treat as reference and re-implement on main. Justify against the findings. **STOP for my decision.**

## Phase 2 — Build (tasks below assume the decision; adapt mechanically to it)

### T1 — Mail infrastructure
- Nodemailer-based MailService: SMTP config via env (`SMTP_HOST/PORT/USER/PASS/FROM`), **optional** in the Joi schema — absent config = mail disabled with a one-line boot notice (OPS-1 pattern) and every send attempt logged as skipped, never a crash.
- Dev proof mechanism: Ethereal (nodemailer's test account) — sends return a preview URL, giving live-proof-grade evidence without a real mailbox.
- `email_log` table (to, template, tenant, status, error, sent_at): decide public-schema vs per-tenant based on where the branch put it and where it belongs (emails are tenant-scoped events → likely tenant schema → **numbered migration through the runner, canary-first**).
- Send path is fire-and-forget from request handlers (event listener pattern like SMS) — a slow SMTP server must never block an HTTP response.

### T2 — Credential delivery
- On account provisioning (student/guardian/staff), if the person has an email: send credentials (username + temp password + login URL). Resend endpoint, role-guarded, throttled.
- Template baseline: plain, professional, school-branded name; English now, `NpText`/i18n later (out of scope).

### T3 — Password reset (school users, web)
- `POST /auth/forgot-password` (public, **throttled 3/hour per IP** — SEC-1 discipline): accepts email + tenant slug; ALWAYS returns generic 200 (no account-existence oracle); if the account exists and has email, sends a reset link.
- Reset tokens: random 32+ bytes, **stored hashed** (SHA-256, same discipline as refresh tokens), 30-min expiry, single-use, invalidated on password change.
- `POST /auth/reset-password`: token + new password (validated ≥8 chars via the existing DTO conventions); on success invalidate all refresh tokens for the user (force re-login everywhere).
- Web: wire the dead "Forgot password?" link → request page → email → `/reset-password?token=…` page. Both pages tenant-aware.

### T4 — Change-password (authenticated, all portals)
- `POST /auth/change-password` (current + new password, verifies current, invalidates other sessions' refresh tokens).
- Web UI: settings/profile page in BOTH the school shell and the super-admin shell (closing OPS-1's gap — the next password rotation is a form, not a script).

### T5 — Tests + docs
- Unit tests: token hashing/expiry/single-use, oracle-free forgot-password, mail-disabled path. Suite ≥312.
- CLAUDE.md dev-notes + remove the change-password backlog entry.

## Verification — raw output
1. Ethereal live proofs: credential email on a test provisioning (paste preview URL + rendered text), reset email, each `email_log` row read back. Clean up test accounts with read-backs.
2. Full reset round-trip live: forgot → email link → reset → old password 401 / new password 200 → old refresh token rejected. Raw HTTP for each step.
3. Throttle proof: 4th forgot-password in an hour → 429.
4. Oracle proof: forgot-password with a nonexistent email → identical 200 body, no email sent, log shows skipped.
5. Change-password round-trip on both a school user and the super-admin via the new UI (screenshotless DOM/HTTP proof fine).
6. If a new tenant-schema table shipped: runner `--status` showing the new migration canary-first then all tenants.
7. Suite ≥312 locally, push, all-green run link.

## Out of scope
- Invoice/notice email sending (later Phase A), mobile in-app reset flow, Nepali templates, real SMTP provider selection (deployment-time).
