'use client';

import { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BsDate } from '@/components/shared/bs-date';
import { EmptyState } from '@/components/shared/empty-state';
import { CalendarCheck } from 'lucide-react';
import { useExamTypes, useExamSchedules, useBulkCreateSchedules } from '@/lib/hooks/use-examination';
import { useClasses, useClassSubjects } from '@/lib/hooks/use-academic';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';

interface SubjectRow {
  subjectId: string;
  subjectName: string;
  examDate: string;
  startTime: string;
  endTime: string;
  fullMarks: string;
  passMarks: string;
  room: string;
}

export default function SchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: currentYear } = useCurrentAcademicYear();

  const [selectedExamTypeId, setSelectedExamTypeId] = useState(searchParams.get('examTypeId') ?? '');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([]);

  const { data: examTypes } = useExamTypes(currentYear?.id ?? '');
  const { data: classes } = useClasses();
  const { data: classSubjects } = useClassSubjects(selectedClassId, currentYear?.id);
  const { data: schedules, isLoading } = useExamSchedules({
    examTypeId: selectedExamTypeId || undefined,
    classId: selectedClassId || undefined,
  });

  const bulkCreate = useBulkCreateSchedules();

  function openBulkAdd() {
    if (!classSubjects?.length) {
      toast.error('No subjects assigned to this class');
      return;
    }
    setSubjectRows(
      classSubjects.map((cs) => ({
        subjectId: cs.subjectId,
        subjectName: cs.subjectName,
        examDate: '',
        startTime: '10:00',
        endTime: '13:00',
        fullMarks: String(cs.fullMarks),
        passMarks: String(cs.passMarks),
        room: '',
      })),
    );
    setBulkOpen(true);
  }

  function updateRow(idx: number, field: keyof SubjectRow, value: string) {
    setSubjectRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  async function handleBulkSave() {
    if (!selectedExamTypeId || !selectedClassId) return;
    const subjects = subjectRows
      .filter((r) => r.examDate)
      .map((r) => ({
        subjectId: r.subjectId,
        examDate: r.examDate,
        startTime: r.startTime,
        endTime: r.endTime,
        fullMarks: Number(r.fullMarks),
        passMarks: Number(r.passMarks),
        room: r.room || undefined,
      }));

    if (!subjects.length) {
      toast.error('Please fill exam dates for at least one subject');
      return;
    }

    try {
      await bulkCreate.mutateAsync({ examTypeId: selectedExamTypeId, classId: selectedClassId, subjects });
      toast.success(`${subjects.length} schedule(s) saved`);
      setBulkOpen(false);
    } catch {
      toast.error('Failed to save schedules');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Exam Schedule" description="View and manage exam schedules" />
        <div className="flex gap-2 mt-0.5">
          <Button variant="ghost" size="sm" onClick={() => router.push('/exams')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          {selectedExamTypeId && selectedClassId && (
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              size="sm"
              onClick={openBulkAdd}
            >
              <Plus className="h-4 w-4 mr-1" />
              Bulk Add Subjects
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Select value={selectedExamTypeId} onValueChange={(v) => setSelectedExamTypeId(v ?? '')}>
            <SelectTrigger><SelectValue placeholder="Exam Type" /></SelectTrigger>
            <SelectContent>
              {examTypes?.map((et) => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select value={selectedClassId} onValueChange={(v) => setSelectedClassId(v ?? '')}>
            <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              {classes?.map((cls) => <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Schedule table */}
      {!selectedExamTypeId ? (
        <p className="text-sm text-gray-400 text-center py-12">Select an exam type to view schedules</p>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
      ) : !schedules?.length ? (
        <EmptyState message="No schedules found. Use Bulk Add to create schedules." icon={CalendarCheck} />
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-center">Full Marks</TableHead>
                <TableHead className="text-center">Pass Marks</TableHead>
                <TableHead>Room</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {classSubjects?.find((cs) => cs.subjectId === s.subjectId)?.subjectName ?? '—'}
                  </TableCell>
                  <TableCell><BsDate date={s.examDate} showAd /></TableCell>
                  <TableCell className="text-sm text-gray-600">{s.startTime} – {s.endTime}</TableCell>
                  <TableCell className="text-center">{s.fullMarks}</TableCell>
                  <TableCell className="text-center">{s.passMarks}</TableCell>
                  <TableCell className="text-gray-500">{s.room ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bulk add dialog */}
      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open) setBulkOpen(false); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Add Exam Schedules</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="grid grid-cols-6 gap-2 text-xs font-medium text-gray-500 px-1">
              <div className="col-span-1">Subject</div>
              <div>Date</div>
              <div>Start</div>
              <div>End</div>
              <div>Full</div>
              <div>Pass</div>
            </div>
            {subjectRows.map((row, idx) => (
              <div key={row.subjectId} className="grid grid-cols-6 gap-2 items-center">
                <div className="text-sm text-gray-700 truncate">{row.subjectName}</div>
                <Input
                  type="date"
                  value={row.examDate}
                  onChange={(e) => updateRow(idx, 'examDate', e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  type="time"
                  value={row.startTime}
                  onChange={(e) => updateRow(idx, 'startTime', e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  type="time"
                  value={row.endTime}
                  onChange={(e) => updateRow(idx, 'endTime', e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  value={row.fullMarks}
                  onChange={(e) => updateRow(idx, 'fullMarks', e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  value={row.passMarks}
                  onChange={(e) => updateRow(idx, 'passMarks', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleBulkSave}
              disabled={bulkCreate.isPending}
            >
              {bulkCreate.isPending ? 'Saving…' : 'Save All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
