'use client';

import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TimetableGrid, type NormalizedTimetableSlot } from '@/components/timetable/timetable-grid';
import { useMyTimetable } from '@/lib/hooks/use-timetable';

/**
 * WEB-P Phase 3 Task 3 — teacher's own weekly timetable, VIEW-ONLY.
 *
 * Desktop-optimized weekly grid built around `TeacherTimetable` (one
 * teacher, many sections). WEB-P timetable UX pass (2026-07-24): now
 * renders via the shared `TimetableGrid` (subject colors, today/now
 * highlighting) instead of the retired per-role `MyTimetableGrid` — the
 * only page-specific work left here is normalizing `TeacherSlotItem` into
 * the grid's common slot shape (subtitle = "{className} {section}").
 * Data still comes entirely from the already-existing `useMyTimetable()`
 * hook (Phase 2 Task 1) — no new API method or hook needed.
 */
export default function TeacherTimetablePage() {
  const {
    data: timetable,
    isLoading,
    isError,
    refetch,
  } = useMyTimetable();

  // "Any period at all, Sun–Fri" — Saturday ("6") never counts since it's
  // never rendered by the grid either.
  const hasAnySlots = timetable
    ? Object.entries(timetable.schedule).some(
        ([key, slots]) => key !== '6' && slots.length > 0,
      )
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
        subtitle: `${slot.className} ${slot.section}`,
        room: slot.room,
      }));
    }
    return result;
  }, [timetable]);

  return (
    <div>
      <PageHeader
        title="My Timetable"
        description="Your weekly teaching schedule across all assigned sections"
      />

      {isLoading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : !timetable || !hasAnySlots ? (
        <EmptyState
          message="No timetable slots have been assigned to you yet."
          icon={CalendarClock}
        />
      ) : (
        <TimetableGrid schedule={normalizedSchedule} />
      )}
    </div>
  );
}
