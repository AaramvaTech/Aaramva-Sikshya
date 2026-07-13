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
