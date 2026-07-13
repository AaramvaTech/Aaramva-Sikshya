# QA-1 — Results Matrix

Cell values: `PASS` / `FAIL→FIXED(bug#)` / `FORBIDDEN-CORRECT` / `NOT_BUILT` / `N/A`.
Tenant: `qa-demo` (schema `tenant_qa_demo`). See `QA-1-SEED.md` for IDs.

`| Module | Feature | C | R | U | D | Admin(web) | Teacher(mob) | Student(mob) | Parent(mob) | Scoping 403 proof | Status |`

## Phase 0 — Environment + Assignment file upload

| Module | Feature | C | R | U | D | Admin | Teacher | Student | Parent | Scoping 403 | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Storage/FILE-1 | MinIO health + bucket | — | PASS | — | — | — | — | — | — | — | PASS (0.1) |
| Auth | register-school (public) | PASS | — | — | — | PASS | — | — | — | — | PASS |
| Auth | login mobile vs web (cookie semantics) | — | PASS | — | — | web:no-body-token+cookie | mob:body-token+no-cookie | mob | mob | — | PASS |
| Assignments | create w/ attachment (PDF+PNG) | PASS | PASS(download-back byte-exact) | — | — | — | PASS | — | — | (Phase 4) | PASS |

**Phase 0 result:** stack up (Postgres 17 / API / web / MinIO; Redis disabled-by-design). qa-demo seeded (4 students/2 families, 2 teachers, 2 parents, 2 student logins). Assignment upload **works end-to-end** once MinIO is running — reported failure was MinIO-down (BUG-1, environmental). No code changes.

Full Assignments CRUD + scoping matrix is deferred to **Phase 4**. Standard per-feature CRUD/scoping matrices for each module follow in Phases 1–10.

## Phase 1 — Students

Fixes landed this phase (commit **8611d5b**): **BUG-1** `/health` storage reachability + startup warn → **FIXED**; **OBS-A** guardians soft-delete column → **FIXED** (migration 0008). Details in `QA-1-BUGS.md`.

| Module | Feature | C | R | U | D | Admin | Teacher | Student | Parent | Scoping 403 | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Students | Admission | PASS (`created_by`=owner) | PASS | PASS | PASS (soft) | PASS | R-only 200 | N/A | N/A | parent/student `:id`→403 | PASS |
| Students | Invalid payload | 400 + no-write | — | — | — | PASS | — | — | — | — | PASS |
| Students | Photo upload (MinIO persist+retrieve) | PASS (key stored, not base64) | PASS (byte-exact 68 B) | — | — | PASS | — | — | — | — | PASS |
| Students | Profile read (single/list/pagination) | — | PASS (`.data.data`+`.data.meta`, soft-del excluded) | — | — | PASS | 200 | own via /me | own via my-children | — | PASS |
| Students | Guardian linking (casing) | — | PASS (camelCase `firstName/isPrimary`) | — | — | PASS | — | — | — | — | PASS |
| Students | Enroll (class/section assign) | PASS (→Grade 10-A) | — | — | — | PASS | — | — | — | — | PASS |
| Students | Student `/me` (own profile) | — | PASS | — | — | — | — | PASS (own only) | — | no id param (THE ONE RULE) | PASS |
| Students | Parent `my-children` (own only) | — | PASS | — | — | — | — | — | PASS (only S1) | cross-family excluded | PASS |
| Students | Route-shadow `/students/stats` | — | PASS (200, not `:id`) | — | — | PASS | — | — | — | — | PASS |

**Phase 1 result:** all cells PASS. Accountability stamp (`created_by`) proven; soft-delete proven (row present + `deleted_at` set + excluded from GET/list/stats); photo round-trips to MinIO byte-exact (no silent discard); guardian casing correct end-to-end; role scoping correct (parent/student `:id`→403, teacher roster 200; `/me` + `my-children` own-only).

- **OBS-B (flagged, FIX-3):** student DOBs render BS in the 2067 era (e.g. `2010-05-20 → 2067-02-07`), inside the FIX-3 documented off-by-one window. Consistent internal use of `adToBs`; cross-check vs hamropatro before trusting historical BS DOBs. Not fixed (FIX-3 is its own pass).
- **OBS-C (minor, tracked):** the student *status* enum differs across surfaces — list-query `['ACTIVE,PASSED_OUT,EXPELLED,TRANSFERRED,DROPPED']` vs `stats.byStatus` keys `ACTIVE/INACTIVE/TRANSFERRED/GRADUATED`. No functional failure; a cosmetic enum-consistency nit. Revisit if it surfaces in a status-update flow.
