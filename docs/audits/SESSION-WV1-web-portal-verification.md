# SESSION-WV1 — Web Admin Portal Verification (read-only)

**Type:** Read-only verification of the web admin portal — the daily-use staff surface (owner / principal / coordinator / accountant / admin), marked 🟡 *present-but-unverified* in the feature audit. Prove the high-traffic flows work end-to-end live; catalog working / broken / unverified. **No fixes** — broken flows are logged for follow-up sessions, not fixed here.

**Why:** every mobile session found shape-mismatches and dead-ends that "the code exists" completely hid. The web admin — where paying customers' staff work all day — has had none of that scrutiny. This is the biggest quiet risk before selling.

**Source of truth:** `docs/audits/FEATURE-COVERAGE-2026-06-23.md` (web 🟡); cells **already proven** by prior sessions count as ✅-prior — LV1 (leave approval web page), RS1 (publish toggle), OB1–OB3 (wizard reusing academic/staff/branding CRUD), R2 (web timetable grid).

**Stack:** Next.js 14 admin portal; NestJS; schema-per-tenant.

---

## Hard rules

1. **Read-only. No fixes.** A broken flow gets logged with its specific failure for a follow-up session.
2. **Verify the way headless mobile was verified:** for each page, identify the **actual API call(s) it makes**, execute them **live against real Postgres** with the correct **role token**, confirm the round-trip (read returns usable data / write persists via SELECT read-back), and **reconcile the web hook's response-shape parsing** against the live shape (the classic `.data` depth / field-name bug). Don't just check that the page renders.
3. **Right role per flow** — exercise each with the role that uses it, and confirm the guard rejects the wrong role.
4. **Prioritize daily-operation flows; mark confidence honestly** — ✅ proven-live vs 🟡 code-only vs ⚠️ broken.
5. Use a clean demo tenant; read-backs for every write.

---

## Step 0 — Inventory

- Enumerate the web routes/pages and, per page, the backend endpoint(s) + the role that uses it.
- Mark cells already proven by prior sessions (LV1 / RS1 / OB1–3 / R2) as **✅-prior** — don't re-verify those.
- Identify the **P1 daily-operation flows** to verify first (below).

Report the inventory + the verify plan, then proceed.

---

## Task 1 — Verify P1 daily-operation flows (live)

For each, execute the page's real API call(s) live with the right role, confirm read-renders / write-persists (SELECT), confirm the guard, and check the hook parses the shape:

- **Enrollment / admission** (admit a student via the web form path).
- **Fees:** fee structure + assignment; **record a payment** (accountant) → persists; invoice / ledger / fee reports render.
- **Exams:** exam types + schedules; **marks entry on web**; results compute; publish (✅-prior from RS1 — just confirm the page calls it).
- **Attendance:** view/section attendance; leave approval (✅-prior from LV1 — confirm the page).
- **Academic CRUD:** year / classes / sections / subjects (✅-prior via OB1 — confirm the standalone pages, not just the wizard).

Classify each: ✅ proven-live · ⚠️ broken (with the specific failure) · 🟡 unverified.

## Task 2 — Inventory the rest (code-confidence; resumable)

Map and spot-check the remaining areas — notices/communication, staff/HR management, dashboard, settings/branding, super-admin (tenant provisioning), reports, library — marking confidence. Full live-verify of these can continue in a second pass if context runs long.

---

## Deliverable

Write `docs/audits/WEB-VERIFICATION-2026-06-24.md`:
- The matrix: route → endpoint(s) → role → status (✅ / ⚠️ / 🟡) + confidence.
- The ⚠️ **broken findings**, each with the specific failure (these become fix sessions).
- A short **"biggest web risks"** summary — the flows most likely to break a school's day, ranked.

End with raw evidence: the live API call results (status + shape) for the P1 flows, grouped by flow.
