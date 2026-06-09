'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, Trash2, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { BookOpen } from 'lucide-react';
import {
  useClasses,
  useSubjects,
  useClassSubjects,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
  useAssignSubject,
  useRemoveSubject,
} from '@/lib/hooks/use-academic';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';
import type { Subject } from '@/types/api.types';

const SUBJECT_TYPES = ['THEORY', 'PRACTICAL', 'BOTH'] as const;

export default function SubjectsPage() {
  const router = useRouter();
  const { data: classes } = useClasses();
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();
  const { data: currentYear } = useCurrentAcademicYear();

  const [selectedClassId, setSelectedClassId] = useState('');
  const { data: classSubjects, isLoading: classSubjectsLoading } = useClassSubjects(
    selectedClassId,
    currentYear?.id,
  );

  // Subject CRUD state
  const [subjectDialog, setSubjectDialog] = useState<
    { mode: 'add' } | { mode: 'edit'; subject: Subject } | null
  >(null);
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectType, setSubjectType] = useState<string>('THEORY');
  const [deleteSubjectId, setDeleteSubjectId] = useState<string | null>(null);

  // Assign subject state
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignSubjectId, setAssignSubjectId] = useState('');
  const [fullMarks, setFullMarks] = useState('100');
  const [passMarks, setPassMarks] = useState('40');
  const [removeSubjectId, setRemoveSubjectId] = useState<string | null>(null);

  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();
  const assignSubject = useAssignSubject();
  const removeSubject = useRemoveSubject();

  function openAddSubject() {
    setSubjectName('');
    setSubjectCode('');
    setSubjectType('THEORY');
    setSubjectDialog({ mode: 'add' });
  }

  function openEditSubject(subject: Subject) {
    setSubjectName(subject.name);
    setSubjectCode(subject.code ?? '');
    setSubjectType(subject.type);
    setSubjectDialog({ mode: 'edit', subject });
  }

  async function handleSubjectSave() {
    if (!subjectName.trim()) return;
    try {
      if (subjectDialog?.mode === 'add') {
        await createSubject.mutateAsync({
          name: subjectName.trim(),
          code: subjectCode.trim() || undefined,
          type: subjectType,
        });
        toast.success('Subject created');
      } else if (subjectDialog?.mode === 'edit') {
        await updateSubject.mutateAsync({
          id: subjectDialog.subject.id,
          data: { name: subjectName.trim(), code: subjectCode.trim() || undefined, type: subjectType },
        });
        toast.success('Subject updated');
      }
      setSubjectDialog(null);
    } catch {
      toast.error('Failed to save subject');
    }
  }

  async function handleDeleteSubject() {
    if (!deleteSubjectId) return;
    try {
      await deleteSubject.mutateAsync(deleteSubjectId);
      toast.success('Subject deleted');
      setDeleteSubjectId(null);
    } catch {
      toast.error('Failed to delete subject');
    }
  }

  async function handleAssign() {
    if (!assignSubjectId || !selectedClassId) return;
    if (!currentYear) {
      toast.error('No active academic year. Create one under Academic settings first.');
      return;
    }
    try {
      await assignSubject.mutateAsync({
        classId: selectedClassId,
        data: {
          subjectId: assignSubjectId,
          academicYearId: currentYear.id,
          fullMarks: Number(fullMarks),
          passMarks: Number(passMarks),
        },
      });
      toast.success('Subject assigned');
      setAssignDialog(false);
      setAssignSubjectId('');
    } catch {
      toast.error('Failed to assign subject');
    }
  }

  async function handleRemove(classSubjectId: string) {
    if (!selectedClassId) return;
    try {
      await removeSubject.mutateAsync({ classId: selectedClassId, subjectId: classSubjectId });
      toast.success('Subject removed');
      setRemoveSubjectId(null);
    } catch {
      toast.error('Failed to remove subject');
    }
  }

  const assignedSubjectIds = new Set(classSubjects?.map((cs) => cs.subjectId));
  const unassignedSubjects = subjects?.filter((s) => !assignedSubjectIds.has(s.id)) ?? [];

  const subjectPending = createSubject.isPending || updateSubject.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Subjects" description="Manage subjects and class assignments" />
        <div className="flex gap-2 mt-0.5">
          <Button variant="ghost" size="sm" onClick={() => router.push('/academic')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={openAddSubject}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Subject
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: All subjects */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">All Subjects</h2>
          {subjectsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : !subjects?.length ? (
            <EmptyState message="No subjects yet" icon={BookOpen} />
          ) : (
            <div className="rounded-sm border border-stroke divide-y divide-stroke bg-white dark:border-strokedark dark:divide-strokedark dark:bg-boxdark">
              {subjects.map((subject) => (
                <div key={subject.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-black dark:text-white">{subject.name}</span>
                      <Badge variant="outline" className="text-xs h-5">
                        {subject.type}
                      </Badge>
                    </div>
                    {subject.code && (
                      <span className="text-xs text-gray-500 font-mono">{subject.code}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSubject(subject)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-error-500 hover:text-error-600"
                      onClick={() => setDeleteSubjectId(subject.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Class assignments */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Subjects for{' '}
              {selectedClassId
                ? classes?.find((c) => c.id === selectedClassId)?.name ?? 'Class'
                : 'Class'}
            </h2>
            {selectedClassId && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setAssignSubjectId('');
                  setFullMarks('100');
                  setPassMarks('40');
                  setAssignDialog(true);
                }}
                disabled={unassignedSubjects.length === 0}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Assign Subject
              </Button>
            )}
          </div>

          {/* Class selector — controlled trigger to avoid Radix UUID-display bug with async items */}
          <Select value={selectedClassId} onValueChange={(v) => setSelectedClassId(v ?? '')}>
            <SelectTrigger className="mb-3">
              <span className={selectedClassId ? '' : 'text-muted-foreground'}>
                {selectedClassId
                  ? classes?.find((c) => c.id === selectedClassId)?.name ?? 'Loading…'
                  : 'Select a class'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {classes?.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!selectedClassId ? (
            <p className="text-sm text-gray-400 text-center py-8">Select a class to view assigned subjects</p>
          ) : classSubjectsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : !classSubjects?.length ? (
            <p className="text-sm text-gray-400 text-center py-8">No subjects assigned to this class</p>
          ) : (
            <div className="rounded-sm border border-stroke divide-y divide-stroke bg-white dark:border-strokedark dark:divide-strokedark dark:bg-boxdark">
              {classSubjects.map((cs) => (
                <div key={cs.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-sm font-medium text-black dark:text-white">{cs.subjectName}</span>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Full: {cs.fullMarks} · Pass: {cs.passMarks}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-error-500 hover:text-error-600"
                    onClick={() => setRemoveSubjectId(cs.subjectId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subject add/edit dialog */}
      <Dialog open={!!subjectDialog} onOpenChange={(open) => { if (!open) setSubjectDialog(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{subjectDialog?.mode === 'add' ? 'Add Subject' : 'Edit Subject'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="subj-name">Name *</Label>
              <Input id="subj-name" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g. Mathematics" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subj-code">Code</Label>
              <Input id="subj-code" value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} placeholder="e.g. MATH101" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={subjectType} onValueChange={(v) => setSubjectType(v ?? 'THEORY')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBJECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubjectDialog(null)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleSubjectSave}
              disabled={subjectPending || !subjectName.trim()}
            >
              {subjectPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete subject confirm */}
      <Dialog open={!!deleteSubjectId} onOpenChange={(open) => { if (!open) setDeleteSubjectId(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Delete Subject</DialogTitle>
            <DialogDescription>Are you sure you want to delete this subject?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSubjectId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSubject} disabled={deleteSubject.isPending}>
              {deleteSubject.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign subject dialog */}
      <Dialog open={assignDialog} onOpenChange={(open) => { if (!open) setAssignDialog(false); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Assign Subject</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Subject *</Label>
              <Select value={assignSubjectId} onValueChange={(v) => setAssignSubjectId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  {unassignedSubjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="full-marks">Full Marks</Label>
                <Input id="full-marks" type="number" value={fullMarks} onChange={(e) => setFullMarks(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pass-marks">Pass Marks</Label>
                <Input id="pass-marks" type="number" value={passMarks} onChange={(e) => setPassMarks(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleAssign}
              disabled={assignSubject.isPending || !assignSubjectId}
            >
              {assignSubject.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove subject confirm */}
      <Dialog open={!!removeSubjectId} onOpenChange={(open) => { if (!open) setRemoveSubjectId(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Remove Subject</DialogTitle>
            <DialogDescription>Remove this subject from the class?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveSubjectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => removeSubjectId && handleRemove(removeSubjectId)}
              disabled={removeSubject.isPending}
            >
              {removeSubject.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
