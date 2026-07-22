'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ClipboardList, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BsDate } from '@/components/shared/bs-date';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { MarksGrid, type MarksGridRef } from '@/components/exams/marks-grid';
import { useMySchedules, useMarksForSchedule, useBulkEnterMarks } from '@/lib/hooks/use-examination';
import { useStudents } from '@/lib/hooks/use-students';
import type { MarkRecord } from '@/types/api.types';

/**
 * WEB-P Phase 2 Task 3 — teacher-portal marks entry screen.
 *
 * Reuses MarksGrid (components/exams/marks-grid.tsx) UNCHANGED — same
 * component the admin `/exams/marks` page uses. The picker is deliberately
 * different from admin's: instead of a 3-step Exam Type -> Class -> Schedule
 * cascade over GET /exams/schedules (school-wide), this uses
 * GET /exams/schedules/my (useMySchedules), which is already server-side
 * scoped to exactly the (class, subject) pairs the calling teacher's
 * timetable slots cover, and already joined with
 * examTypeName/subjectName/className — so the picker can be a single flat
 * list of "my schedules", optionally narrowed by an exam-type filter.
 *
 * Exam schedules are class-wide, not section-wide (exam_schedules has no
 * section_id column) — so, matching admin's page exactly, the roster is
 * every ACTIVE student in the schedule's className (all sections of that
 * class), not scoped to any one section.
 *
 * IMPORTANT: POST /exams/marks/bulk deliberately allows any teacher to enter
 * marks for any schedule (accountability lives in entered_by, not a
 * permissions gate — see CLAUDE.md). Scoping the picker to useMySchedules()
 * is a UX convenience only; no extra check is added on top of it.
 *
 * Post-review fix: `selectedSchedule` (and the `className` roster filter
 * derived from it) resolves asynchronously via useMySchedules(), same as
 * `scheduleId` from the URL — a fresh load of /teacher/marks?scheduleId=X
 * (bookmark, shared link, or plain refresh, not just tampering) starts both
 * queries cold. useStudents is gated with `enabled: !!selectedSchedule` so it
 * cannot fire against an unresolved (undefined) className before the schedule
 * lookup settles — closing a race where MarksGrid could otherwise mount once
 * against a wrong, unfiltered roster and never reconcile (MarksGrid's `rows`
 * Map is seeded once from its `students` prop; it only ever re-reconciles
 * against a later `existingMarks` prop, not a later `students` prop). A
 * distinct "schedule not found" state now covers a resolved-but-missing
 * scheduleId instead of silently falling through with a fake fullMarks
 * default.
 */
export default function TeacherMarksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scheduleId = searchParams.get('scheduleId') ?? '';

  const gridRef = useRef<MarksGridRef>(null);
  const [examTypeFilter, setExamTypeFilter] = useState('');

  // Unfiltered baseline, used only to populate the exam-type filter's
  // options — so narrowing the filter never makes an exam type the teacher
  // actually has schedules for disappear from the dropdown.
  const { data: allSchedules } = useMySchedules();

  const {
    data: schedules,
    isLoading: schedulesLoading,
    isError: schedulesError,
    refetch: refetchSchedules,
  } = useMySchedules(examTypeFilter || undefined);

  const selectedSchedule = schedules?.find((s) => s.id === scheduleId);

  const examTypeOptions = useMemo(() => {
    const map = new Map<string, string>();
    (allSchedules ?? []).forEach((s) => map.set(s.examTypeId, s.examTypeName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allSchedules]);

  // Filter by class name (not UUID), same quirk as admin's /exams/marks page
  // — exam schedules are class-wide, and this is the field useStudents
  // matches reliably even for students whose class_id is NULL.
  //
  // GOTCHA (fixed post-review): `className` here depends on `selectedSchedule`,
  // which itself depends on the async `useMySchedules()` lookup above. On a
  // fresh load of /teacher/marks?scheduleId=X (a bookmark, a shared link, or
  // a plain refresh — not just URL tampering), useStudents and useMySchedules
  // both start cold. Without a gate, useStudents could fire once with
  // className: undefined before schedules resolves, pulling an unrelated,
  // unfiltered roster — and MarksGrid's internal `rows` Map (seeded once on
  // mount from its `students` prop) would stay keyed off that wrong list even
  // after the real roster arrives, since MarksGrid only re-reconciles `rows`
  // against a later `existingMarks` prop, never against a later `students`
  // prop. `enabled: !!selectedSchedule` keeps this query off entirely until
  // the schedule is actually resolved, so MarksGrid never mounts against a
  // stale/wrong roster in the first place.
  const { data: studentsRes, isLoading: studentsLoading } = useStudents(
    {
      className: selectedSchedule?.className,
      status: 'ACTIVE',
      limit: 100,
    },
    { enabled: !!selectedSchedule },
  );
  const enrolledStudents = studentsRes?.data?.data ?? [];

  // Existing marks for pre-population only (studentId + marks fields, no student info)
  const { data: existingMarks, isLoading: marksLoading } = useMarksForSchedule(scheduleId);

  const bulkEnterMarks = useBulkEnterMarks();

  const gridStudents: MarkRecord[] = enrolledStudents.map((s) => ({
    studentId: s.id,
    studentName: s.fullName,
    admissionNumber: s.studentId,
    rollNumber: s.rollNumber ?? null,
    marksObtained: null,
    isAbsent: false,
    remarks: null,
  }));

  async function handleSave() {
    if (!scheduleId) return;
    const marks = gridRef.current?.getMarks() ?? [];
    if (!marks.length) {
      toast.error('No marks to save');
      return;
    }
    try {
      await bulkEnterMarks.mutateAsync({ examScheduleId: scheduleId, marks });
      toast.success('Marks saved successfully');
    } catch {
      toast.error('Failed to save marks. Please try again.');
    }
  }

  // ── Step 1: no schedule chosen yet → pick from my schedules ────────────────
  if (!scheduleId) {
    return (
      <div>
        <PageHeader
          title="Enter Marks"
          description="Pick one of your exam schedules to record marks"
        />

        {examTypeOptions.length > 1 && (
          <div className="mb-4 flex items-center gap-3">
            <div className="w-52">
              <Select
                value={examTypeFilter}
                onValueChange={(v) => {
                  if (v) setExamTypeFilter(v);
                }}
              >
                <SelectTrigger>
                  <span className={examTypeFilter ? '' : 'text-gray-400'}>
                    {examTypeFilter
                      ? (examTypeOptions.find((et) => et.id === examTypeFilter)?.name ?? 'Loading…')
                      : 'Filter by exam type'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {examTypeOptions.map((et) => (
                    <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {examTypeFilter && (
              <button
                onClick={() => setExamTypeFilter('')}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            My Exam Schedules
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            Schedules for the classes and subjects on your timetable
          </p>

          {schedulesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : schedulesError ? (
            <QueryErrorState onRetry={() => refetchSchedules()} />
          ) : schedules && schedules.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {schedules.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/teacher/marks?scheduleId=${s.id}`)}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-700 dark:hover:bg-brand-500/[0.06]"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12]">
                    <ClipboardList className="h-4 w-4 text-brand-500 dark:text-brand-400" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-800 dark:text-white">
                      {s.subjectName} · {s.className}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-400 dark:text-gray-500">
                      {s.examTypeName} · <BsDate date={s.examDate} showAd /> · Full Marks {s.fullMarks}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              message="No exam schedules found for your classes yet."
              icon={ClipboardList}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: schedule chosen → marks grid ────────────────────────────────────
  const changeScheduleButton = (
    <Button variant="ghost" size="sm" onClick={() => router.push('/teacher/marks')}>
      <ArrowLeft className="mr-1 h-4 w-4" />
      Change Schedule
    </Button>
  );

  // The schedule list (useMySchedules) is itself still resolving — hold off
  // on rendering anything that depends on `selectedSchedule` (including the
  // toolbar and the useStudents-fed grid below) until it settles. Prevents
  // the stale-roster race the fix above is closing at the query level too.
  if (schedulesLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Enter Marks" description="Record exam marks for students" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
        </div>
      </div>
    );
  }

  if (schedulesError) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader title="Enter Marks" description="Record exam marks for students" />
          {changeScheduleButton}
        </div>
        <QueryErrorState onRetry={() => refetchSchedules()} />
      </div>
    );
  }

  // Schedules finished loading and this scheduleId isn't in the list — a
  // stale, foreign, or mistyped id (e.g. an old bookmark to a since-deleted
  // schedule). Show this explicitly rather than falling through to the grid
  // with `selectedSchedule` undefined and a fake default fullMarks of 100.
  if (!selectedSchedule) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader title="Enter Marks" description="Record exam marks for students" />
          {changeScheduleButton}
        </div>
        <EmptyState
          message="This exam schedule wasn't found. The link may be out of date, or the schedule may no longer be assigned to you."
          icon={ClipboardList}
        />
      </div>
    );
  }

  // Below this point `selectedSchedule` is guaranteed resolved, so
  // useStudents (gated on `enabled: !!selectedSchedule` above) is now safe
  // to have fired with the correct className.
  const isGridLoading = studentsLoading || marksLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Enter Marks" description="Record exam marks for students" />
        {changeScheduleButton}
      </div>

      {/* Context toolbar: which schedule is being marked */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <ListChecks className="h-5 w-5" />
            </span>
            <div>
              <div className="text-base font-semibold text-gray-800 dark:text-white">
                {selectedSchedule.subjectName}
                <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
                {selectedSchedule.className}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {enrolledStudents.length} active {enrolledStudents.length === 1 ? 'student' : 'students'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-brand-500">{selectedSchedule.examTypeName}</span>
            <span><BsDate date={selectedSchedule.examDate} showAd /></span>
            <span>Full Marks: <strong>{selectedSchedule.fullMarks}</strong></span>
            <span>Pass Marks: <strong>{selectedSchedule.passMarks}</strong></span>
          </div>
        </div>
      </div>

      {isGridLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
        </div>
      ) : enrolledStudents.length === 0 ? (
        <EmptyState message="No active students found in this class." icon={ClipboardList} />
      ) : (
        <>
          <MarksGrid
            key={scheduleId}
            ref={gridRef}
            students={gridStudents}
            fullMarks={selectedSchedule.fullMarks}
            existingMarks={existingMarks}
          />

          <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-theme-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Review the marks above, then save for {selectedSchedule.subjectName} · {selectedSchedule.className}.
            </p>
            <Button
              className="min-w-[150px] bg-brand-500 text-white hover:bg-brand-600"
              onClick={handleSave}
              disabled={bulkEnterMarks.isPending}
            >
              {bulkEnterMarks.isPending ? 'Saving…' : 'Save Marks'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
