'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, CalendarDays, Users, ClipboardCheck, ArrowLeft,
} from 'lucide-react';
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
import { AttendanceGrid, type AttendanceGridRef } from '@/components/attendance/attendance-grid';
import { useSectionAttendance, useBulkMarkAttendance } from '@/lib/hooks/use-attendance';
import { useCurrentAcademicYear, useStudents, useClasses } from '@/lib/hooks/use-students';
import { useMySections } from '@/lib/hooks/use-timetable';

/**
 * WEB-P Phase 2 Task 2 — teacher-portal attendance marking screen.
 *
 * Reuses AttendanceGrid (components/attendance/attendance-grid.tsx) UNCHANGED
 * and the same data hooks the admin `/attendance/mark` page uses
 * (use-attendance.ts: useSectionAttendance/useBulkMarkAttendance;
 * use-students.ts: useCurrentAcademicYear/useStudents). This file is a new
 * page COMPOSITION around them for PortalShell's conventions, not a copy of
 * the admin page's layout.
 *
 * Section picker defaults to the teacher's own sections (useMySections,
 * Task 1) instead of admin's school-wide class→section cascade — a UX
 * default only, not a security boundary. Backend POST /attendance/students/
 * bulk deliberately allows any teacher to mark any section (accountability
 * via marked_by, not a permissions gate — see CLAUDE.md) — so a "browse all
 * classes" fallback (reusing the admin-style cascade) is offered and never
 * blocked.
 */

function offsetDate(adDate: string, days: number): string {
  const d = new Date(adDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function TeacherAttendancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sectionId = searchParams.get('sectionId') ?? '';
  const today = new Date().toISOString().split('T')[0];
  const date = searchParams.get('date') ?? today;

  const gridRef = useRef<AttendanceGridRef>(null);
  // Guards the "auto-pick the only section" effect so it fires at most once
  // per page load — a deliberate "Change Section" click (which clears
  // sectionId on the same mounted component) must not bounce the teacher
  // straight back if they actually want the "Browse all classes" fallback.
  const autoSelectedRef = useRef(false);

  const {
    data: mySections,
    isLoading: mySectionsLoading,
    isError: mySectionsError,
    refetch: refetchMySections,
  } = useMySections();

  const { data: academicYear } = useCurrentAcademicYear();
  const { data: classes } = useClasses();

  // "Browse all classes" fallback picker state (admin-style class→section
  // cascade), collapsed by default.
  const [showBrowseAll, setShowBrowseAll] = useState(false);
  const [pickClassId, setPickClassId] = useState('');
  const [pickSectionId, setPickSectionId] = useState('');
  const pickSections = classes?.find((c) => c.id === pickClassId)?.sections ?? [];

  useEffect(() => {
    if (autoSelectedRef.current || sectionId) return;
    if (mySections && mySections.length === 1) {
      autoSelectedRef.current = true;
      router.replace(`/teacher/attendance?sectionId=${mySections[0].sectionId}&date=${today}`);
    }
  }, [sectionId, mySections, today, router]);

  const { data: studentsRes, isLoading: studentsLoading } = useStudents({
    sectionId: sectionId || undefined,
    status: 'ACTIVE',
    limit: 100,
  });
  const students = studentsRes?.data?.data ?? [];

  // Resolve the class/section names for display — check the teacher's own
  // sections first, then fall back to the full class list (covers a section
  // reached via "Browse all classes").
  const sectionInfo = useMemo(() => {
    const own = mySections?.find((s) => s.sectionId === sectionId);
    if (own) return { className: own.className, sectionName: own.sectionName };
    for (const c of classes ?? []) {
      const sec = c.sections?.find((s) => s.id === sectionId);
      if (sec) return { className: c.name, sectionName: sec.name };
    }
    return null;
  }, [mySections, classes, sectionId]);

  const { data: existingRecords, isLoading: recordsLoading } = useSectionAttendance(
    sectionId,
    date,
    academicYear?.id,
  );

  const mutation = useBulkMarkAttendance();

  function navigate(direction: -1 | 1) {
    const newDate = offsetDate(date, direction);
    router.push(`/teacher/attendance?sectionId=${sectionId}&date=${newDate}`);
  }

  async function handleSubmit() {
    if (!academicYear) {
      toast.error('No active academic year found');
      return;
    }

    const records = gridRef.current?.getRecords() ?? [];

    if (records.length === 0) {
      toast.error('Please mark attendance for at least one student');
      return;
    }

    try {
      await mutation.mutateAsync({
        sectionId,
        academicYearId: academicYear.id,
        date,
        records,
      });
      toast.success('Attendance saved successfully');
    } catch {
      toast.error('Failed to save attendance. Please try again.');
    }
  }

  // ── Step 1: no section chosen yet → pick from my sections (or browse) ──────
  if (!sectionId) {
    return (
      <div>
        <PageHeader
          title="Mark Attendance"
          description="Pick one of your sections to record today's attendance"
        />

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            My Sections
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            <BsDate date={today} showAd />
          </p>

          {mySectionsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : mySectionsError ? (
            <QueryErrorState onRetry={() => refetchMySections()} />
          ) : mySections && mySections.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mySections.map((sec) => (
                <button
                  key={sec.sectionId}
                  onClick={() =>
                    router.push(`/teacher/attendance?sectionId=${sec.sectionId}&date=${today}`)
                  }
                  className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-700 dark:hover:bg-brand-500/[0.06]"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12]">
                    <Users className="h-4 w-4 text-brand-500 dark:text-brand-400" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-800 dark:text-white">
                      {sec.className} {sec.sectionName}
                    </span>
                    <span className="block text-xs text-gray-400 dark:text-gray-500">
                      Mark today&apos;s attendance
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState message="You have no sections assigned yet." icon={Users} />
          )}
        </div>

        {/* Fallback: browse any class/section school-wide. The backend
            deliberately allows any teacher to mark any section — accountability
            lives in marked_by, not this picker — so this is never blocked. */}
        <div className="mt-4">
          {!showBrowseAll ? (
            <button
              onClick={() => setShowBrowseAll(true)}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              Not one of your sections? Browse all classes →
            </button>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
              <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white">
                Browse all classes
              </h4>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Class</label>
                  <Select
                    value={pickClassId}
                    onValueChange={(v) => {
                      if (!v) return;
                      setPickClassId(v);
                      setPickSectionId('');
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <span className={pickClassId ? '' : 'text-gray-400'}>
                        {pickClassId
                          ? (classes?.find((c) => c.id === pickClassId)?.name ?? 'Loading…')
                          : 'Select class'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {classes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Section</label>
                  <Select
                    value={pickSectionId}
                    onValueChange={(v) => {
                      if (v) setPickSectionId(v);
                    }}
                    disabled={!pickClassId}
                  >
                    <SelectTrigger className="w-40">
                      <span className={pickSectionId ? '' : 'text-gray-400'}>
                        {pickSectionId
                          ? (pickSections.find((s) => s.id === pickSectionId)?.name ?? 'Loading…')
                          : 'Section'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {pickSections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="bg-brand-500 text-white hover:bg-brand-600"
                  disabled={!pickSectionId}
                  onClick={() =>
                    router.push(`/teacher/attendance?sectionId=${pickSectionId}&date=${today}`)
                  }
                >
                  <ClipboardCheck className="mr-1.5 h-4 w-4" />
                  Mark Attendance
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: section chosen → marking grid ───────────────────────────────
  const isLoading = studentsLoading || recordsLoading;
  const isNextDisabled = date >= today;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Mark Attendance" description="Record daily student attendance" />
        <Button variant="ghost" size="sm" onClick={() => router.push('/teacher/attendance')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Change Section
        </Button>
      </div>

      {/* Context toolbar: which section + which date is being marked */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <div className="text-base font-semibold text-gray-800 dark:text-white">
                {sectionInfo ? (
                  <>
                    {sectionInfo.className}
                    <span className="mx-1.5 text-gray-300 dark:text-gray-600">/</span>
                    Section {sectionInfo.sectionName}
                  </>
                ) : (
                  'Section'
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {students.length} active {students.length === 1 ? 'student' : 'students'}
              </div>
            </div>
          </div>

          {/* Date navigation — mirrors the admin /attendance/mark page exactly:
              AD date in the URL, prev/next ±1 day, next disabled at today,
              BsDate for display. */}
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex min-w-[170px] items-center justify-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-white">
              <CalendarDays className="h-4 w-4 text-brand-500" />
              <BsDate date={date} showAd />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate(1)}
              disabled={isNextDisabled}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState message="No active students found in this section." icon={Users} />
      ) : (
        <>
          <AttendanceGrid
            key={`${sectionId}-${date}`}
            ref={gridRef}
            students={students.map((s) => ({
              studentId: s.id,
              fullName: s.fullName,
              admissionNumber: s.studentId,
              rollNumber: s.rollNumber ?? null,
            }))}
            existingRecords={existingRecords ?? undefined}
          />

          <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-theme-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Review the marks above, then save for{' '}
              {sectionInfo ? `${sectionInfo.className} / Section ${sectionInfo.sectionName}` : 'this section'}.
            </p>
            <Button
              className="min-w-[150px] bg-brand-500 text-white hover:bg-brand-600"
              onClick={handleSubmit}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving…' : 'Save Attendance'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
