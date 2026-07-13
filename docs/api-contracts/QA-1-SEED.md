# QA-1 — Seed Registry (`qa-demo` tenant)

Everything below was built via the **live HTTP API** (`localhost:3001/api/v1`) by
`scratchpad/qa-seed.mjs` on 2026-07-13. Delete this whole tenant at Phase 11 cleanup.

- **Slug:** `qa-demo`  •  **Schema:** `tenant_qa_demo`  •  **Tenant id:** `3d1c05c5-1581-4b30-ac46-b825467ef45f`
- **Academic year:** `2082-83` (yearBs 2082, `2025-07-16` → `2026-07-15`, is_current) — id `b6737899-7c55-40a5-8451-a5d7cf05ba1a`
  - BS check (bs-calendar): `2025-07-16 ↔ 1 Shrawan 2082`, `2026-07-15 ↔ 31 Ashadh 2083` (clean fiscal year; matches FIX-3 modern-era anchor).

## Credentials (all mobile-capable)

| Role | Email | Password | user_id |
|---|---|---|---|
| SCHOOL_OWNER (admin) | owner@qademo.school | QaOwner@123 | 3639f6b6-88ce-47ef-85b9-29c1a5245a14 |
| TEACHER 1 | teacher1@qademo.school | QaTeach@123 | 2a096dc1-e6b8-4a0a-b6ac-120cf16a26d4 |
| TEACHER 2 | teacher2@qademo.school | QaTeach@123 | fb767089-6320-4656-81ed-530d401807f2 |
| PARENT 1 (→ S1) | parent1@qademo.school | QaParent@123 | a40db4de-3893-49e3-9eb7-82981dc784a0 |
| PARENT 2 (→ S3) | parent2@qademo.school | QaParent@123 | 39c09395-75f4-428d-83ec-b0a87ca3165e |
| STUDENT 1 (S1) | student1@qademo.school | QaStudent@123 | ea3a45db-9ec1-484e-ac04-c711d2fc16d0 |
| STUDENT 3 (S3) | student3@qademo.school | QaStudent@123 | 7a329db1-cfff-4a9b-85fe-46e1c8c71cd6 |

Login: `POST /auth/login` with header `X-Tenant-Slug: qa-demo` (+ `X-Client-Type: mobile` for mobile roles).

## Structure

| Entity | id |
|---|---|
| Class Grade 9 | cb45876f-cfa1-413d-8a39-b2d19c83d2c9 |
| Class Grade 10 | 449dd23e-8ccb-4b86-bd9d-31a6827ccbbb |
| Section Grade 9-A | c0a7a17c-b80b-44a9-8855-3947182d810a |
| Section Grade 10-A | 99220e45-623f-4bad-8316-c062a8ce3929 |
| Subject Mathematics (BOTH) | 9644c514-333c-4b6e-b1f2-a88697de7baa |
| Subject Science (THEORY) | 6e88288e-f798-4c54-a257-309ef7521a5c |
| Timetable slot Sun-p1 Math (T1, G9-A) | 1bd00f2b-9fa0-4ee8-9170-10e506bcab29 |
| Timetable slot Mon-p2 Science (T1, G9-A) | e38ba9d9-e31a-4710-b75e-77628651bf67 |

class_subjects: Math+Science assigned to both Grade 9 & Grade 10 (fullMarks 100 / passMarks 40).

## Students (4 distinct families — for cross-family 403 probes)

| # | Name | Class-Section | Roll | student_id | Login | Parent |
|---|---|---|---|---|---|---|
| S1 | Aarav Family1 | Grade 9-A | 1 | 72c79ffd-ef53-4c01-b923-3cc52bbb1381 | student1 | Parent 1 (Prakash, Father, 9811000001) |
| S2 | Binita Family2 | Grade 9-A | 2 | 9afb888c-9450-4543-95f8-9057dc880800 | — | — |
| S3 | Chetan Family3 | Grade 10-A | 1 | e0ab6341-6469-4d42-b809-fb67a1320d05 | student3 | Parent 2 (Puja, Mother, 9811000002) |
| S4 | Deepa Family4 | Grade 10-A | 2 | de2bd37a-846b-4bbe-b3d9-aa8afbcd9c09 | — | — |

Guardian ids: P1 guardian `b976e727-98d2-413f-a1d0-d29fbd91c998` (→ S1); P2 guardian `6ab5b02f-4516-4559-a040-026287565fbc` (→ S3).

**Cross-family probe pairs:** Parent1 (child S1) vs S3/S4; Parent2 (child S3) vs S1/S2; Student1 (S1) vs S3.

## Out-of-scope for Phase 11 cleanup (do NOT delete)

- **`pay1-verify@demo.school`** (in tenant `demo`, NOT `qa-demo`) — belongs to the **PAY-1 gate**, not QA-1. Phase 11 cleanup only drops the `qa-demo` tenant, so this account is untouched regardless; recorded here explicitly so no probe/cleanup ever targets it.

## Re-seed / login helper

`node scratchpad/qa-seed.mjs` — idempotent on the tenant (skips register-school if `qa-demo` exists; logs in owner). Token capture at the end respects the 5/min login throttle.
