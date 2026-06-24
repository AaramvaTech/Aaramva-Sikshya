# SESSION-OB1 — Onboarding Wizard, Part 1: Academic Setup

**Type:** Web (admin portal) + light backend. First chunk of the guided school-setup wizard that turns a new tenant from "empty shell + ~8 manual steps" into a guided flow. **Sales-led:** the platform team creates the tenant + owner login; the school's admin completes setup in the wizard. **This chunk = the academic-structure steps:** academic year → classes → sections → subjects.

**Source of truth:** `docs/audits/FEATURE-COVERAGE-2026-06-23.md` (onboarding gap); `AARAMVA-commercial-v1-roadmap.md` (Tier 1, onboarding = the long pole).

**Stack:** Next.js 14 admin portal; NestJS; schema-per-tenant.

---

## Hard rules

1. **Step 0 read-and-report before editing.**
2. **Reuse existing CRUD** for year/classes/sections/subjects — the wizard *orchestrates* existing capability into a guided sequence; it does not rebuild it. If a needed CRUD piece is missing, **flag it**, don't quietly build a parallel one.
3. **No self-signup.** The wizard assumes an already-provisioned tenant + owner login.
4. **Resumable** — the owner can leave mid-setup and return to where they left off, with prior data intact.
5. **Enforce step dependencies** — academic year before classes; classes before sections and subjects.
6. **Live-prove on a FRESH tenant** (not the drifted demo) — create a new one, walk the wizard, read each step back from Postgres.

---

## Step 0 — Read and report (no edits)

- **How a tenant + owner login is created today** (the platform/super-admin provisioning flow). Confirm the wizard's starting point — a new owner logging into an empty school. If tenant+owner creation isn't a clean flow, flag it (it's a prerequisite that may need its own session).
- **Existing CRUD** (endpoints + admin pages) for: academic year, classes/grades, sections, subjects. The wizard reuses these.
- **Setup state:** is there any onboarding/progress state, or should progress be **computed from data presence** (e.g. setup-incomplete until there's a current year + ≥1 class + sections + subjects)? Recommend the minimal approach (derived where possible + a small "onboarding complete/dismissed" flag).
- Where the wizard lives in the web IA, and how a not-yet-set-up owner is **routed into it** on login.

Report this + the proposed wizard structure, then proceed.

---

## Task 1 — Wizard shell + routing

- A guided multi-step wizard in the admin portal showing all setup steps — **1 Academic year · 2 Classes · 3 Sections · 4 Subjects** now, with **Students · Staff · Branding** shown as upcoming (built in OB2/OB3) — with clear progress and resume.
- On owner login, if setup is incomplete, **route into the wizard**; exit is allowed but the entry stays obvious until setup is complete.

## Task 2 — Steps 1–4 (reusing existing CRUD)

- **Step 1 — Academic year:** create the current year (BS-aware, marked `is_current`). Everything hangs off this — it's first for a reason.
- **Step 2 — Classes/grades:** create the school's grades.
- **Step 3 — Sections:** per class, create sections.
- **Step 4 — Subjects:** assign subjects per class/grade.
- Each step uses the existing CRUD, validates its dependency is met, and can't advance until it has the minimum (e.g. ≥1 class before sections). Clean empty → filled flow. Progress persists for resume.

---

## Not in scope

- No student/guardian import (OB2); no staff/branding (OB3).
- No self-signup; no tenant-creation UI (platform/super-admin owns that).
- Don't rebuild existing CRUD — orchestrate it.

---

## Verification

- `tsc --noEmit` (web + api) clean.
- **Fresh-tenant walk-through (raw):** create a NEW test tenant + owner (via the existing platform flow; if none exists, note it and create via seed/SQL for the proof). Log in as the owner → routed into the wizard → complete steps 1–4. `SELECT` read-backs confirm the year, classes, sections, and subjects persisted **in the new tenant's schema**. Paste them.
- **Resume (raw):** leave mid-wizard, log back in → returns to the right step with prior data intact.
- **Dependency gates:** sections can't be created before a class, etc. — confirm.
- Verdict: wired / blocked.
