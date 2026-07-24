# WEB-P Phase 5 — Parent Module — Findings

Branch: `feat/web-p-phase-5-parent`, forked from `feat/web-p-phase-4-student` @ `28bb49a`
(confirmed true fork point via `git merge-base --is-ancestor`; the local `main` ref in this
checkout is behind `28bb49a` and was NOT used as the review base for that reason).

## Step 0 IDOR audit — held with no new gaps

`docs/web/phase-5-idor-audit.md` (written before any screen was built) verified every child-scoped
backend endpoint this phase calls has a real `guardians`-table ownership check. Both the final
whole-branch review and this session's own live HTTP probes (below) independently re-verified the
audit's central claims against current backend source and confirmed they hold. **No new IDOR gap
was discovered during actual screen-building** — a contrast with Phase 4, which found and fixed a
real STUDENT-role timetable gap mid-build. Phase 5 built entirely on top of already-correct backend
scoping; zero `apps/api` files are touched anywhere in this branch's diff (confirmed: `api` test
count is unchanged at 667 pre- and post-phase).

## Task execution summary

10 tasks, each independently implemented and task-reviewed (spec compliance + code quality):

1. Parent-facing API client methods + types — clean, zero issues.
2. Shared child-switcher (`useSelectedChild()` + `<ChildSwitcher>`) — clean.
3. Dashboard (overview + comparison) — clean, 3 Minor non-blocking notes.
4. Attendance calendar + leave request — clean, IDOR discipline verified end-to-end.
5. Timetable (highest-scrutiny task per the plan) — clean, independently re-verified SAFE twice.
6. Notices — controller-reviewed directly (byte-identical port of Phase 4's pattern).
7. Results + PDF — clean, route/contract independently re-confirmed.
8. Assignments (view-only) — clean, local status-chip design judgment verified correct.
9. Fees (view-only) — clean, the phase's hardest security constraint (payment-gateway exclusion)
   independently adversarially grepped and verified.
10. Nav wiring — **one escalated finding, resolved by human decision** (see below).

### Task 10 escalation: duplicate ChildSwitcher

Task 10 added a shell-level global `<ChildSwitcher>` per the plan's explicit instruction ("must be
visible on every parent screen, not just per-page"). The first review found this created real,
independently-verified duplication: 5 of 7 screens already had their own page-level instance, so
those 5 pages showed the identical control twice on-screen at once. This was a genuine
plan-text-vs-normal-UI-practice conflict — not a defect either the implementer or reviewer could
resolve unilaterally — so it was escalated to the human. Decision: **shell-level wins**; the 5
redundant per-page instances were removed in a follow-up fix commit (`5c26ceb`), independently
re-reviewed and confirmed clean (fix commit scoped to exactly the 5 named files, zero remaining
`ChildSwitcher` render sites anywhere except the shell, one structural edit in `results/page.tsx`
traced through `PageHeader`'s real conditional-wrapping logic and confirmed behavior-identical).

## Whole-branch review (opus) — one Important finding, fixed

The final cross-task review (scope: things a single-task reviewer structurally cannot see) found:

- **Cross-task consistency**: all 5 per-child screens share the identical four-branch async-gate
  guard shape from `useSelectedChild()`, byte-for-byte. Dashboard and Notices correctly use a
  narrower/no guard since they don't depend on a single selected child. No screen re-derived its
  own variant of this logic — the centralization held.
- **ChildSwitcher final state**: exactly one render site in the entire `apps/web` tree
  (`portal-shell.tsx:209`), confirmed via a repo-wide grep, not just the 5 touched files.
- **Hard exclusions**: the payment-gateway exclusion and the view-only mandate for
  Assignments/Fees were re-verified phase-wide (not just the tasks already scrutinized for them) —
  clean across all 7 screens.
- **IDOR re-verification**: independently re-read current backend source (not the audit doc) for
  attendance history/summary, the leave write-path, report-card+PDF, and the fee ledger/
  assignments — confirmed the controller wiring genuinely threads caller context into each
  service-level guardian check (a guard that never receives caller identity is dead code — this was
  checked explicitly, not assumed).
- **One Important finding**: a new `parent.store` selection (`selectedChildId`) was never cleared
  on logout, and `useSelectedChild()`'s effect only auto-picked a default child when the selection
  was empty — never re-validating an *existing* selection against a newly-logged-in parent's own
  roster. A same-tab logout+login as a different parent left the prior parent's `selectedChildId`
  in memory; every per-child screen's guard (`!selectedChildId || !selectedChild` → skeleton) then
  showed a permanent loading skeleton, with no in-UI recovery for a single-child parent (whose
  `ChildSwitcher` renders a static label, no dropdown). **Confirmed zero security impact**: the
  stale id still flows into real queries, but every one of them is backend-guardian-scoped and
  would 403 on a foreign id — this is a correctness/UX bug, not a data leak. Matches a recurring
  async-gate/stale-state bug class (Phases 2-4) closely enough that it was fixed before merge
  despite having no security consequence. **Fixed in `0bd15fb`**: `useSelectedChild()`'s effect now
  re-picks a default whenever the current selection doesn't match any child in the fetched roster
  (not only when it's empty), plus a `parent.store.clear()` hygiene call wired into
  `handleLogout` as belt-and-suspenders. New `use-selected-child.test.tsx` (3 tests) pins the
  self-healing behavior. Verified directly by the controller against the reviewer's exact
  recommendation before accepting — matches byte-for-byte.
- Two Minor, non-blocking notes (a hook missing one hygiene-only `enabled` gate that's structurally
  unreachable in practice; a pre-existing dead badge branch already logged against Task 3).

## Consolidated live-proof pass

**Method note (read before comparing to prior phases' entries in `CLAUDE.md`):** this session had
no browser-automation tool available (no Playwright MCP was configured). Unlike Phases 1-4, which
drove a real Playwright browser session, this phase's live proof is **raw HTTP + Postgres
verification against the running dev stack** — every screen's underlying API contract was
exercised directly and independently of the already-completed per-task code reviews (which did
read the actual component source for UI-level correctness). No claim is made here about actual
rendered UI/visual correctness beyond `tsc --noEmit` passing and the per-task reviews' source
reading. This is a real gap relative to prior phases' verification depth, disclosed here rather
than glossed over.

### Environment note

This worktree's `node_modules/@prisma/client` was stale (121 pre-existing TypeScript errors on
`nest start --watch`, all `$queryRawUnsafe<T>()` generic-call errors across files this phase never
touched — e.g. `academic-migration.service.ts`, `notice.service.ts`). Fixed with `npx prisma
generate` (matching declared version `^6.19.3`); unrelated to any Phase 5 code. Recorded as a dev
note in `CLAUDE.md` since other worktrees may hit the same thing after being freshly created.

### Setup

- Demo tenant (`demo`), family 1 = `parent@demo.school` (children: Binod Gurung, Aarav Shrestha,
  both section `88bf039b-…`). Password temporarily shimmed to a known value, verified, restored
  with a 401 read-back proof after.
- A second family was needed for cross-family IDOR probes and none pre-existed with an *active*
  parent account other than an already soft-deleted leftover test account
  (`pradhansrijan07+guardian@gmail.com` — incidentally password-shimmed while investigating why its
  login failed; also restored + 401-proven, no functional impact since it's soft-deleted). A
  genuine second family was provisioned via the real admin API
  (`POST /students/:studentId/guardians` with `ProvisionGuardianDto`, as `owner@demo.school`,
  password-shimmed/restored/401-proven) for student **Chameli Tamang** (`b5d27009-…`, same section
  as family 1 — deliberately not a security-relevant detail since the timetable ownership check is
  section-based, see below), creating guardian `cebaa727-…` + parent user `6242634e-…`
  (`phase5.probe.family@example.com`). Both fully deleted after probing (guardian row, user row);
  read-back confirms 0 rows for each.

### Walked all 7 screens + dashboard comparison, as family 1, own children

`GET /students/my-children`, `GET /attendance/students/:id/summary`,
`GET /attendance/students/:id/history`, `GET /timetable/section/:sectionId`,
`GET /communication/notices`, `GET /exams/results/student/:id`,
`GET /exams/results/report-card/:id`, `GET /assignments/my-children`,
`GET /finance/students/:id/assignments`, `GET /finance/reports/student/:id` — **all HTTP 200**.

`GET /assignments/my-children` body confirmed correctly audience-scoped: family 1 sees exactly
`["Binod Gurung", "Aarav Shrestha"]`, never the crafted second family's child.

### Report-card PDF

Binod's only exam result (`First Terminal`) was genuinely unpublished in the demo tenant
(`results_published_at IS NULL`) — the PDF route correctly returned `409 CONFLICT_DUPLICATE`
("not available yet"), a true privacy-gate hit, not a broken feature. To get a full 200+magic-bytes
proof, the exam type was **temporarily published** (`PATCH /exams/types/:id/publish`, as
`owner@demo.school`) — own-child PDF then returned `200`, `%PDF-1.3` magic bytes, 24188 bytes;
cross-family attempt (family 2's token, same student, same published window) returned `403
FORBIDDEN_ROLE`. The exam type was then unpublished again via the same endpoint
(`results_published_at` back to `NULL`, confirmed). This fired the real `result.published` event
(3 `notifications` rows, one per guardian/student in the class with a result) — all 3 rows deleted
after verification, confirmed by id.

**Step-0 contract confirmation (per Task 11's brief):** Task 7's own Step-0 finding — the PDF route
(`GET /exams/results/report-card/:studentId/pdf`, path-param shape) is a **different URL shape**
from Phase 4's student self-route (`GET /students/me/report-card/pdf`), though both funnel through
the same `getReportCard`/`assertGuardianOwnsStudent`-style hard-scope chain via
`buildReportCardPdf`. This session's own live probe (200 own-child, 403 cross-family) independently
confirms that chain behaves identically regardless of the URL shape difference — Task 7's
Step-0 finding holds.

### Real leave request through the actual API

Filed as family 1 for Binod: `POST /attendance/leave` → `201`, `status: PENDING`. Postgres
read-back (`leave_applications` id `524bccad-…`) confirmed `student_id = <Binod>`,
`applied_by = <parent@demo.school's user id>`. Deleted after verification (read-back: 0 rows).

### IDOR probes (raw HTTP, deliberately outside any UI) — every attempt correctly rejected

| Probe | Result |
|---|---|
| Family 2 → family 1's child, attendance summary | `403 FORBIDDEN_SCOPE` |
| Family 2 → family 1's child, attendance history | `403 FORBIDDEN_SCOPE` |
| Family 2 → family 1's child, exam results | `403 FORBIDDEN_ROLE` |
| Family 2 → family 1's child, report card (json) | `403 FORBIDDEN_ROLE` |
| Family 2 → family 1's child, report card (PDF, published) | `403 FORBIDDEN_ROLE` |
| Family 2 → family 1's child, fee assignments | `403 FORBIDDEN_ROLE` |
| Family 2 → family 1's child, fee ledger | `403 FORBIDDEN_ROLE` |
| Family 2 → family 1's child, `POST /attendance/leave` (write) | `403 FORBIDDEN_SCOPE`, **0 rows created** (Postgres-confirmed) |
| Family 1 → a section neither of their children are enrolled in, timetable | `403 FORBIDDEN_SCOPE` |

The timetable check is confirmed **section-based**, not per-specific-child
(`timetable.service.ts:getSectionTimetable`'s PARENT branch: `JOIN guardians g ON g.student_id =
s.id WHERE g.user_id = $1 AND s.section_id = $2` — any child in that section satisfies it). This is
why the crafted second family's child was deliberately left in the *same* section as family 1's
children (a same-section cross-family timetable request is legitimately authorized under this
model, not an IDOR) and the real probe instead targeted a section neither family has any child in.

### Cleanup — all confirmed via read-back

- Crafted leave application: deleted, 0 rows remain.
- Crafted guardian row + parent user: deleted, 0 rows remain.
- 3 crafted `result.published` notification rows: deleted, confirmed by id.
- Exam type publish state: reverted to `NULL`, confirmed.
- All 3 shimmed passwords (`parent@demo.school`, `owner@demo.school`, and the already-soft-deleted
  `pradhansrijan07+guardian@gmail.com`): restored to original bcrypt hashes, **401-proven** (login
  with the temp password now fails for all three).

## Async-gate bug-class note

This phase had the heaviest async-gate surface of any phase so far — all 5 per-child screens
depend on `useSelectedChild()`'s async-resolved selection. Unlike Phases 2-4 (where the bug
recurred multiple times as fresh instances within a single phase before being caught), this phase's
occurrence was a genuinely new *variant* of the class (stale-after-identity-change, not
never-gated) and was caught by the whole-branch review, not shipped-then-fixed within a task. A
regression test was added (`use-selected-child.test.tsx`) since this hook is the single centralized
point every downstream screen depends on — unlike prior phases' individual `{enabled}` gate
additions (which stayed untested per explicit prior-session guidance, since those were narrow,
single-call-site fixes), this hook's self-healing behavior is worth pinning permanently: a future
edit to this one file has 5 screens' worth of blast radius if it regresses.

## Final counts

- **API: 667/667 tests passing** (unchanged from the pre-phase baseline — zero `apps/api` diff
  anywhere in this branch).
- **Web: 320/320 tests passing** (was 317 at Phase 4's baseline + Task-level work in this phase
  added no new test files during Tasks 1-10; +3 from the whole-branch-review fix's
  `use-selected-child.test.tsx`).
- **`tsc --noEmit`: 0 errors.**

## Explicitly NOT authorizing Phase 6

Per the locked ruling in `docs/web/WEB-P-PORTAL.md` §7: this phase's clean test suite and review
sign-off do **not** authorize Phase 6 (teacher login cutover). That requires the human's manual
parity sign-off, not an automated gate. Not pushed; no PR opened — awaiting the human's go-ahead
before any further phase.
