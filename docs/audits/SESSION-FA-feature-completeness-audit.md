# SESSION-FA — Product Feature-Completeness Audit (read-only)

**Type:** Read-only product audit. Produces a **coverage map** of what's wired end-to-end vs backend-only vs stubbed vs missing, across every module / surface / role. **No code changes.** Output becomes the source of truth for the build roadmap.

**Why:** "the endpoint exists" and "a school can use the feature" are different things — this whole integration arc proved that repeatedly. Before deciding what to build, we need a factual ledger of coverage, not assumptions.

---

## Hard rules

1. **READ-ONLY.** No edits, no fixes. Findings go in the report.
2. **Enumerate from the actual codebase**, not from a remembered module list.
3. **Distinguish "code present" from "proven working."** Use a status that separates the two (below). The three **mobile apps' read + write surfaces are already proven live** in prior sessions (PA / R1 / M3–M7.1) — treat those as ✅ and focus discovery effort on the **web** surfaces, **cross-stack wiring**, and **missing/half-built workflows**, which haven't been systematically checked.
4. This is a **map, not a live re-verification of everything** — code inspection is fine, with cheap live spot-checks only where coverage is genuinely unclear. The matrix flags confidence; it doesn't need to POST every endpoint.

---

## Step 0 — Inventory (report before assessing)

- Every **backend** module under `src/` and its endpoints.
- Every **web** route/page (the Next.js admin portal app tree).
- Every **mobile** screen per role group (`(student)` / `(parent)` / `(teacher)`).
- The full **role list** (student, parent, teacher, accountant, principal, school owner, platform admin — confirm).

Report the inventory, then build the matrix.

---

## Task 1 — Module coverage matrix

For each module, list its features. For each feature, mark presence + status across **Backend · Web · Mobile (student/parent/teacher)**:

- ✅ **end-to-end & proven** (works through the stack; proven live where prior sessions did so)
- 🟡 **present but unverified** (code exists across the stack but not proven working)
- 🟠 **partial** (backend-only with no UI, a UI stub with no data, or a workflow that starts but can't complete)
- ❌ **missing** for that surface/role

| Module | Feature | Backend | Web | Student | Parent | Teacher |

## Task 2 — Role capability map

Per role, two short lists: **what they can actually do today**, and **what's expected of this role but missing or partial**. (E.g. accountant: can they collect a payment, or only view invoices?)

## Task 3 — Half-built workflow hunt (the important one)

Explicitly find workflows that *start* but can't *complete*. For each: what exists, and what's missing to make it usable. Known suspects to confirm and look beyond:

- **Leave approval loop** — parent/teacher leave files as PENDING (M7.1); is there an approve/reject UI for the coordinator/admin, and a notify-back to the applicant?
- **Results last mile** — term results work; annual GPA/grade is stubbed (hardcoded null); is there report-card/marksheet **PDF generation** and a **publish** step?
- **Fee collection vs invoicing** — invoices/ledger/assignments exist; is there any **payment capture** path, or only billing?
- **Communication** — one-way notices only, or two-way parent↔teacher messaging?
- **Library** — is there any UI for catalog / issue / return, or backend-only?
- **Tenant onboarding/provisioning** — how does a *new* school get set up (academic year, classes, sections, subjects, staff, students)? Is there a guided flow or only raw admin CRUD / seed?

## Task 4 — Production-readiness checklist (present / absent)

Mark each: payment gateway (eSewa/Khalti/ConnectIPS/Fonepay) · push notifications (Expo) · object storage for photos/docs/report-cards · school onboarding flow · offline resilience (esp. attendance) · app-store + OTA deployment · error monitoring · data export/backup · minors'-data privacy controls.

---

## Deliverable

Write the report to `docs/audits/FEATURE-COVERAGE-<date>.md`: the Step 0 inventory, the Task 1 matrix, the Task 2 role map, the Task 3 workflow gaps (with what's-missing per item), and the Task 4 checklist. End with a short "biggest gaps to functional" summary — the 5–8 items that most stand between today and a school running on this daily.
