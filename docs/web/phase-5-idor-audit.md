WEB-P Phase 5 — proactive IDOR audit (step 0, done before any screen was built)

Per the phase brief: parent-scoped endpoints are the highest-stakes place in
this project for the "endpoint has no ownership check, only survives because
no UI ever called it with an arbitrary ID" bug class (it's appeared twice —
mobile's dormant `GET /timetable/teacher/:teacherId`, and WEB-P Phase 4's
`GET /timetable/section/:sectionId` STUDENT-branch gap). Every endpoint this
phase's 9 screens will call was enumerated and its backend ownership check
read directly from source — not assumed, not taken on the strength of old
recon or code comments — before any frontend code was written. Every
security-relevant quote below was independently re-verified a second time by
directly reading the file (not just trusting the research pass).

RESULT: no new IDOR gaps found. Every studentId/childId-bearing endpoint
this phase touches enforces guardian ownership via a live `guardians`-table
check, or is structurally scoped with no id param to attack in the first
place.

## 1. Attendance — `GET /attendance/students/:studentId/{summary,history}`

`apps/api/src/modules/attendance/attendance.controller.ts:76-94`,
`@Roles(Role.PARENT, ...TEACHER_AND_ABOVE)`. Both methods in
`student-attendance.service.ts` (`getStudentSummary`/`getStudentHistory`)
open with the identical guard:

```ts
if (callerRole === Role.PARENT && callerId) {
  const children = await this.tenantPrisma.query<{ student_id: string }>(
    `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
    callerId,
  );
  if (!children.some((c) => c.student_id === studentId)) {
    throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
  }
}
```

**SAFE.**

## 2. Results — `GET /exams/results/{student,report-card}/:studentId(/pdf)`

`apps/api/src/modules/examination/examination.controller.ts:208-243`,
`@Roles(Role.PARENT, ...TEACHER_AND_ABOVE)` on all three. All three funnel
through `ResultService`'s shared `assertGuardianOwnsStudent` (independently
re-read at `result.service.ts:322-330`):

```ts
private async assertGuardianOwnsStudent(studentId: string, callerId: string): Promise<void> {
  const children = await this.tenantPrisma.query<{ student_id: string }>(
    `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
    callerId,
  );
  if (!children.some((c) => c.student_id === studentId)) {
    throw new ForbiddenException('Access denied');
  }
}
```

`getReportCard` (which `buildReportCardPdf` calls internally — confirmed the
PDF route is not a separate, unguarded code path) additionally closes an
admission-number-guessing side channel for PARENT specifically: the route
accepts either a UUID or a human admission number for staff callers, but a
PARENT caller is rejected outright unless `studentId` is already UUID-shaped,
*before* the guardian check even runs (`result.service.ts:391-395`,
independently re-verified):

```ts
if (callerRole === Role.PARENT && callerId) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId);
  if (!isUuid) throw new ForbiddenException('Access denied');
  await this.assertGuardianOwnsStudent(studentId, callerId);
}
```

Both `getStudentResults` and `getReportCard` additionally gate PARENT (and
STUDENT) to `results_published_at IS NOT NULL` exam types only — the same
publish-boundary-as-privacy-gate pattern REP-1 established.

**SAFE.**

## 3. Timetable — `GET /timetable/section/:sectionId`

The exact route implicated in Phase 4's finding. Re-read the CURRENT full
body of `TimetableService.getSectionTimetable`
(`apps/api/src/modules/academic/timetable.service.ts:56-77`) to confirm the
Phase 4 STUDENT-branch fix didn't regress the PARENT branch — it didn't; the
fix was purely additive, inserted as a second `if` block after the existing
PARENT check, independently re-verified line-for-line against Phase 4's own
committed diff:

```ts
if (callerRole === Role.PARENT && callerId) {
  const enrollment = await this.tenantPrisma.query<{ id: string }>(
    `SELECT s.id FROM students s
     JOIN guardians g ON g.student_id = s.id
     WHERE g.user_id = $1::uuid AND s.section_id = $2::uuid AND s.deleted_at IS NULL`,
    callerId, sectionId,
  );
  if (!enrollment[0]) throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
}
if (callerRole === Role.STUDENT && callerId) { /* Phase 4's fix, untouched */ }
```

**How a parent gets a child's `sectionId`:** `GET /students/my-children`
(`student.controller.ts:77-80`, `@Roles(Role.PARENT)`, no id param — caller
resolved from `@CurrentUser()` only) →
`GuardianService.getMyChildren` (`guardian.service.ts:449-483`). Confirmed
the response DOES carry `sectionId` per child (`currentEnrollment.sectionId`,
`null` only if the child has no active class assignment) — no backend
change needed for this phase's timetable screen.

**SAFE.**

## 4. Notices

`ROLE_AUDIENCES['PARENT'] = ['ALL', 'PARENTS']`
(`apps/api/src/modules/communication/notice.service.ts:44-54`, re-confirmed
unchanged). List endpoint only — this phase's notices screen will render
`body` directly from the list response, same as Phase 4, so the known,
separately-tracked `GET /communication/notices/:id` audience-filtering gap
is never exercised. **SAFE** (no change from Phase 4's finding).

## 5. Assignments — `GET /assignments/my-children`

`apps/api/src/modules/assignment/assignment.controller.ts:53-57`,
`@Roles(Role.PARENT)`, **no id param at all** — the list of eligible
children (and their `class_id`/`section_id` used to filter assignments) is
computed server-side from a `guardians` JOIN on the caller's own
`user.userId`, never client-supplied
(`submission.service.ts:223-274`). There is structurally no id to attack.

Confirmed `POST /assignments/:id/submissions` (`assignment.controller.ts:
121-129`) is `@Roles(Role.STUDENT)` only — PARENT is excluded, matching the
locked spec ("view-only per the locked spec — submission is the student's
job, not the parent's"). Same for the presign and own-submission-lookup
routes.

**SAFE.**

## 6. Fees

- `GET /finance/students/:studentId/assignments`
  (`finance.controller.ts:125-133`, `@Roles(Role.PARENT, ...ACCOUNTANT_AND_ABOVE)`)
  and `GET /finance/reports/student/:studentId`
  (`finance.controller.ts:216-224`, same roles) both independently re-read
  and confirmed to open with the identical `guardians`-lookup guard as
  §1/§2/§5 above (`invoice.service.ts:449-463`,
  `report.service.ts:169-188`). **SAFE.**
- `GET /finance/payment-gateways` (`payment-gateways.controller.ts:34-41`)
  takes **zero parameters** — `getGateways()`, no `@Param`/`@Query`/
  `@CurrentUser`. **SAFE, structurally.**
- `GET /finance/payments/{esewa,khalti}/status/:transactionUuid`
  (`esewa.controller.ts:45-52`, `khalti.controller.ts:45-52`) — confirmed
  **`Role.PARENT` IS in `PAYER_ROLES`** for both. This is the phase brief's
  named hard exclusion: **not wired into any Phase 5 screen, full stop.**
  It is a GET that can finalize/credit a stuck transaction server-side — a
  role check alone doesn't make it safe to expose as a passive "view" click
  anywhere in the fees UI. No invoice-detail-by-id endpoint exists for
  parents either way; the fees screen renders from the array already
  returned by `getStudentLedger`, per the locked spec.

## 7. Leave request for child — `POST /attendance/leave` (write path)

Re-read the CURRENT full body of `LeaveService.applyLeave`
(`apps/api/src/modules/attendance/leave.service.ts:21-68`) to re-verify the
Session-20.5 claim still holds — it does, byte-for-byte:

```ts
} else if (callerRole === Role.PARENT) {
  if (!dto.studentId) throw new BadRequestException('studentId is required');
  const children = await this.tenantPrisma.query<{ student_id: string }>(
    `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
    appliedById,
  );
  const childIds = new Set(children.map((c) => c.student_id));
  if (!childIds.has(dto.studentId)) {
    throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
  }
  studentId = dto.studentId;
}
```

The verified `studentId` (not the raw `dto.studentId`) is what's passed into
the `INSERT INTO leave_applications` a few lines later — there is no path
from a PARENT request to an INSERT using an unverified id. The STUDENT
branch (sibling `if`) independently confirmed to still derive `studentId`
exclusively from `students WHERE user_id = appliedById`, never reading
`dto.studentId` for that role at all.

**SAFE.**

## Verdict

No backend fixes needed before building Phase 5's screens. Every
child-scoped read this phase needs is guardian-verified; the one write path
(leave request) is guardian-verified before the row is created; the one
named hazard (`payments/*/status/:transactionUuid`) is confirmed real and is
excluded from the UI by design, not by an assumption that never got checked.
