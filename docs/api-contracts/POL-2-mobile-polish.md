# POL-2 — Polish Sweep: Mobile

**Save location:** `docs/mobile/POL-2-mobile-polish.md`
**Scope:** apps/mobile (three role apps). Closes audit P2 items 17 + 19 (mobile half). Depends on POL-1's new endpoints (guardians/me, parent PDF, must_change_password).
**Baseline:** post-POL-1 counts, all-green on main.

## Step 0 — Read and report per item (confirm each gap still exists, file:line).

## Tasks
### T1 — Parent weekly timetable reachability
The screen is fully built but nothing navigates to it. Wire it into the parent app's navigation where it naturally belongs (child detail or dashboard quick action — follow the app's existing patterns).

### T2 — Student weekly timetable
Students see today-only while parents/teachers get weekly views. Extend the student timetable to the weekly pattern (reuse the parent/teacher weekly component if shareable; Sunday–Friday week per platform convention).

### T3 — Remove the three "Coming in Session 21" stubs
Replace each with either the real feature if it now exists post-Phase-A (check: one may be notifications — PUSH-1 built that) or remove the entry entirely. No stub may survive, and no raw AD dates (their current rendering bug).

### T4 — Parent results PDF
"Download report card" on the parent results screen via POL-1's parent-scoped endpoint, following the student app's existing PDF download/share pattern.

### T5 — Guardian profile name
Replace the email-synthesized display name with real data from `GET /guardians/me` (profile screen + any greeting usage).

### T6 — must_change_password on mobile
Mirror POL-1's web enforcement: flagged login routes to a change-password screen (build it — reuse the API + validation rules) before entering the app; logout remains possible.

## Verification — raw
1. Per-screen proof: navigation reachable (route exists + entry point), weekly timetable renders a full Sun–Fri grid for a seeded student (component/render test or logged screen state), stubs gone (grep for "Session 21" = 0 hits).
2. Parent PDF: live download for own child (bytes/magic proof), 403 probe unchanged from POL-1.
3. /guardians/me wired: profile shows the real name for the demo parent (raw response + rendered value).
4. must_change_password: flagged demo login → change screen → cleared → normal entry (live HTTP + state proof).
5. Mobile jest + tsc clean; api suite unchanged; push + all-green. Crafted rows cleaned with read-backs.

## Out of scope
Dark mode, Nepali i18n, biometrics, EAS/store assets, push receive (EAS session).
