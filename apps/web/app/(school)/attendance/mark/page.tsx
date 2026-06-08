'use client';

import { useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BsDate } from '@/components/shared/bs-date';
import { AttendanceGrid, type AttendanceGridRef } from '@/components/attendance/attendance-grid';
import { useSectionAttendance, useBulkMarkAttendance } from '@/lib/hooks/use-attendance';
import { useCurrentAcademicYear, useStudents } from '@/lib/hooks/use-students';

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
  const { data: studentsRes, isLoading: studentsLoading } = useStudents({
    sectionId: sectionId || undefined,
    status: 'ACTIVE',
    limit: 200,
  });
  const students = studentsRes?.data?.data ?? [];

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

  const isLoading = studentsLoading || recordsLoading;
  const isNextDisabled = date >= today;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Mark Attendance" description="Record daily student attendance" />
        <Button variant="ghost" size="sm" onClick={() => router.push('/attendance')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold text-gray-800 min-w-[180px] text-center">
          <BsDate date={date} showAd />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate(1)}
          disabled={isNextDisabled}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : !sectionId ? (
        <p className="text-sm text-gray-500">No section selected. Go back and choose a section.</p>
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

          <div className="flex justify-end pt-2">
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white min-w-[140px]"
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
