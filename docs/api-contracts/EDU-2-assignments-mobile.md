# EDU-2 — Assignments & Homework: Mobile

**Save location:** `docs/mobile/EDU-2-assignments-mobile.md`
**Scope:** apps/mobile, all three role apps. Consumes EDU-1's API (merged main required — dependency gate first act). Teacher *creation* stays web-only this session (mobile teacher = read + review on the go); note it as a possible later add.
**Baseline:** 485 api tests (must not decrease — API is read-only this session except trivial additive needs, which require a flag-and-justify), current mobile jest count, all-green on main.

## Step 0 — Read and report
1. Dependency gate: `git checkout main && git pull`, confirm `/assignments/me`, `/assignments/my-children`, the assignment-scoped presign, and review endpoints exist. If PR #4 is unmerged, STOP and ask (standing rule).
2. The mobile file-upload story: FILE-1 left mobile display-only — this session adds the app's FIRST upload path (student submission file). Report what expo primitives are available/installed for file+image picking (expo-document-picker / expo-image-picker) and plan the presign→PUT→confirm flow client-side.
3. PUSH-1's route map per role — where `assignments` routes must be added.
4. The established list/detail/empty/error/pull-to-refresh patterns and the BsDate component usage for due dates.

## Tasks
T1 — **Student app:** assignments list (status chips: OPEN/SUBMITTED/LATE/REVIEWED; due date in BS; overdue emphasis), detail screen (description, teacher attachments via presigned GET/useFileUrl, marks+feedback when REVIEWED), submit flow (text answer + optional file via document picker → scoped presign → PUT → confirm; disabled after review per the 409 design — surface that state honestly, not as an error).
T2 — **Parent app:** per-child assignments view (reuse the child-switcher pattern), read-only statuses + marks/feedback; entry point on the child dashboard.
T3 — **Teacher app:** assignments list (own + class filter), detail with submissions + the missing-list, review action (marks/feedback form) matching the web's semantics.
T4 — Push/inbox routing: `assignments` route added to all three role maps (tap → the right detail screen); notification inbox rows for assignment events route correctly.
T5 — Tests: submit-flow state machine (eligible/late/after-review), presign-client helper, list rendering (jest patterns established in PAY-2/POL-2). Mobile tsc clean.

## Verification — raw
1. Dependency-gate output.
2. Student full round-trip live (demo, crafted assignment): list shows it → submit with a real file (presign→PUT→confirm raw) → status flips → teacher review via API → student sees marks/feedback + notification row routes to the detail. Late state proven with a due-yesterday craft.
3. Parent: both children's statuses render; section-B assignment absent (scoping visible client-side).
4. Teacher: missing-list matches EDU-1's N−k live.
5. After-review submit surfaces the blocked state (not a crash) — raw 409 handled.
6. Suites: mobile jest ≥ current, api 485 untouched (or flagged additive), tsc clean, push + all-green, PR per standing rule. Crafted rows cleaned with read-backs.

## Out of scope
Teacher mobile creation, offline drafts, submission history, study materials, comments.
