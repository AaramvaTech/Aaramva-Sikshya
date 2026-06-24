# SESSION-OB2 — Onboarding Wizard, Part 2: Student + Guardian Import

**Type:** Web + backend. The heavy onboarding chunk — bulk-import students and their guardians from a CSV so a school isn't typing hundreds of students by hand. Wizard **step 5**, also usable standalone (schools add students each year).

**Source of truth:** OB1 (wizard shell; Students step locked for this session); R1 (guardian provisioning `POST /students/:id/guardians` — reuse so imported parents get accounts + welcome SMS); `docs/audits/FEATURE-COVERAGE-2026-06-23.md` (onboarding/import gap).

**Stack:** Next.js 14 admin portal; NestJS; schema-per-tenant.

---

## Hard rules

1. **Step 0 read-and-report before editing.**
2. **Reuse the existing admission path (`admitStudent`) and the R1 guardian-provisioning path** — no parallel student/guardian creation logic.
3. **Validate before committing.** Per-row validation with a **preview** and clear per-row errors. A real school's CSV is messy — surface exactly what's wrong; never half-import silently.
4. **BS dates:** date of birth is likely entered in BS; convert/store AD per the existing convention. Verify a known date round-trips correctly.
5. **Dedupe / re-import safe.** Re-uploading the same file must not duplicate (dedupe on admission no. or equivalent). Idempotent.
6. **Live-prove with a real CSV** (including a couple of deliberately-bad rows) on a fresh tenant; read students + provisioned guardians back from Postgres.

---

## Step 0 — Read and report (no edits)

- The `admitStudent` contract: required fields, how **class/section/year are referenced** (id vs name), how DOB / BS is handled, how the **admission number** is generated (auto vs supplied).
- The R1 guardian-provisioning contract (so import provisions parents the same way — relational guardian + parent account + linkage + SMS).
- Whether any bulk/import path already exists.
- Propose the **CSV column schema** and confirm it against the real `admitStudent` fields (likely: admission no. [optional/auto], student name, DOB-BS, gender, grade, section, roll, guardian name, guardian phone, relation).

Report this + the proposed template and flow, then proceed.

---

## Task 1 — Upload · parse · validate · preview (the careful half)

- CSV upload in the wizard's Students step, plus a **downloadable template** matching the schema.
- Parse + **per-row validation:** required fields present; grade/section exist (created in OB1) and resolve; valid DOB; duplicate admission no. (against the file and against existing students).
- A **preview table:** valid rows that will import, and invalid rows each with the *specific* error — shown **before anything is written**. Nothing persists at this stage.
- **Resumable:** this is the risky half. If context runs long, stop here with parse/validate/preview proven; commit in Task 2.

## Task 2 — Commit + guardian provisioning

- On confirm: create the valid students via the existing admission path, and provision each guardian via the **R1 path** (parents get accounts + welcome SMS), in sane batches / a sensible transaction boundary.
- Skip invalid rows and report them; dedupe so a re-import doesn't duplicate.
- **Result summary:** created X, skipped Y (with reasons per skipped row).

---

## Not in scope

- No staff/branding (OB3). No change to OB1's steps.
- No new student/guardian creation logic — reuse admission + R1.
- Don't attempt the migration-history reconciliation here (separate session) — if a migration is needed, follow OB1's approach and flag it.

---

## Verification

- `tsc --noEmit` (web + api) clean.
- **Fresh-tenant import (raw):** on a tenant with OB1 done (year/classes/sections/subjects), upload a CSV of N students including **2 deliberately-bad rows** → preview shows valid vs the specific errors; commit → `SELECT` confirms the valid students + their **relational guardians + parent logins** exist in the tenant schema; bad rows skipped with reasons. Paste.
- **Re-import the same file → no duplicates** (idempotent). Paste counts before/after.
- **BS DOB:** confirm a known BS date stored as the correct AD.
- **Guardian usability (end-to-end):** one imported parent logs in (mobile path) and sees their child. Paste.
- Verdict: wired / blocked.
