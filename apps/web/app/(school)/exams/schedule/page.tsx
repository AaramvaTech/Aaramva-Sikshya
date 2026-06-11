'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { useExamTypes, useExamSchedules, useBulkCreateSchedules, useUpdateSchedule } from '@/lib/hooks/use-examination';
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

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    examDate: string;
    startTime: string;
    endTime: string;
    fullMarks: string;
    passMarks: string;
    room: string;
  }>({ examDate: '', startTime: '', endTime: '', fullMarks: '', passMarks: '', room: '' });

  const { data: examTypes } = useExamTypes(currentYear?.id ?? '');
  const { data: classes, isLoading: classesLoading } = useClasses();
  const { data: classSubjects } = useClassSubjects(selectedClassId, currentYear?.id);

  // Always fetch all schedules for the exam type (no class filter) so we can:
  // 1. Show per-class counts in the class grid
  // 2. Filter client-side for the selected class's table
  const { data: allSchedules, isLoading: schedulesLoading } = useExamSchedules({
    examTypeId: selectedExamTypeId || undefined,
  });

  const classSchedules = allSchedules?.filter((s) => s.classId === selectedClassId) ?? [];

  const bulkCreate = useBulkCreateSchedules();
  const updateSchedule = useUpdateSchedule();

  const selectedExamType = examTypes?.find((et) => et.id === selectedExamTypeId);
  const selectedClass = classes?.find((c) => c.id === selectedClassId);

  function handleExamTypeChange(id: string) {
    setSelectedExamTypeId(id);
    setSelectedClassId('');
  }

  function handleClassSelect(classId: string) {
    setSelectedClassId(classId);
  }

  function openBulkAdd() {
    if (!classSubjects?.length) {
      toast.error('No subjects assigned to this class. Assign subjects under Academic → Subjects first.');
      return;
    }

    // Only show subjects that don't have a schedule yet
    const scheduledSubjectIds = new Set(classSchedules.map((s) => s.subjectId));
    const pending = classSubjects.filter((cs) => !scheduledSubjectIds.has(cs.subjectId));

    if (!pending.length) {
      toast.info('All subjects are already scheduled for this class.');
      return;
    }

    setSubjectRows(
      pending.map((cs) => ({
        subjectId: cs.subjectId,
        subjectName: cs.subjectName,
        examDate: '',
        startTime: '10:00',
        endTime: '13:00',
        fullMarks: String(cs.fullMarks ?? 100),
        passMarks: String(cs.passMarks ?? 40),
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
      toast.success(`${subjects.length} subject(s) scheduled`);
      setBulkOpen(false);
    } catch {
      toast.error('Failed to save schedules');
    }
  }

  function startEdit(s: (typeof classSchedules)[0]) {
    setEditingId(s.id);
    setEditForm({
      examDate: s.examDate?.ad ?? '',
      startTime: s.startTime,
      endTime: s.endTime,
      fullMarks: String(s.fullMarks),
      passMarks: String(s.passMarks),
      room: s.room ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    try {
      await updateSchedule.mutateAsync({
        id,
        data: {
          examDate: editForm.examDate,
          startTime: editForm.startTime,
          endTime: editForm.endTime,
          fullMarks: Number(editForm.fullMarks),
          passMarks: Number(editForm.passMarks),
          room: editForm.room || undefined,
        },
      });
      toast.success('Schedule updated');
      setEditingId(null);
    } catch {
      toast.error('Failed to update schedule');
    }
  }

  const isLoading = classesLoading || schedulesLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Exam Schedule"
          description={
            selectedClassId && selectedClass
              ? `${selectedExamType?.name ?? ''} — ${selectedClass.name}`
              : 'Configure exam schedule for each class'
          }
        />
        <div className="flex gap-2 mt-0.5">
          {selectedClassId ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setSelectedClassId('')}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                All Classes
              </Button>
              <Button
                className="bg-brand-500 hover:bg-brand-600 text-white"
                size="sm"
                onClick={openBulkAdd}
              >
                <Plus className="h-4 w-4 mr-1" />
                Schedule Subjects
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => router.push('/exams')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
        </div>
      </div>

      {/* Exam type selector */}
      <div className="w-56">
        <Select value={selectedExamTypeId} onValueChange={(v) => handleExamTypeChange(v ?? '')}>
          <SelectTrigger>
            <span className={selectedExamTypeId ? '' : 'text-muted-foreground'}>
              {selectedExamTypeId
                ? (selectedExamType?.name ?? 'Loading…')
                : 'Select Exam Type'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {examTypes?.map((et) => (
              <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Main body */}
      {!selectedExamTypeId ? (
        <p className="text-sm text-gray-400 text-center py-12">
          Select an exam type to configure schedules per class
        </p>
      ) : selectedClassId ? (
        /* ── Schedule table for selected class ── */
        isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
          </div>
        ) : !classSchedules.length ? (
          <EmptyState
            message={`No schedule set up for ${selectedClass?.name ?? 'this class'} yet. Click "Schedule Subjects" to add.`}
            icon={CalendarCheck}
          />
        ) : (
          <div className="border rounded-lg overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-center">Full</TableHead>
                  <TableHead className="text-center">Pass</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {classSchedules.map((s) => {
                  const subjectName =
                    classSubjects?.find((cs) => cs.subjectId === s.subjectId)?.subjectName
                    ?? s.subjectId.slice(0, 8);
                  const isEditing = editingId === s.id;

                  return (
                    <TableRow key={s.id} className={isEditing ? 'bg-brand-50/40' : undefined}>
                      <TableCell className="font-medium">{subjectName}</TableCell>

                      {isEditing ? (
                        <>
                          <TableCell>
                            <Input
                              type="date"
                              value={editForm.examDate}
                              onChange={(e) => setEditForm((f) => ({ ...f, examDate: e.target.value }))}
                              className="h-8 text-xs w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={editForm.startTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))}
                              className="h-8 text-xs w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={editForm.endTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))}
                              className="h-8 text-xs w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editForm.fullMarks}
                              onChange={(e) => setEditForm((f) => ({ ...f, fullMarks: e.target.value }))}
                              className="h-8 text-xs w-16 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editForm.passMarks}
                              onChange={(e) => setEditForm((f) => ({ ...f, passMarks: e.target.value }))}
                              className="h-8 text-xs w-16 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.room}
                              onChange={(e) => setEditForm((f) => ({ ...f, room: e.target.value }))}
                              className="h-8 text-xs w-20"
                              placeholder="—"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-success-600 hover:text-success-700"
                                onClick={() => saveEdit(s.id)}
                                disabled={updateSchedule.isPending}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-gray-400 hover:text-gray-600"
                                onClick={cancelEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell><BsDate date={s.examDate} showAd /></TableCell>
                          <TableCell className="text-sm text-gray-600">{s.startTime}</TableCell>
                          <TableCell className="text-sm text-gray-600">{s.endTime}</TableCell>
                          <TableCell className="text-center">{s.fullMarks}</TableCell>
                          <TableCell className="text-center">{s.passMarks}</TableCell>
                          <TableCell className="text-gray-500">{s.room ?? '—'}</TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-gray-400 hover:text-brand-500"
                              onClick={() => startEdit(s)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
      ) : (
        /* ── Class grid ── */
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : !classes?.length ? (
          <EmptyState
            message="No classes found. Create classes under Academic first."
            icon={CalendarCheck}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => {
              const count = allSchedules?.filter((s) => s.classId === cls.id).length ?? 0;
              return (
                <button
                  key={cls.id}
                  onClick={() => handleClassSelect(cls.id)}
                  className="text-left border rounded-lg p-4 bg-white hover:border-brand-500 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-500 text-base">
                      {cls.name}
                    </h3>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-brand-500 mt-0.5 flex-shrink-0" />
                  </div>
                  <div className="mt-2">
                    {count > 0 ? (
                      <Badge className="bg-success-100 text-success-700 border-0 text-xs">
                        {count} subject{count !== 1 ? 's' : ''} scheduled
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">
                        Not scheduled yet
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 group-hover:text-brand-400">
                    {count > 0 ? 'Click to view or add more subjects' : 'Click to set up schedule'}
                  </p>
                </button>
              );
            })}
          </div>
        )
      )}

      {/* Schedule dialog */}
      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open) setBulkOpen(false); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedExamType?.name} — {selectedClass?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 -mt-2 pb-2">
            Fill in exam dates for each subject. Leave the date blank to skip a subject.
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-2 text-xs font-medium text-gray-500 px-1">
              <div className="col-span-2">Subject</div>
              <div>Date</div>
              <div>Start</div>
              <div>End</div>
              <div>Full</div>
              <div>Pass</div>
            </div>
            {subjectRows.map((row, idx) => (
              <div key={row.subjectId} className="grid grid-cols-7 gap-2 items-center">
                <div className="col-span-2 text-sm text-gray-700 truncate font-medium">
                  {row.subjectName}
                </div>
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
              {bulkCreate.isPending ? 'Saving…' : 'Save Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
