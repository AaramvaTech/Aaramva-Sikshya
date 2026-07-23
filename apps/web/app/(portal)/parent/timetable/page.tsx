'use client';

import { CalendarClock, Clock, GraduationCap, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ChildSwitcher } from '@/components/parent/child-switcher';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { useSectionTimetable } from '@/lib/hooks/use-academic';

/**
 * WEB-P Phase 5 Task 5 — parent's per-child weekly timetable, VIEW-ONLY.
 * HIGHEST SCRUTINY screen this phase: calls `GET /timetable/section/:sectionId`,
 * the exact route Phase 4 found and fixed a STUDENT-branch IDOR gap in.
 *
 * Independent re-verification (done before writing this file, by reading
 * `apps/api/src/modules/academic/timetable.service.ts` directly — not by
 * trusting `docs/web/phase-5-idor-audit.md` §3, which was only read
 * afterward to cross-check): `getSectionTimetable`'s `Role.PARENT` branch
 * (lines 57-66) runs a real ownership check —
 *
 *   SELECT s.id FROM students s
 *   JOIN guardians g ON g.student_id = s.id
 *   WHERE g.user_id = $1::uuid AND s.section_id = $2::uuid AND s.deleted_at IS NULL
 *
 * — and throws ForbiddenException(errorBody('FORBIDDEN_SCOPE')) when no row
 * matches. This check sits at the very top of the method, before the single
 * unconditional `timetable_slots` SELECT that produces the response for
 * every caller (PARENT, STUDENT, and staff roles alike) — there is no
 * PARENT-reachable path through this function that returns slot data
 * without first passing that guard. The audit doc matched exactly; no
 * gap found, nothing to block on.
 *
 * `sectionId` comes EXCLUSIVELY from the selected child's own enrollment
 * (`GET /students/my-children` via `useSelectedChild()` → `useMyChildren()`)
 * — never a route param, never user-typed, never any other source. The
 * server re-verifies guardianship of that exact sectionId regardless, but
 * the UI must not undermine that by offering any way to request a
 * different one.
 *
 * Table structure (period-rows x day-columns) ported verbatim in shape from
 * Phase 4's `app/(portal)/student/timetable/page.tsx` — the established,
 * review-confirmed convention — and made per-child via `ChildSwitcher`/
 * `useSelectedChild()` the same way Task 4's attendance screen already is.
 */

// Sunday-Friday only. Saturday ("6") is never rendered as a column — no
// school that day, so an always-empty column would be pure noise. Matches
// the student timetable page's convention exactly.
const DAYS = [
  { key: '0', label: 'SUN' },
  { key: '1', label: 'MON' },
  { key: '2', label: 'TUE' },
  { key: '3', label: 'WED' },
  { key: '4', label: 'THU' },
  { key: '5', label: 'FRI' },
];

export default function ParentTimetablePage() {
  const {
    children,
    selectedChildId,
    selectedChild,
    isLoading: childrenLoading,
    isError: childrenError,
  } = useSelectedChild();

  // The ONLY source for sectionId — never a route param, never user input.
  const sectionId = selectedChild?.currentEnrollment?.sectionId ?? '';

  const {
    data: timetable,
    isLoading: timetableLoading,
    isError: timetableError,
    refetch: refetchTimetable,
  } = useSectionTimetable(sectionId);

  const header = (
    <PageHeader
      title="Timetable"
      description={
        timetable ? `${timetable.className} · ${timetable.sectionName}` : "Your child's weekly class schedule"
      }
      action={<ChildSwitcher />}
    />
  );

  // ── State (a): children still loading ─────────────────────────────────
  if (childrenLoading) {
    return (
      <div className="space-y-5">
        {header}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (childrenError) {
    return (
      <div className="space-y-5">
        {header}
        <QueryErrorState message="Couldn't load your children." />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="space-y-5">
        {header}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <EmptyState message="No children are linked to your account yet." icon={Users} />
        </div>
      </div>
    );
  }

  if (!selectedChildId || !selectedChild) {
    // Children have loaded but useSelectedChild()'s effect hasn't picked a
    // default child yet (one-render window) — show a skeleton, never fire
    // the timetable query with an empty-string sectionId.
    return (
      <div className="space-y-5">
        {header}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── State (b): selected child has no currentEnrollment at all ─────────
  const notEnrolled = !selectedChild.currentEnrollment;

  // ── State (d): the timetable query's own error state, surfaced (not
  //    swallowed — the exact bug Phase 4's review caught on the student
  //    screen). Checked before the "loading" / "no slots" branches below so
  //    a genuine backend outage can never misrender as either empty state.
  if (!notEnrolled && timetableError) {
    return (
      <div className="space-y-5">
        {header}
        <QueryErrorState onRetry={() => refetchTimetable()} message="Couldn't load this child's timetable." />
      </div>
    );
  }

  const loading = !notEnrolled && timetableLoading;

  // Collect the distinct period numbers actually present across Sun–Fri —
  // there's no fixed period count, so only rows that exist in the data render.
  const periodSet = new Set<number>();
  DAYS.forEach(({ key }) => {
    (timetable?.schedule[key] ?? []).forEach((slot) => periodSet.add(slot.periodNumber));
  });
  const periods = Array.from(periodSet).sort((a, b) => a - b);

  const slotMap = new Map<string, NonNullable<typeof timetable>['schedule'][string][number]>();
  DAYS.forEach(({ key }) => {
    (timetable?.schedule[key] ?? []).forEach((slot) => {
      slotMap.set(`${slot.periodNumber}-${key}`, slot);
    });
  });

  return (
    <div className="space-y-5">
      {header}

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : notEnrolled ? (
        // ── State (b): not enrolled in a section ──────────────────────
        <EmptyState
          message={`${selectedChild.firstName} is not enrolled in a section yet.`}
          icon={GraduationCap}
        />
      ) : periods.length === 0 ? (
        // ── State (c): enrolled, but zero timetable slots — a DIFFERENT
        //    empty state from (b), never the same copy. ────────────────
        <EmptyState
          message="No timetable has been published for this section yet."
          icon={CalendarClock}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="w-20 border-r border-gray-200 px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  Period
                </th>
                {DAYS.map((day) => (
                  <th
                    key={day.key}
                    className="min-w-[150px] px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {periods.map((period) => (
                <tr key={period} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                  <td className="border-r border-gray-200 px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    P{period}
                  </td>
                  {DAYS.map((day) => {
                    const slot = slotMap.get(`${period}-${day.key}`);
                    return (
                      <td key={day.key} className="px-2 py-2 text-center align-top">
                        {slot ? (
                          <div className="w-full rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-left dark:border-brand-500/20 dark:bg-brand-500/[0.08]">
                            <p className="truncate text-xs font-semibold text-brand-600 dark:text-brand-400">
                              {slot.subject.name}
                            </p>
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                              {slot.teacher.fullName}
                              {slot.room ? ` · ${slot.room}` : ''}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                              <Clock className="h-3 w-3" />
                              {slot.startTime} – {slot.endTime}
                            </p>
                          </div>
                        ) : (
                          <div className="h-12 w-full rounded-md border border-dashed border-gray-200 dark:border-gray-800" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
