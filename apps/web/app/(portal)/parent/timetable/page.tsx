'use client';

import { useMemo } from 'react';
import { CalendarClock, GraduationCap, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TimetableGrid, type NormalizedTimetableSlot } from '@/components/timetable/timetable-grid';
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
 * WEB-P timetable UX pass (2026-07-24): renders via the shared
 * `TimetableGrid` (subject colors, today/now highlighting) instead of an
 * inline `<table>` — the only page-specific work left here is normalizing
 * `TimetableSlot` into the grid's common slot shape (subtitle =
 * teacher.fullName), identical to the student page's normalization.
 */

// Sunday-Friday only. Saturday ("6") is never rendered as a column — no
// school that day, so an always-empty column would be pure noise. Matches
// the student timetable page's convention exactly.
const DAY_KEYS = ['0', '1', '2', '3', '4', '5'];

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

  const header = (
    <PageHeader
      title="Timetable"
      description={
        timetable ? `${timetable.className} · ${timetable.sectionName}` : "Your child's weekly class schedule"
      }
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
  const hasAnySlots = timetable ? DAY_KEYS.some((key) => (timetable.schedule[key] ?? []).length > 0) : false;

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
      ) : !hasAnySlots ? (
        // ── State (c): enrolled, but zero timetable slots — a DIFFERENT
        //    empty state from (b), never the same copy. ────────────────
        <EmptyState
          message="No timetable has been published for this section yet."
          icon={CalendarClock}
        />
      ) : (
        <TimetableGrid schedule={normalizedSchedule} />
      )}
    </div>
  );
}
