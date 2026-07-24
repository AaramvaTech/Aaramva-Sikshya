'use client';

import { useMemo } from 'react';
import { CalendarClock, GraduationCap } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TimetableGrid, type NormalizedTimetableSlot } from '@/components/timetable/timetable-grid';
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
 * WEB-P timetable UX pass (2026-07-24): renders via the shared
 * `TimetableGrid` (subject colors, today/now highlighting) instead of an
 * inline `<table>` — the only page-specific work left here is normalizing
 * `TimetableSlot` into the grid's common slot shape (subtitle =
 * teacher.fullName).
 */

// Sunday–Friday only. Saturday ("6") is never rendered as a column — no
// school that day, so an always-empty column would be pure noise.
const DAY_KEYS = ['0', '1', '2', '3', '4', '5'];

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

  const hasAnySlots = timetable
    ? DAY_KEYS.some((key) => (timetable.schedule[key] ?? []).length > 0)
    : false;

  const normalizedSchedule = useMemo<Record<string, NormalizedTimetableSlot[]>>(() => {
    if (!timetable) return {};
    const result: Record<string, NormalizedTimetableSlot[]> = {};
    for (const [dayKey, slots] of Object.entries(timetable.schedule)) {
      result[dayKey] = slots.map((slot) => ({
        slotId: slot.slotId,
        periodNumber: slot.periodNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        subjectId: slot.subject.id,
        subjectName: slot.subject.name,
        subtitle: slot.teacher.fullName,
        room: slot.room,
      }));
    }
    return result;
  }, [timetable]);

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
      ) : notEnrolled || !hasAnySlots ? (
        <EmptyState
          message={
            notEnrolled
              ? "You're not enrolled in a section yet."
              : 'No timetable slots have been assigned to your section yet.'
          }
          icon={notEnrolled ? GraduationCap : CalendarClock}
        />
      ) : (
        <TimetableGrid schedule={normalizedSchedule} />
      )}
    </div>
  );
}
