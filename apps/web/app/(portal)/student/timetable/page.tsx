'use client';

import { CalendarClock, Clock, GraduationCap } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useStudentMeProfile } from '@/lib/hooks/use-student-me';
import { useSectionTimetable } from '@/lib/hooks/use-academic';

/**
 * WEB-P Phase 4 Task 4 — student's own weekly timetable, VIEW-ONLY.
 *
 * `sectionId` comes exclusively from the student's own enrollment
 * (`GET /students/me` via Task 2's `useStudentMeProfile`) — never a route
 * param or user-suppliable value — and feeds `GET /timetable/section/:id`
 * (Task 1 hardened that route's STUDENT-role scoping: a student may only
 * ever resolve their own section's timetable; any other section's id now
 * 403s FORBIDDEN_SCOPE instead of leaking that section's real schedule).
 *
 * Deliberately NOT a reuse of `components/academic/timetable-grid.tsx` (the
 * admin's editable per-section grid — add/delete-slot dialogs + mutations
 * this read-only screen must not have). Mirrors that component's (and the
 * teacher portal's `components/timetable/my-timetable-grid.tsx`) actual
 * table structure instead — DAYS array keyed by day-of-week as a STRING
 * (`schedule` is `Record<string, TimetableSlot[]>`, confirmed against both
 * sibling files and `SectionTimetable` in types/api.types.ts), rows = the
 * period numbers actually present in the data (no fixed period count),
 * columns = Sun–Fri. Built as inline JSX rather than a new shared component
 * since this task's file scope is deliberately just this one page.
 */

// Sunday–Friday only. Saturday ("6") is never rendered as a column — no
// school that day, so an always-empty column would be pure noise.
const DAYS = [
  { key: '0', label: 'SUN' },
  { key: '1', label: 'MON' },
  { key: '2', label: 'TUE' },
  { key: '3', label: 'WED' },
  { key: '4', label: 'THU' },
  { key: '5', label: 'FRI' },
];

export default function StudentTimetablePage() {
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useStudentMeProfile();
  const sectionId = profile?.currentEnrollment?.sectionId;
  const {
    data: timetable,
    isLoading,
    isError,
    refetch,
  } = useSectionTimetable(sectionId ?? '');

  // sectionId only exists once the profile query resolves — the timetable
  // query correctly sits disabled (isLoading: false) until then, so without
  // folding profileLoading in here this screen would flash "no timetable"
  // for one frame before the real, gated fetch even starts.
  const loading = profileLoading || (!!sectionId && isLoading);

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

  const notEnrolled = !profile?.currentEnrollment;

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Timetable"
        description={
          timetable ? `${timetable.className} · ${timetable.sectionName}` : 'Your weekly class schedule'
        }
      />

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : profileError ? (
        <QueryErrorState onRetry={() => refetchProfile()} message="Couldn't load your profile." />
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} message="Couldn't load your timetable." />
      ) : notEnrolled || periods.length === 0 ? (
        <EmptyState
          message={
            notEnrolled
              ? "You're not enrolled in a section yet."
              : 'No timetable slots have been assigned to your section yet.'
          }
          icon={notEnrolled ? GraduationCap : CalendarClock}
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
