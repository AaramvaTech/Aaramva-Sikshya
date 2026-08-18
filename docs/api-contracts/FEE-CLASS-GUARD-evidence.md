# FEE-CLASS-GUARD — API evidence chain

**Source of truth for the API checkpoint's proof.** Spec: `FEE-CLASS-GUARD-spec.md`.
Branch `feat/fee-class-guard` (off `main`), commit `9187538`.
Captured 2026-08-16. Every request below is a real HTTP call against the running
dev API; every read-back is a real `psql` SELECT. No mocked tests appear as proof.

---

## 0. Environment and method

| | |
|---|---|
| API | `http://localhost:3001` — `node --enable-source-maps dist/main`, rebuilt from this branch |
| DB | PostgreSQL 17, `aaramva_shikshya`, connected as `aaramva_app` (non-superuser) |
| Tenant | `demo` (project canary convention) |
| Auth | `owner@demo.school` / `Owner@12345` (SCHOOL_OWNER, seeded value — **no password shim was needed, so nothing had to be restored**) |

### 0.1 The running server was stale — proved, then fixed

The API already listening on `:3001` was `node dist/main` (PID 5468, started
13:40, **not** watch mode), so it was serving code compiled before this branch's
changes. Discriminating probe — send a non-boolean `allowCrossClassAssignment`
with a valid-but-nonexistent structure id. `main.ts`'s `ValidationPipe` uses
`whitelist: true` **without** `forbidNonWhitelisted`, so old code silently strips
an unknown property and reaches the 404; new code rejects the type first.

```
POST /api/v1/finance/students/00000000-0000-4000-8000-000000000000/fee-structure
{"feeStructureId":"00000000-0000-4000-8000-000000000001","effectiveFrom":"2026-08-16","allowCrossClassAssignment":"yes"}

BEFORE restart:
{"success":false,"error":{"code":"RESOURCE_NOT_FOUND","message":"Fee structure 00000000-0000-4000-8000-000000000001 not found",...}}
   -> property stripped => STALE build
```

`npx nest build`, restarted, re-probed:

```
AFTER restart:
{"success":false,"error":{"code":"VALIDATION_FAILED","message":"Please correct the highlighted fields.",
 "details":{"fields":{"allowCrossClassAssignment":"allowCrossClassAssignment must be a boolean value"}},...}}
   -> new DTO live
```

Every proof below ran against the restarted process.

### 0.2 Encoding note (not a data bug)

The em-dash in `"FCG Grade 1 — Day Scholar"` and in the guard's message renders as
`�` / `â€”` in some captures below. That is this Windows console's
code page mangling UTF-8 on the way out, not what is stored or sent — the same
strings read back correctly from `psql` and from `python -m json.tool`.

---

## 1. Migration 0038

### 1.1 Canary → fleet

```
$ npm run migrate:tenants -- --tenant demo
migrate:tenants — APPLY — tenant=demo
tenant=demo migration=0038_fee_structure_class_guard status=applied ms=709
Done — 1 tenants | applied=1 skipped=0 pending=0

$ npm run migrate:tenants
migrate:tenants — APPLY — all tenants
tenant=stacey-mejia              migration=0038_fee_structure_class_guard status=applied ms=181
tenant=kaye-nashh                migration=0038_fee_structure_class_guard status=applied ms=104
tenant=motherland-school         migration=0038_fee_structure_class_guard status=applied ms=109
tenant=raja-mcintyres            migration=0038_fee_structure_class_guard status=applied ms=106
tenant=jorden-donovan            migration=0038_fee_structure_class_guard status=applied ms=6
tenant=geetanjali-school-college migration=0038_fee_structure_class_guard status=applied ms=23
tenant=test                      migration=0038_fee_structure_class_guard status=applied ms=6
Done — 8 tenants | applied=7 skipped=0 pending=0
```

Resulting shape on `demo` (`\d tenant_demo.student_fee_structure_assignments`, trimmed):

```
 class_mismatch_overridden | boolean                  | not null | false
 overridden_by_user_id     | uuid                     |          |
 overridden_at             | timestamp with time zone |          |
Check constraints:
    "chk_sfsa_override_stamp_complete" CHECK (class_mismatch_overridden = false AND overridden_by_user_id IS NULL AND overridden_at IS NULL
                                           OR class_mismatch_overridden = true  AND overridden_by_user_id IS NOT NULL AND overridden_at IS NOT NULL)
Foreign-key constraints:
    "student_fee_structure_assignments_overridden_by_user_id_fkey" FOREIGN KEY (overridden_by_user_id) REFERENCES tenant_demo.users(id)
```

### 1.2 Runner note — how the fleet run was possible on a main-based branch

`main`'s last migration is `0032`, but this dev DB is at `0037` from unmerged
branches, and `TenantMigrationService.assertChecksumsMatch` **aborts** when an
applied migration has no file on disk. For the fleet run above, `0033`–`0037`
were temporarily restored into the working tree from
`feat/cal-1-calendar-holidays` (never staged), then deleted. Verified afterwards:
`git status` clean; commit `9187538` touches exactly one migration file; the
branch tracks `0001`–`0032` + `0038` and nothing else.

### 1.3 Scratch-tenant proof: 0038 applies against a DB at 0032

The fleet run above proves nothing about `main`'s actual state, so this was
re-proved from scratch. **Phase A** — `0038` moved out of the migrations
directory entirely, then a brand-new tenant provisioned through the real
`POST /auth/register-school` path (which runs the runner from `0001_baseline`):

```
$ ls apps/api/migrations/tenant/ | tail -2
0031_drop_old_finance_tables.sql
0032_widen_book_issues_fine_amount.sql

POST /api/v1/auth/register-school {"schoolName":"FCG Scratch Migration Test","slug":"fcg-scratch",...}
  -> 201, tenantId a17e1691-49d4-48eb-a7a0-a0eac53b2af4

LEDGER_COUNT|32
LEDGER_LATEST|0032_widen_book_issues_fine_amount
GUARD_COLUMNS_PRESENT|0
ALLOW_CROSS_CLASS_PRESENT|0
```

**Phase B** — `0038` restored (`git status` clean = byte-identical), runner
pointed at that 0032 tenant:

```
$ npm run migrate:tenants -- --tenant fcg-scratch --dry-run
tenant=fcg-scratch migration=0038_fee_structure_class_guard status=pending ms=0
Done — 1 tenants | applied=0 skipped=0 pending=1

$ npm run migrate:tenants -- --tenant fcg-scratch
tenant=fcg-scratch migration=0038_fee_structure_class_guard status=applied ms=10
Done — 1 tenants | applied=1 skipped=0 pending=0
```

Read-back:

```
LEDGER_SEQUENCE_TAIL  | 0031_drop_old_finance_tables -> 0032_widen_book_issues_fine_amount -> 0038_fee_structure_class_guard
LEDGER_COUNT          | 33
CHECKSUM_MATCHES_DEMO | t
COL | class_mismatch_overridden | boolean                  | NO  | false
COL | overridden_at             | timestamp with time zone | YES |
COL | overridden_by_user_id     | uuid                     | YES |
COL | allow_cross_class         | boolean                  | NO  | false
CHECK            | chk_sfsa_override_stamp_complete
FK_OVERRIDDEN_BY | student_fee_structure_assignments_overridden_by_user_id_fkey
```

**Conclusion: `0038` has no dependency on `0033`–`0037`.** It applies cleanly
straight on top of `0032`, with a checksum identical to the fleet's. By
inspection it touches only `student_fee_structure_assignments` and
`bulk_assign_jobs` (both from `0020`) and FKs `users` (`0001`).

Scratch tenant removed afterwards — `DROP SCHEMA tenant_fcg_scratch CASCADE`
(74 objects) plus its `subscriptions` and `tenants` rows:

```
left_schema       | 0
left_tenant       | 0
left_subscription | 0
tenants_now       | demo,geetanjali-school-college,jorden-donovan,kaye-nashh,motherland-school,raja-mcintyres,stacey-mejia,test
```

---

## 2. Fixtures

`demo` has only `Grade 9`, so Grade 1 / Grade 5 scaffolding was crafted directly
in SQL (scaffolding is not what is under test; everything under test goes through
HTTP). All ids are recognisably synthetic and all student codes are `FCG-`-prefixed.

```
INSERT 0 2   classes    Grade 1 (1111…0001), Grade 5 (1111…0005)
INSERT 0 2   sections   A under each (2222…0001 / 2222…0005)
INSERT 0 3   students

FCG-G1-A|Ram |Grade 1|A     33333333-3333-4333-8333-000000000001
FCG-G1-B|Sita|Grade 1|A     33333333-3333-4333-8333-000000000002
FCG-G5-A|Hari|Grade 5|A     33333333-3333-4333-8333-000000000005
```

Fee structure created through the real API:

```
POST /api/v1/finance/bill/fee-structures
{"academicYearId":"32c7c733-18b6-464e-b252-a705876cf212",
 "classId":"11111111-1111-4111-8111-000000000001",
 "name":"FCG Grade 1 — Day Scholar",
 "items":[{"feeHeadId":"a53e949d-a808-4dc1-9e70-b9a3068cf514","amount":"1500.00","effectiveFrom":"2026-04-14"}]}

HTTP 201
{"success":true,"data":{"id":"e46c4b08-cdbe-4f7d-8c01-c7e5a9ee4e5b",
 "classId":"11111111-1111-4111-8111-000000000001","sectionId":null,
 "name":"FCG Grade 1 — Day Scholar","isActive":true,
 "createdBy":"356f7928-8073-4e27-8e35-b560e40ddbe3",...}}
```

---

## 3. Step 1 — single assign, mismatch, **no** override → 422, nothing written

```
POST /api/v1/finance/students/33333333-3333-4333-8333-000000000005/fee-structure
{"feeStructureId":"e46c4b08-cdbe-4f7d-8c01-c7e5a9ee4e5b","effectiveFrom":"2026-08-16"}

HTTP 422
{"success":false,
 "error":{"code":"CLASS_MISMATCH",
          "message":"Fee structure is for Grade 1, but this student is in Grade 5 — A.",
          "details":{"feeStructure":{"id":"e46c4b08-cdbe-4f7d-8c01-c7e5a9ee4e5b","className":"Grade 1","sectionName":null},
                     "target":{"studentId":"33333333-3333-4333-8333-000000000005","className":"Grade 5","sectionName":"A"}},
          "requestId":"a457992f-7f45-4dae-aa46-ea40cfd84320"}}
```

Read-back:

```sql
SELECT count(*) FROM student_fee_structure_assignments WHERE student_id='3333…0005';        -- 0
SELECT count(*) FROM student_fee_structure_assignments WHERE fee_structure_id='e46c4b08…';  -- 0
```

```
ROWS_FOR_G5_STUDENT|0
ROWS_FOR_FIXTURE_STRUCTURE|0
```

---

## 4. Step 2 — same call **with** `allowCrossClassAssignment: true` → 201 + stamp

```
POST /api/v1/finance/students/33333333-3333-4333-8333-000000000005/fee-structure
{"feeStructureId":"e46c4b08-cdbe-4f7d-8c01-c7e5a9ee4e5b","effectiveFrom":"2026-08-16","allowCrossClassAssignment":true}

HTTP 201
{"success":true,"data":{"id":"b0c4cef2-2dab-4ccf-babe-80279c3482a9",
 "studentId":"33333333-3333-4333-8333-000000000005",
 "feeStructureId":"e46c4b08-cdbe-4f7d-8c01-c7e5a9ee4e5b",
 "effectiveFrom":"2026-08-16","effectiveTo":null,
 "assignedBy":"356f7928-8073-4e27-8e35-b560e40ddbe3",
 "classMismatchOverridden":true,
 "overriddenBy":"356f7928-8073-4e27-8e35-b560e40ddbe3",
 "overriddenAt":"2026-08-16T09:05:24.592Z",
 "createdAt":"2026-08-16T09:05:24.592Z"}}
```

Read-back:

```
-[ RECORD 1 ]-------------+-------------------------------------
id                        | b0c4cef2-2dab-4ccf-babe-80279c3482a9
student_id                | 33333333-3333-4333-8333-000000000005
class_mismatch_overridden | t
overridden_by_user_id     | 356f7928-8073-4e27-8e35-b560e40ddbe3
overridden_at             | 2026-08-16 14:50:24.59272+05:45
```

This row was then deleted (`DELETE 1`, `REMAINING|0`) so step 3's "Grade 5 has no
row" read-back could not be satisfied by a leftover.

---

## 5. Step 3 — bulk, hand-picked list spanning two classes, **no** override

```
POST /api/v1/finance/bill/fee-structures/e46c4b08-cdbe-4f7d-8c01-c7e5a9ee4e5b/bulk-assign
{"scopeType":"STUDENT_LIST",
 "studentIds":["3333…0001","3333…0002","3333…0005"],
 "effectiveFrom":"2026-08-16"}

HTTP 201
{"success":true,"data":{"id":"a8590149-72fa-464a-a3c8-d48dde219ccb",
 "scopeType":"STUDENT_LIST","effectiveFrom":"2026-08-16",
 "allowCrossClassAssignment":false,"status":"PENDING",
 "total":3,"processed":0,"failedCount":0,"failures":[],...}}
```

After the poller drained (`GET /api/v1/finance/jobs/a8590149-…`):

```json
{
    "id": "a8590149-72fa-464a-a3c8-d48dde219ccb",
    "feeStructureId": "e46c4b08-cdbe-4f7d-8c01-c7e5a9ee4e5b",
    "scopeType": "STUDENT_LIST",
    "effectiveFrom": "2026-08-16",
    "allowCrossClassAssignment": false,
    "status": "COMPLETED",
    "total": 3,
    "processed": 3,
    "failedCount": 1,
    "failures": [
        {
            "error": "Class mismatch. Fee structure is for Grade 1, but this student is in Grade 5 — A.",
            "reason": "CLASS_MISMATCH",
            "studentId": "33333333-3333-4333-8333-000000000005"
        }
    ],
    "startedAt": "2026-08-16T09:05:49.058Z",
    "completedAt": "2026-08-16T09:05:49.183Z"
}
```

Read-back — the two Grade 1 students assigned, the Grade 5 student not:

```
FCG-G1-A|Grade 1|f|
FCG-G1-B|Grade 1|f|
G5_ROWS|0
```

(columns: `student_id | class | class_mismatch_overridden | overridden_by_user_id`)

---

## 6. Step 4 — same bulk run **with** the override flag

```
POST /api/v1/finance/bill/fee-structures/e46c4b08-cdbe-4f7d-8c01-c7e5a9ee4e5b/bulk-assign
{"scopeType":"STUDENT_LIST",
 "studentIds":["3333…0001","3333…0002","3333…0005"],
 "effectiveFrom":"2026-08-17",
 "allowCrossClassAssignment":true}

job=78951aab-9e89-40ef-9669-bda35bbf8f2a
```

```json
{
    "id": "78951aab-9e89-40ef-9669-bda35bbf8f2a",
    "effectiveFrom": "2026-08-17",
    "allowCrossClassAssignment": true,
    "status": "COMPLETED",
    "total": 3,
    "processed": 3,
    "failedCount": 0,
    "failures": [],
    "startedAt": "2026-08-16T09:06:29.080Z",
    "completedAt": "2026-08-16T09:06:29.120Z"
}
```

Read-back (`student_id | class | effective_from | effective_to | overridden | by | at`):

```
FCG-G1-A|Grade 1|2026-08-16|2026-08-16|f||
FCG-G1-A|Grade 1|2026-08-17|          |f||
FCG-G1-B|Grade 1|2026-08-16|2026-08-16|f||
FCG-G1-B|Grade 1|2026-08-17|          |f||
FCG-G5-A|Grade 5|2026-08-17|          |t|356f7928-8073-4e27-8e35-b560e40ddbe3|2026-08-16 14:51:29.085881+05:45
```

Three things this shows at once: all three students now have an open assignment;
the two Grade 1 rows from step 3 were correctly closed (`effective_to` = new
`effective_from` − 1); and **the stamp landed only on the row that actually
mismatched** — the flag is per-run, the stamp is per-student.

---

## 7. Step 5 — same-class assignment is unchanged

```
POST /api/v1/finance/students/33333333-3333-4333-8333-000000000001/fee-structure
{"feeStructureId":"e46c4b08-cdbe-4f7d-8c01-c7e5a9ee4e5b","effectiveFrom":"2026-08-18"}

HTTP 201
{"success":true,"data":{"id":"4b0c9c15-ecbf-4d6a-92f1-a13e5fdb4546",
 "studentId":"33333333-3333-4333-8333-000000000001",
 "effectiveFrom":"2026-08-18","effectiveTo":null,
 "classMismatchOverridden":false,"overriddenBy":null,"overriddenAt":null,...}}
```

No flag needed, no warning, no stamp. This also covers the spec's section rule in
its permissive direction: the structure has `sectionId: null` and the student is
in section A, and it matched.

---

## 8. Extra — section strictness in its restrictive direction

Not one of the five required steps, but it is the branch most likely to be wrong,
so it was proved too. A section `B` was added to Grade 1 and a **section-scoped**
structure created against it:

```
POST /api/v1/finance/bill/fee-structures
{"academicYearId":"32c7c733-…","classId":"1111…0001","sectionId":"2222…00b1",
 "name":"FCG Grade 1 B only","items":[{"feeHeadId":"a53e949d-…","amount":"100.00","effectiveFrom":"2026-04-14"}]}
  -> structure ff446e27-2ce3-4ee4-8717-d3d7c7088eea

POST /api/v1/finance/students/33333333-3333-4333-8333-000000000002/fee-structure   (Grade 1, section A)
{"feeStructureId":"ff446e27-2ce3-4ee4-8717-d3d7c7088eea","effectiveFrom":"2026-08-19"}

HTTP 422
{"success":false,"error":{"code":"CLASS_MISMATCH",
 "message":"Fee structure is for Grade 1 — B, but this student is in Grade 1 — A.",
 "details":{"feeStructure":{"id":"ff446e27-…","className":"Grade 1","sectionName":"B"},
            "target":{"studentId":"3333…0002","className":"Grade 1","sectionName":"A"}},
 "requestId":"9bf4092c-df3c-4dd3-b253-5bb47d6cd96c"}}
```

Right class, wrong section → blocked. Together with step 5 that pins both halves
of the spec's "Section-level strictness" ruling.

---

## 9. Extra — Fee Preview surfaces the override (API half of spec §3)

```
GET /api/v1/finance/students/3333…0005/fee-preview?academicYearId=32c7c733-…&asOfDate=2026-08-20
{'studentId': '…0005', 'feeStructureName': 'FCG Grade 1 — Day Scholar', 'classMismatchOverridden': True,  'netTotal': 1500}

GET /api/v1/finance/students/3333…0002/fee-preview?academicYearId=32c7c733-…&asOfDate=2026-08-20
{'studentId': '…0002', 'feeStructureName': 'FCG Grade 1 — Day Scholar', 'classMismatchOverridden': False, 'netTotal': 1500}
```

---

## 10. Cleanup

Every crafted row deleted in one transaction, with read-backs:

```
DELETE 6   student_fee_structure_assignments   (2 from step 3 + 3 from step 4 + 1 from step 5)
DELETE 2   bulk_assign_jobs
DELETE 2   bill_fee_structure_items
DELETE 2   bill_fee_structures
DELETE 3   students
DELETE 3   sections
DELETE 2   classes

left_assignments       | 0
left_jobs              | 0
left_structures        | 0
left_students          | 0
left_classes           | 0
demo_classes_now       | Grade 9
demo_total_assignments | 16      <- pre-existing demo rows, untouched
```

No password was shimmed at any point (the seeded owner password worked), so there
was nothing to restore and no 401 read-back to perform.

---

## 11. Suite and build

```
Test Suites: 133 passed, 133 total
Tests:       1148 passed, 1148 total
```

13 of those are new: 7 in `bill-class-guard.util.spec.ts`, 3 in
`student-fee-structure-assignment.service.spec.ts`, 2 in
`bulk-assign-runner.service.spec.ts`, 1 in `bulk-assign-job.service.spec.ts`.
`npx nest build` exits clean.

These are regression cover, **not** proof — sections 3–9 are the proof.

---

## 12. Deviations from the spec text

1. **Error body shape.** The spec's literal `{code, feeStructure, target}` cannot
   be returned as written — ERR-1's `{success, error:{code, message, details,
   requestId}}` envelope is mandatory API-wide. It lands as
   `error.code = "CLASS_MISMATCH"` with `feeStructure`/`target` under
   `error.details`, and `CLASS_MISMATCH` was added to `ERROR_CATALOG` (422).

2. **Spec §2's named outcome list belongs to a different feature.** `Will be
   charged / No fee assigned / Already billed / Excluded / Failed` are *bill-run
   line* outcomes (`apps/web/components/finance/bill-run-outcome-badge.tsx`,
   `BillRunLineOutcome`). Bulk Assign's own per-student reporting is
   `bulk_assign_jobs.failures[]` (`{studentId, error}`, rendered by
   `bulk-job-progress.tsx`). That is what was extended, with a new **optional**
   `reason` field — optional because every historical failure row predates it and
   a required field would misrepresent them. Confirmed as the author's own error
   at the API checkpoint review; `failures[].reason` is the correct home.

3. **`class_id IS NULL` blocks.** A student with no class cannot be confirmed as a
   match, so `isClassMismatch` returns true and the guard rejects. Confirmed as
   intended at the API checkpoint review.

---

# Web checkpoint (spec §3)

## 13. What was built

| Spec §3 requirement | Where |
|---|---|
| Single-student Billing tab: inline warning before submit, naming both classes, explicit confirmation | `components/finance/fee-structure-assignment-panel.tsx` + `class-mismatch-warning.tsx` |
| Never auto-send the override flag | `lib/class-guard.ts` → `overrideFlag()`, the single expression both forms' request bodies spread |
| Bulk Assign: scope picker defaults to the structure's own class/section | `bulk-assign-dialog.tsx` → `pickStructure()` |
| Bulk Assign: same warning + confirmation on a changed scope or a spanning hand-picked list | `bulk-assign-dialog.tsx` (CLASS branch compares the chosen scope; STUDENT_LIST branch is per-student and names the affected students) |
| Fee Preview surfaces `classMismatchOverridden` | `fee-preview-panel.tsx` → `CrossClassBadge` (also on the current + historical rows in the assignment panel) |
| `failures[].reason` optional on historical rows | `bulk-job-progress.tsx` — the label is additive, `error` always renders |

The client-side comparison is **advisory only** and says so in the code: the
server re-checks every write and is the sole authority. It compares by class/
section **name**, not id, because `StudentDetail` carries only
`className`/`sectionName` — sound within a tenant, since the schema has
`UNIQUE(name)` on `classes` and `UNIQUE(class_id, name)` on `sections`. No API
change was needed for the web half.

`resolveStructureScope()` returns `null` while `useClasses()` is still loading,
and both forms gate on it — an unresolved scope means "don't know yet", never
"mismatch". Without that gate a half-loaded class list would fire a mismatch
warning on a perfectly matching assignment. This is the async-gate bug class
this codebase has shipped repeatedly (WEB-P Phases 2–4), so it is pinned by
tests rather than left to inspection.

The confirmation is re-armed (unticked) on every input that can change the
verdict — structure pick, scope-type tab, class, section, adding/removing a
picked student, and closing the form — so a stale tick cannot ride along.
`overrideFlag(false, true)` returning `{}` is the backstop for that.

## 14. Web verification — and its limit

**Stated plainly: no browser automation was available in this session** (no
Playwright or Puppeteer in the repo or the toolset), so unlike WEB-P Phases 1–4
there is **no real click-through proof of these screens**. This is the same
limitation disclosed for WEB-P Phase 5. What was actually run:

```
$ npx tsc --noEmit          -> clean
$ npx vitest run            -> Test Files 42 passed (42)
                               Tests     550 passed (550)      (was 531; +19)
$ npm run build             -> succeeded, full route table emitted
```

The 19 new tests are the parts worth pinning, not filler:

- `lib/__tests__/class-guard.test.ts` (16) — the mismatch rule mirrored
  case-for-case against the API's own `bill-class-guard.util.spec.ts`; the
  `resolveStructureScope` async gate, including an explicit case showing what
  the false-warning bug would look like if `null` were coerced to a scope; and
  `overrideFlag`'s four combinations, including `overrideFlag(true, false)`
  asserting the key is **absent**, not `false`.
- `components/finance/__tests__/bulk-job-progress.test.tsx` (+3) — a
  `CLASS_MISMATCH` row renders the label, a historical row with **no** `reason`
  renders its `error` and no label, and a mixed list renders both.

`npm run build` is the strongest non-browser signal available here: it compiles
and render-tree-checks every changed component in a real Next production build.

**Not verified, and needing a human pass before merge:** the actual rendered
appearance and click behaviour of the warning in both forms, and that the Bulk
Assign scope picker visibly repopulates when a structure is chosen.

---

## 15. `overridden_by_user_id` delete behaviour — NO ACTION, no migration needed

`0038` declares the column as a bare `UUID REFERENCES users(id)` with no
`ON DELETE` clause, so Postgres applies its default, `NO ACTION`. Verified live
rather than inferred, on `tenant_demo`:

```
student_fee_structure_assignments_academic_year_id_fkey    | NO ACTION | NO ACTION
student_fee_structure_assignments_assigned_by_fkey         | NO ACTION | NO ACTION
student_fee_structure_assignments_fee_structure_id_fkey    | NO ACTION | NO ACTION
student_fee_structure_assignments_overridden_by_user_id_fkey | NO ACTION | NO ACTION
student_fee_structure_assignments_student_id_fkey          | NO ACTION | NO ACTION
```

(`pg_constraint.confdeltype = 'a'`.) This is what was wanted, and it matches
every sibling FK on the table — including `assigned_by`, the pre-existing
`users` reference from `0020`.

Both feared behaviours are therefore absent:

- **Not `SET NULL`.** Nulling `overridden_by_user_id` alone would leave
  `class_mismatch_overridden = true` with a null attributor and violate
  `chk_sfsa_override_stamp_complete` — the delete would fail at runtime with a
  check-constraint error rather than doing something sane.
- **Not `CASCADE`.** Deleting a user cannot delete fee-assignment rows.

Under `NO ACTION`, an attempt to delete a user who has overridden an assignment
is *rejected by Postgres* — the correct outcome on a money table.

### Are users ever hard-deleted?

**No — and in practice they are not soft-deleted by the application either.**

- Zero `DELETE FROM users` anywhere in `apps/api/src`. The `users` table lives
  in the tenant schema and is reached only through raw SQL (Prisma manages the
  public schema only), so there is no ORM delete path either.
- Zero application writes to `users.deleted_at`. Every `UPDATE users` in the
  codebase sets `last_login_at`, `password_hash`/`must_change_password`, or
  `is_active`. Deactivation is `is_active = false`
  (`hr/staff.service.ts:335`) — the column exists, the code never sets it.
- Adjacent "removal" features soft-delete the *owning* row, not the login:
  `GuardianService.remove` updates `guardians.deleted_at`;
  `StudentService.removeStudent` updates `students.deleted_at`.

Live counts:

```
demo       | soft_deleted 7 | deactivated 3 | total 13
motherland | soft_deleted 0 | deactivated 0 | total 28
```

Demo's 7 are all hand-set during past proof cleanups — six
`pradhansrijan07+…@gmail.com` MAIL-1 test accounts and `pay1-verify@demo.school`
(recorded as manually soft-deleted 2026-08-15). Motherland, the real-data
tenant, has none.

**Net:** `overridden_by_user_id` cannot dangle, the CHECK cannot be tripped by a
user removal, and no assignment row can be destroyed by one.

---

## 16. Server-side `CLASS_MISMATCH` fallback (single-student form)

The client rule is advisory and can miss — a stale roster, a structure
re-scoped by another admin, a class list cached from before a transfer. When it
misses the server answers `422 CLASS_MISMATCH`, and before this change the
admin got a dead-end toast.

`parseClassMismatchError()` (`lib/class-guard.ts`) turns that response back into
the same two scopes the inline warning takes. The single-student form now
renders the identical `ClassMismatchWarning` from the server's own account of
the mismatch — which **replaces** the client's guess, since it is the
authoritative one — re-arms the checkbox, and the same tick-and-Save retries
with `allowCrossClassAssignment: true`.

It returns a usable object for **any** `CLASS_MISMATCH`, even one whose
`details` are missing or malformed. A path forward matters more than a pretty
label; the degenerate case renders "(no class)" and still offers the retry.

Six new tests in `lib/__tests__/class-guard.test.ts` cover it, keyed to the
**real** 422 body captured in §3 above rather than an invented shape — so they
fail if the server contract moves: extraction, the rendered sentence, a
section-scoped structure, null for every other error (including a bare network
`Error`), the malformed-details fallback, and that a parsed result always arms
the override path.

### Why Bulk Assign has no equivalent handler

**`POST /finance/bill/fee-structures/:id/bulk-assign` cannot return
`CLASS_MISMATCH`.** `BulkAssignJobService.create()` does three things — look up
the structure (404), validate the scope shape (400), insert the job row (201).
The guard never runs there; it runs per-student in `BulkAssignRunnerService`,
inside the background job, long after the response was sent.

So a client-rule miss in the bulk form does not produce a dead-end toast. It
produces a completed job whose skipped students are listed with
`reason: 'CLASS_MISMATCH'`, already labelled "Class mismatch" in
`bulk-job-progress.tsx`. Adding a 422 handler there would be unreachable code.

**Real gap left open, needing a ruling:** after such a job completes, the
admin's only path forward is to close the dialog and rebuild the whole run with
the confirmation ticked. A "retry the skipped students with the override"
affordance would close that properly, but it is a new feature, not part of
spec §3.

Suite after these two items: **556 web tests** (was 550), `tsc --noEmit` clean,
`npm run build` succeeds.
