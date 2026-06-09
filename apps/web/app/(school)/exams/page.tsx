'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CalendarCheck, ClipboardList, BarChart2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
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
import { EmptyState } from '@/components/shared/empty-state';
import { FileText } from 'lucide-react';
import { useExamTypes, useCreateExamType } from '@/lib/hooks/use-examination';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';

export default function ExamsPage() {
  const router = useRouter();
  const { data: currentYear } = useCurrentAcademicYear();
  const { data: examTypes, isLoading } = useExamTypes(currentYear?.id ?? '');
  const createExamType = useCreateExamType();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [order, setOrder] = useState('');

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

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 2xl:gap-7.5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-sm" />)}
        </div>
      ) : !examTypes?.length ? (
        <EmptyState message="No exam types yet. Create your first exam type." icon={FileText} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 2xl:gap-7.5">
          {examTypes.map((et) => (
            <div key={et.id} className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark flex flex-col">
              <div className="p-4 sm:p-6 xl:p-7.5 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-black dark:text-white text-base">{et.name}</h3>
                  {et.isComplete && (
                    <Badge className="bg-success-100 text-success-700 border-0 text-xs">Complete</Badge>
                  )}
                </div>
                <div className="text-sm text-gray-500 space-y-0.5">
                  <p>Weight: <span className="font-semibold text-black dark:text-white">{et.weightPercent}%</span></p>
                  <p>Order: <span className="font-semibold text-black dark:text-white">#{et.orderIndex}</span></p>
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create exam type dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Create Exam Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="et-name">Name *</Label>
              <Input id="et-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. First Terminal" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-weight">Weight (%) *</Label>
              <Input id="et-weight" type="number" min={1} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 20" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-order">Order Index</Label>
              <Input id="et-order" type="number" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="Auto" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
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
    </div>
  );
}
