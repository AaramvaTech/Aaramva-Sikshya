'use client';

import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { MyTimetableGrid } from '@/components/timetable/my-timetable-grid';
import { useMyTimetable } from '@/lib/hooks/use-timetable';

/**
 * WEB-P Phase 3 Task 3 — teacher's own weekly timetable, VIEW-ONLY.
 *
 * Desktop-optimized weekly grid (not a mobile-style day selector) built
 * around `TeacherTimetable` (one teacher, many sections) via
 * `MyTimetableGrid` — see that file's header comment for why it's a new
 * component rather than a reuse of the admin's per-section editable grid.
 * Data comes entirely from the already-existing `useMyTimetable()` hook
 * (Phase 2 Task 1) — no new API method or hook needed.
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
        <MyTimetableGrid timetable={timetable} />
      )}
    </div>
  );
}
