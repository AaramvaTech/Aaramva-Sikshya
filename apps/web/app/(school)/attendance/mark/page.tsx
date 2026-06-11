'use client';

import { useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, ArrowLeft, CalendarDays, Users, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
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

function offsetDate(adDate: string, days: number): string {
  const d = new Date(adDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function AttendanceMarkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sectionId = searchParams.get('sectionId') ?? '';
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const gridRef = useRef<AttendanceGridRef>(null);

  const { data: academicYear } = useCurrentAcademicYear();
  const { data: classes } = useClasses();

  // Picker state — used when no section has been chosen yet.
  const [pickClassId, setPickClassId] = useState('');
  const [pickSectionId, setPickSectionId] = useState('');
  const pickSections = classes?.find((c) => c.id === pickClassId)?.sections ?? [];

  const { data: studentsRes, isLoading: studentsLoading } = useStudents({
    sectionId: sectionId || undefined,
    status: 'ACTIVE',
    limit: 100,
  });
  const students = studentsRes?.data?.data ?? [];

  // Resolve the class + section names so the admin can see exactly what they're marking.
  const sectionInfo = useMemo(() => {
    for (const c of classes ?? []) {
      const sec = c.sections?.find((s) => s.id === sectionId);
      if (sec) return { className: c.name, sectionName: sec.name };
    }
    return null;
  }, [classes, sectionId]);

  const { data: existingRecords, isLoading: recordsLoading } = useSectionAttendance(
    sectionId,
    date,
    academicYear?.id,
  );

  const mutation = useBulkMarkAttendance();

  function navigate(direction: -1 | 1) {
    const newDate = offsetDate(date, direction);
    router.push(`/attendance/mark?sectionId=${sectionId}&date=${newDate}`);
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

  // ── Step 1: no section chosen yet → show the class/section picker ──────────
  if (!sectionId) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <PageHeader
            title="Mark Attendance"
            description="Choose a class and section to record daily attendance"
          />
          <Button variant="ghost" size="sm" onClick={() => router.push('/attendance')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>

        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6">
            <h4 className="text-lg font-semibold text-black dark:text-white">
              Mark Today&apos;s Attendance
            </h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              <BsDate date={today} showAd />
            </p>
          </div>
          <div className="p-4 sm:p-6">
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
                    <span className={pickClassId ? '' : 'text-muted-foreground'}>
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
                    <span className={pickSectionId ? '' : 'text-muted-foreground'}>
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
                className="bg-brand-500 hover:bg-brand-600 text-white"
                disabled={!pickSectionId}
                onClick={() =>
                  router.push(`/attendance/mark?sectionId=${pickSectionId}&date=${today}`)
                }
              >
                <ClipboardCheck className="mr-1.5 h-4 w-4" />
                Mark Attendance
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: section chosen → show the marking grid ─────────────────────────
  const isLoading = studentsLoading || recordsLoading;
  const isNextDisabled = date >= today;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Mark Attendance" description="Record daily student attendance" />
        <Button variant="ghost" size="sm" onClick={() => router.push('/attendance/mark')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Change Section
        </Button>
      </div>

      {/* Context toolbar: which class/section + which date is being marked */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          {/* Class / Section context */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10">
              <Users className="h-5 w-5" />
            </span>
            <div>
              {sectionInfo ? (
                <div className="text-base font-semibold text-black dark:text-white">
                  {sectionInfo.className}
                  <span className="mx-1.5 text-gray-300 dark:text-gray-600">/</span>
                  Section {sectionInfo.sectionName}
                </div>
              ) : (
                <div className="text-base font-semibold text-black dark:text-white">Section</div>
              )}
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {students.length} active {students.length === 1 ? 'student' : 'students'}
              </div>
            </div>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-2 rounded-md border border-stroke bg-gray-50 p-1 dark:border-strokedark dark:bg-meta-4">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex min-w-[170px] items-center justify-center gap-1.5 text-sm font-semibold text-black dark:text-white">
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
            <Skeleton key={i} className="h-16 rounded-sm" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <p className="text-sm text-gray-500">No active students found in this section.</p>
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

          <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-sm border border-stroke bg-white/95 px-4 py-3 shadow-default backdrop-blur dark:border-strokedark dark:bg-boxdark/95">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Review the marks above, then save for{' '}
              {sectionInfo ? `${sectionInfo.className} / Section ${sectionInfo.sectionName}` : 'this section'}.
            </p>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white min-w-[150px]"
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
