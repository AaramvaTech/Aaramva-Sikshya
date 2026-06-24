# SESSION-OB3 — Onboarding Wizard, Part 3: Staff + Branding + Finish

**Type:** Web + light backend. The final onboarding chunk — staff setup, school branding, and the "setup complete" finish. After this, a school can be fully stood up without touching the database.

**Source of truth:** OB1 (wizard shell, `onboardingCompletedAt` flag + `/onboarding/status` + `/onboarding/complete`, steps 6/7 locked); OB2 (import pattern, temp-password surfacing for new logins); the existing per-tenant theming engine (logo → node-vibrant → theme colors).

**Stack:** Next.js 14 admin portal; NestJS; schema-per-tenant.

---

## Hard rules

1. **Step 0 read-and-report before editing.**
2. **Reuse existing paths** — staff creation (HR module) and the branding/theming pipeline. The wizard orchestrates; no parallel logic.
3. **Staff logins:** same reality as OB2 — provisioning sends no SMS yet, so **surface temp passwords** in the result for the school to distribute (the welcome-SMS pass is a separate session).
4. **Branding storage caveat:** logo is base64-in-DB for now (object storage is deferred/Tier 1) — store as the existing pipeline does; don't add object storage here.
5. **Live-prove on a fresh tenant** walked through OB1 → OB2 → OB3, with Postgres read-backs and the completion flag.

---

## Step 0 — Read and report (no edits)

- The existing **staff-creation** path: required fields, the role set (teacher / coordinator / accountant / principal / librarian), and how the login + temp password are created.
- The **branding/theming** pipeline: how a logo is uploaded, how node-vibrant derives the theme color, where logo + colors are stored, and how the apps consume them.
- Whether `/onboarding/status` already accounts for staff/branding presence or needs extending; what the sensible **completion gate** is (academic setup required; students/staff/branding recommended — confirm).
- Where steps 6 (Staff) and 7 (Branding) and the Finish live in the wizard.

Report this + the plan, then proceed.

---

## Task 1 — Staff step (reuse existing staff creation)

- In the wizard's Staff step, add staff via the existing creation path — name, role, contact, the role-appropriate login. Show the created staff list with their **temp passwords** (copyable), as OB2 does for parents.
- Individual add is enough for now (staff are dozens, not hundreds). If a school wants bulk later, note that the OB2 CSV pattern can be reused — but don't build it here.

## Task 2 — Branding step (reuse the theming pipeline)

- School logo upload → run it through the existing node-vibrant derivation → preview the derived theme color, allow a manual override, and confirm the school display name.
- Persist via the existing branding store so the student/parent/teacher apps pick up the school's identity (the per-tenant theming engine already consumes this).
- Branding is **skippable** (can be done later) — don't block finishing on it.

## Task 3 — Finish

- A final review/confirm step; on finish, set `onboardingCompletedAt` (the OB1 flag) so the login redirect and the "Setup" sidebar entry disappear, and route to the dashboard.
- Gate: allow finishing once the **academic setup (OB1) is complete**; students/staff/branding are recommended but the owner can finish and return to add more.

---

## Not in scope

- No welcome-SMS (separate session); surface temp passwords instead.
- No object storage (logo base64 as-is).
- No migration-history reconciliation.
- No change to OB1/OB2 steps beyond unlocking 6/7 and wiring the finish.

---

## Verification

- `tsc --noEmit` (web + api) clean.
- **Full fresh-tenant walk (raw):** provision a new tenant → owner logs in → wizard → OB1 (year/classes/sections/subjects) → OB2 (import a few students) → **OB3**: add ≥1 staff member (login + temp password shown), upload a logo (confirm a theme color derives), Finish. `SELECT` read-backs: staff + login exist; branding/logo + theme color stored; `onboardingCompletedAt` set on the tenant. Paste.
- **Completion behavior:** after finish, the owner is no longer forced into the wizard and the Setup entry is gone; re-login confirms.
- **Branding consumed:** confirm the derived theme/logo is what an app would load for that tenant (the existing theming endpoint returns it).
- Verdict: wired / blocked.
