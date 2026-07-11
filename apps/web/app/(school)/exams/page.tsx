'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CalendarCheck, ClipboardList, BarChart2, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FileText } from 'lucide-react';
import {
  useExamTypes,
  useCreateExamType,
  useUpdateExamType,
  useDeleteExamType,
  useSetExamTypePublished,
} from '@/lib/hooks/use-examination';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';
import type { ExamType } from '@/types/api.types';

export default function ExamsPage() {
  const router = useRouter();
  const { data: currentYear } = useCurrentAcademicYear();
  const { data: examTypes, isLoading, isError, refetch } = useExamTypes(currentYear?.id ?? '');
  const createExamType = useCreateExamType();
  const updateExamType = useUpdateExamType();
  const deleteExamType = useDeleteExamType();
  const setPublished = useSetExamTypePublished();

  async function handleTogglePublish(et: ExamType) {
    const next = !et.resultsPublished;
    try {
      await setPublished.mutateAsync({ id: et.id, published: next });
      toast.success(
        next
          ? `${et.name} results published — now visible to students & parents`
          : `${et.name} results unpublished — hidden from students & parents`,
      );
    } catch {
      toast.error('Failed to update publish state');
    }
  }

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [order, setOrder] = useState('');

  // Edit dialog
  const [editTarget, setEditTarget] = useState<ExamType | null>(null);
  const [editName, setEditName] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editOrder, setEditOrder] = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ExamType | null>(null);

  function openEdit(et: ExamType) {
    setEditTarget(et);
    setEditName(et.name);
    setEditWeight(String(et.weightPercent));
    setEditOrder(String(et.orderIndex));
  }

  function closeEdit() {
    setEditTarget(null);
    setEditName('');
    setEditWeight('');
    setEditOrder('');
  }

  async function handleCreate() {
    if (!name.trim() || !weight) return;
    if (!currentYear) {
      toast.error('No active academic year. Create one under Academic settings first.');
      return;
    }
    try {
      await createExamType.mutateAsync({
        name: name.trim(),
        weightPercent: Number(weight),
        academicYearId: currentYear.id,
        orderIndex: order ? Number(order) : (examTypes?.length ?? 0) + 1,
      });
      toast.success('Exam type created');
      setCreateOpen(false);
      setName('');
      setWeight('');
      setOrder('');
    } catch {
      toast.error('Failed to create exam type');
    }
  }

  async function handleUpdate() {
    if (!editTarget || !editName.trim() || !editWeight) return;
    try {
      await updateExamType.mutateAsync({
        id: editTarget.id,
        data: {
          name: editName.trim(),
          weightPercent: Number(editWeight),
          orderIndex: editOrder ? Number(editOrder) : undefined,
        },
      });
      toast.success('Exam type updated');
      closeEdit();
    } catch {
      toast.error('Failed to update exam type');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteExamType.mutateAsync(deleteTarget.id);
      toast.success('Exam type deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete exam type');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinations"
        description="Exam schedules, marks entry, and results"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Exam Type
          </Button>
        }
      />

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 2xl:gap-7.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-sm" />
          ))}
        </div>
      ) : !examTypes?.length ? (
        <EmptyState message="No exam types yet. Create your first exam type." icon={FileText} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 2xl:gap-7.5">
          {examTypes.map((et) => (
            <div
              key={et.id}
              className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark flex flex-col"
            >
              <div className="p-4 sm:p-6 xl:p-7.5 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-black dark:text-white text-base leading-snug">
                    {et.name}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      className={`border-0 text-xs ${
                        et.resultsPublished
                          ? 'bg-success-100 text-success-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {et.resultsPublished ? 'Published' : 'Unpublished'}
                    </Badge>
                    {et.isComplete && (
                      <Badge className="bg-success-100 text-success-700 border-0 text-xs">
                        Complete
                      </Badge>
                    )}
                    <button
                      onClick={() => openEdit(et)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(et)}
                      className="p-1 rounded hover:bg-error-50 text-gray-400 hover:text-error-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-sm text-gray-500 space-y-0.5">
                  <p>
                    Weight:{' '}
                    <span className="font-semibold text-black dark:text-white">
                      {et.weightPercent}%
                    </span>
                  </p>
                  <p>
                    Order:{' '}
                    <span className="font-semibold text-black dark:text-white">
                      #{et.orderIndex}
                    </span>
                  </p>
                </div>
                <div className="mt-auto pt-2 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs justify-start"
                    onClick={() => router.push(`/exams/schedule?examTypeId=${et.id}`)}
                  >
                    <CalendarCheck className="h-3.5 w-3.5 mr-2 text-blue-500" />
                    View Schedule
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs justify-start"
                    onClick={() => router.push(`/exams/marks?examTypeId=${et.id}`)}
                  >
                    <ClipboardList className="h-3.5 w-3.5 mr-2 text-orange-500" />
                    Enter Marks
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs justify-start"
                    onClick={() => router.push(`/exams/results?examTypeId=${et.id}`)}
                  >
                    <BarChart2 className="h-3.5 w-3.5 mr-2 text-success-600" />
                    View Results
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`w-full text-xs justify-start ${
                      et.resultsPublished
                        ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
                        : 'text-success-600 border-success-200 hover:bg-success-50'
                    }`}
                    onClick={() => handleTogglePublish(et)}
                    disabled={setPublished.isPending}
                  >
                    {et.resultsPublished ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5 mr-2" />
                        Unpublish Results
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5 mr-2" />
                        Publish Results
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Create Exam Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="et-name">Name *</Label>
              <Input
                id="et-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. First Terminal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-weight">Weight (%) *</Label>
              <Input
                id="et-weight"
                type="number"
                min={1}
                max={100}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g. 20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-order">Order Index</Label>
              <Input
                id="et-order"
                type="number"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                placeholder="Auto"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleCreate}
              disabled={createExamType.isPending || !name.trim() || !weight}
            >
              {createExamType.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Edit Exam Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. First Terminal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-weight">Weight (%) *</Label>
              <Input
                id="edit-weight"
                type="number"
                min={1}
                max={100}
                value={editWeight}
                onChange={(e) => setEditWeight(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-order">Order Index</Label>
              <Input
                id="edit-order"
                type="number"
                value={editOrder}
                onChange={(e) => setEditOrder(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleUpdate}
              disabled={updateExamType.isPending || !editName.trim() || !editWeight}
            >
              {updateExamType.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the exam type. All schedules, marks, and results associated with
              it will be hidden. This cannot be undone from the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error-500 hover:bg-error-600 text-white"
              onClick={handleDelete}
              disabled={deleteExamType.isPending}
            >
              {deleteExamType.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
