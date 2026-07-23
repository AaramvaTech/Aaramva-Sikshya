WEB-P Phase 3 — ownership verification findings (timetable + payroll)

This note captures the two ownership checks the phase brief asked to be
confirmed before building anything, written to a file per the standing
instruction to put verbatim findings here instead of relying on chat relay.

1. Own timetable — GET /timetable/my — SAFE, build as planned

apps/api/src/modules/academic/timetable.controller.ts declares two routes
before the parameterised admin routes:

    @Get('my/sections')
    @Roles(...TEACHER_AND_ABOVE)
    getMySections(@CurrentUser() user: AuthUser) {
      return this.timetableService.getMySections(user.userId);
    }

    @Get('my')
    @Roles(...TEACHER_AND_ABOVE)
    getMyTimetable(@CurrentUser() user: AuthUser) {
      return this.timetableService.getMyTimetable(user.userId);
    }

Both take the id exclusively from @CurrentUser() — there is no path or query
parameter a caller could substitute. In timetable.service.ts,
getMyTimetable(userId) is a one-line pass-through:

    async getMyTimetable(userId: string): Promise<TeacherTimetableDto> {
      return this.getTeacherTimetable(userId);
    }

This is the exact situation the brief asked me to check for: /timetable/my
internally reuses getTeacherTimetable, the same function that backs the
unchecked GET /timetable/teacher/:teacherId (the route named in
WEB-P-PORTAL.md §7 as needing a fix before any UI calls it with an arbitrary
id). Reusing the query logic is not the same as reusing the vulnerability,
though: getTeacherTimetable itself has no ownership check because it was
never meant to enforce one — the check belongs at the call site, based on
where the id argument came from. The /timetable/teacher/:teacherId route is
unsafe because its id comes from a client-supplied path parameter with
nothing stopping a caller from naming someone else's id. The /timetable/my
route is safe because its id is hardcoded server-side from the caller's own
JWT before getTeacherTimetable is ever called — there is no code path by
which a request to /timetable/my can supply anyone's id but the caller's
own. Confirmed: /timetable/my does not need the §7 fix, and Phase 3 can
build the timetable screen against it exactly as the brief said.

2. Own payroll history — GET /hr/payroll/staff/:userId/history — SAFE, build as planned

Unlike timetable/my, this route DOES accept an arbitrary path parameter:

    // BUG-2: any staff member may reach this route to read their OWN history; the
    // service-level self-or-admin check (assertSelfOrHrAdmin) restricts to own /
    // admin / principal. Widened from ACCOUNTANT_AND_ABOVE so a teacher can read
    // their own salary history (route guard previously blocked them outright).
    @Get('payroll/staff/:userId/history')
    @Roles(...TEACHER_AND_ABOVE)
    getStaffSalaryHistory(
      @Param('userId', ParseUUIDPipe) userId: string,
      @CurrentUser() user: AuthUser,
    ) {
      return this.payrollService.getStaffSalaryHistory(userId, user.userId, user.role);
    }

The ownership enforcement lives one layer down, in payroll.service.ts:

    async getStaffSalaryHistory(
      userId: string,
      callerId?: string,
      callerRole?: Role,
    ): Promise<SalarySlipResponseDto[]> {
      // BUG-2: HR confidentiality — only the staff member themselves, or an
      // admin/principal, may read salary history. Peers (incl. teachers) rejected.
      assertSelfOrHrAdmin(userId, callerId, callerRole);
      ...

assertSelfOrHrAdmin (hr-access.util.ts) is the same shared utility already
confirmed safe for the leave-balance endpoint in the phase brief:

    export function assertSelfOrHrAdmin(targetUserId, callerId, callerRole): void {
      if (callerRole && HR_READ_ANY.includes(callerRole)) return;
      if (callerId && callerId === targetUserId) return;
      throw new ForbiddenException(
        'You may only view your own HR records unless you are an admin or principal',
      );
    }

A teacher passing another teacher's userId gets a real 403 — this is not a
route-guard-only check, it is enforced against the actual caller identity
from the JWT (callerId), independent of whatever userId is in the URL.
Confirmed safe to ship: the frontend will always pass the logged-in
teacher's own user.id, and even if that were tampered with client-side, the
backend rejects it.

One data-shape limitation worth flagging (not a security issue, a display
one): SalarySlipResponseDto has no monthBs/yearBs field — the SQL joins
payroll_months only to ORDER BY fiscal month/year, it never selects pm's
columns into the response. GET /hr/payroll/months (the endpoint that could
resolve payrollMonthId to a human month label) is ACCOUNTANT_AND_ABOVE only,
so the teacher payroll screen cannot look up a month label either. The
screen will show slips in the backend's guaranteed order (most recent
fiscal month first) using createdAt as the visible date, since there is no
other date field reliably populated (payment_date/payment_method are never
written anywhere in payroll.service.ts, so they are effectively always
null today). This is a pure frontend build with no backend changes in
scope for this phase, so the screen is built around this limitation rather
than fixing it.
