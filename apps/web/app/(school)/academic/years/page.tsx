'use client';

import { useState } from 'react';
import { Plus, CheckCircle2, Circle } from 'lucide-react';
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
import { EmptyState } from '@/components/shared/empty-state';
import { BsDate } from '@/components/shared/bs-date';
import {
  useAcademicYears,
  useCreateAcademicYear,
  useSetCurrentAcademicYear,
} from '@/lib/hooks/use-students';
import { todayBs } from 'bs-calendar';

export default function AcademicYearsPage() {
  const { data: years, isLoading } = useAcademicYears();
  const createYear = useCreateAcademicYear();
  const setCurrent = useSetCurrentAcademicYear();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [yearBs, setYearBs] = useState(() => String(todayBs().year));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  function resetForm() {
    setName('');
    setYearBs(String(todayBs().year));
    setStartDate('');
    setEndDate('');
  }

  async function handleCreate() {
    if (!name.trim() || !yearBs || !startDate || !endDate) {
      toast.error('All fields are required');
      return;
    }
    try {
      const year = await createYear.mutateAsync({
        name: name.trim(),
        yearBs: Number(yearBs),
        startDate,
        endDate,
      });
      // Step 2: if it's the first year, set it as current automatically
      if (!years?.length) {
        await setCurrent.mutateAsync(year.data.data.id);
      }
      toast.success('Academic year created');
      setAddOpen(false);
      resetForm();
    } catch {
      toast.error('Failed to create academic year');
    }
  }

  async function handleSetCurrent(id: string) {
    try {
      await setCurrent.mutateAsync(id);
      toast.success('Current academic year updated');
    } catch {
      toast.error('Failed to update current year');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Years"
        description="Manage academic years and set the active year"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Academic Year
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-sm" />)}
        </div>
      ) : !years?.length ? (
        <EmptyState
          icon={Circle}
          message="No academic years yet. Create your first academic year to get started."
          action={
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Academic Year
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {years.map((y) => (
            <div
              key={y.id}
              className="flex items-center justify-between rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark"
            >
              <div className="flex items-center gap-3">
                {y.isCurrent ? (
                  <CheckCircle2 className="w-5 h-5 text-brand-500 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white">
                    {y.name}
                    {y.isCurrent && (
                      <span className="ml-2 text-xs font-medium text-brand-500 bg-brand-50 dark:bg-brand-500/10 px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                    BS {y.yearBs} &nbsp;·&nbsp;
                    <BsDate date={y.startDate} /> – <BsDate date={y.endDate} />
                  </p>
                </div>
              </div>

              {!y.isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleSetCurrent(y.id)}
                  disabled={setCurrent.isPending}
                >
                  Set as Current
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Academic Year dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Add Academic Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2081/82"
              />
            </div>
            <div className="space-y-1.5">
              <Label>BS Year *</Label>
              <Input
                type="number"
                value={yearBs}
                onChange={(e) => setYearBs(e.target.value)}
                placeholder="e.g. 2081"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date (AD) *</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Date (AD) *</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleCreate}
              disabled={createYear.isPending || setCurrent.isPending}
            >
              {createYear.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
