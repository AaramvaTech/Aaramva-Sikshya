'use client';

import { useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { BsDate } from '@/components/shared/bs-date';
import { MarksGrid, type MarksGridRef } from '@/components/exams/marks-grid';
import {
  useExamTypes,
  useExamSchedules,
  useMarksForSchedule,
  useBulkEnterMarks,
} from '@/lib/hooks/use-examination';
import { useClasses, useClassSubjects } from '@/lib/hooks/use-academic';
import { useCurrentAcademicYear, useStudents } from '@/lib/hooks/use-students';
import type { MarkRecord } from '@/types/api.types';

export default function MarksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const gridRef = useRef<MarksGridRef>(null);

  const { data: currentYear } = useCurrentAcademicYear();
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(searchParams.get('examTypeId') ?? '');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedScheduleId, setSelectedScheduleId] = useState('');

  const { data: examTypes } = useExamTypes(currentYear?.id ?? '');
  const { data: classes } = useClasses();
  const { data: classSubjects } = useClassSubjects(selectedClassId, currentYear?.id);
  const { data: schedules } = useExamSchedules({
    examTypeId: selectedExamTypeId || undefined,
    classId: selectedClassId || undefined,
  });

  const selectedSchedule = schedules?.find((s) => s.id === selectedScheduleId);

  // Filter by class name (not UUID) so students with class_id = NULL still match.
  const selectedClassName = classes?.find((cls) => cls.id === selectedClassId)?.name;
  const { data: studentsRes, isLoading: studentsLoading } = useStudents({
    className: selectedSchedule ? selectedClassName : undefined,
    status: 'ACTIVE',
    limit: 100,
  });
  const enrolledStudents = studentsRes?.data?.data ?? [];

  // Load existing marks for pre-population only (studentId + marks fields, no student info)
  const { data: existingMarks, isLoading: marksLoading } = useMarksForSchedule(selectedScheduleId);

  const bulkEnterMarks = useBulkEnterMarks();

  // Build student rows for the grid from the enrolled students list
  const gridStudents: MarkRecord[] = enrolledStudents.map((s) => ({
    studentId: s.id,
    studentName: s.fullName,
    admissionNumber: s.studentId,
    rollNumber: s.rollNumber ?? null,
    marksObtained: null,
    isAbsent: false,
    remarks: null,
  }));

  function handleExamTypeChange(id: string) {
    setSelectedExamTypeId(id);
    setSelectedClassId('');
    setSelectedScheduleId('');
  }

  function handleClassChange(id: string) {
    setSelectedClassId(id);
    setSelectedScheduleId('');
  }

  async function handleSave() {
    if (!selectedScheduleId) return;
    const marks = gridRef.current?.getMarks() ?? [];
    if (!marks.length) {
      toast.error('No marks to save');
      return;
    }
    try {
      const result = await bulkEnterMarks.mutateAsync({ examScheduleId: selectedScheduleId, marks });
      toast.success(`Marks saved for ${result.data.data.length} students`);
    } catch {
      toast.error('Failed to save marks');
    }
  }

  const isGridLoading = !!selectedScheduleId && (studentsLoading || marksLoading);
  // Resolve subject name for selected schedule from classSubjects (backend doesn't join)
  const selectedSubjectName =
    classSubjects?.find((cs) => cs.subjectId === selectedSchedule?.subjectId)?.subjectName;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Enter Marks" description="Record exam marks for students" />
        <Button variant="ghost" size="sm" onClick={() => router.push('/exams')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Select value={selectedExamTypeId} onValueChange={(v) => handleExamTypeChange(v ?? '')}>
            <SelectTrigger>
              <span className={selectedExamTypeId ? '' : 'text-muted-foreground'}>
                {selectedExamTypeId
                  ? (examTypes?.find((et) => et.id === selectedExamTypeId)?.name ?? 'Loading…')
                  : 'Exam Type'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {examTypes?.map((et) => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select
            value={selectedClassId}
            onValueChange={(v) => handleClassChange(v ?? '')}
            disabled={!selectedExamTypeId}
          >
            <SelectTrigger>
              <span className={selectedClassId ? '' : 'text-muted-foreground'}>
                {selectedClassId
                  ? (classes?.find((cls) => cls.id === selectedClassId)?.name ?? 'Loading…')
                  : 'Class'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {classes?.map((cls) => <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-52">
          <Select
            value={selectedScheduleId}
            onValueChange={(v) => setSelectedScheduleId(v ?? '')}
            disabled={!selectedClassId}
          >
            <SelectTrigger>
              <span className={selectedScheduleId ? '' : 'text-muted-foreground'}>
                {selectedScheduleId
                  ? (() => {
                      const s = schedules?.find((s) => s.id === selectedScheduleId);
                      if (!s) return 'Loading…';
                      return classSubjects?.find((cs) => cs.subjectId === s.subjectId)?.subjectName
                        ?? s.subjectId.slice(0, 8);
                    })()
                  : 'Subject'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {schedules?.map((s) => {
                const name = classSubjects?.find((cs) => cs.subjectId === s.subjectId)?.subjectName
                  ?? s.subjectId.slice(0, 8);
                return <SelectItem key={s.id} value={s.id}>{name}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Schedule info banner */}
      {selectedSchedule && (
        <div className="rounded-lg border bg-brand-50 px-4 py-3 flex flex-wrap gap-4 text-sm">
          <span className="font-semibold text-brand-500">{selectedSubjectName ?? '—'}</span>
          <span className="text-gray-600">
            <BsDate date={selectedSchedule.examDate} showAd />
          </span>
          <span className="text-gray-600">{selectedSchedule.startTime} – {selectedSchedule.endTime}</span>
          <span className="text-gray-600">Full Marks: <strong>{selectedSchedule.fullMarks}</strong></span>
          <span className="text-gray-600">Pass Marks: <strong>{selectedSchedule.passMarks}</strong></span>
          {selectedSchedule.room && <span className="text-gray-600">Room: {selectedSchedule.room}</span>}
        </div>
      )}

      {/* Grid */}
      {!selectedScheduleId ? (
        <p className="text-sm text-gray-400 text-center py-12">
          Select exam type, class, and subject to enter marks
        </p>
      ) : isGridLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
        </div>
      ) : !gridStudents.length ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm font-medium text-gray-600">No students are enrolled in this class</p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Students must be enrolled in a class before marks can be entered.
            Go to <strong>Students</strong>, open a student&apos;s profile, and use the{' '}
            <strong>Enroll</strong> action to assign them to this class.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs mt-2"
            onClick={() => router.push('/students')}
          >
            Go to Students
          </Button>
        </div>
      ) : (
        <>
          <MarksGrid
            key={selectedScheduleId}
            ref={gridRef}
            students={gridStudents}
            fullMarks={selectedSchedule?.fullMarks ?? 100}
            existingMarks={existingMarks}
          />
          <div className="flex justify-end pt-2">
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white min-w-[140px]"
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
