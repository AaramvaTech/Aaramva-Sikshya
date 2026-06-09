'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Users, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentAcademicYear, useCreateAcademicYear } from '@/lib/hooks/use-students';
import { academicYearsApi } from '@/lib/api/academic-years.api';

const modules = [
  {
    title: 'Classes & Sections',
    description: 'Manage classes, sections, and enrollment capacity',
    icon: Users,
    href: '/academic/classes',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    title: 'Subjects',
    description: 'Add subjects and assign them to classes with full marks',
    icon: BookOpen,
    href: '/academic/subjects',
    color: 'text-success-600',
    bg: 'bg-success-50',
  },
  {
    title: 'Timetable',
    description: 'View and manage weekly class timetables per section',
    icon: Calendar,
    href: '/academic/timetable',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
];

export default function AcademicPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentYear, isLoading: yearLoading } = useCurrentAcademicYear();
  const createYear = useCreateAcademicYear();

  const [yearDialog, setYearDialog] = useState(false);
  const [yearName, setYearName] = useState('2081-82');
  const [yearBs, setYearBs] = useState('2081');
  const [startDate, setStartDate] = useState('2024-07-16');
  const [endDate, setEndDate] = useState('2025-07-15');

  async function handleCreateYear() {
    if (!yearName.trim() || !yearBs || !startDate || !endDate) return;
    try {
      const res = await createYear.mutateAsync({
        name: yearName.trim(),
        yearBs: Number(yearBs),
        startDate,
        endDate,
      });
      // Backend create never sets isCurrent — must call set-current separately
      await academicYearsApi.setCurrent(res.data.data.id);
      await queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      toast.success(`Academic year "${yearName}" created and set as current`);
      createYear.reset();
      setYearDialog(false);
    } catch {
      toast.error('Failed to create academic year');
    }
  }

  const noYear = !yearLoading && !currentYear;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic"
        description="Classes, sections, subjects, and timetable"
      />

      {/* Setup banner — shown when no active academic year */}
      {noYear && (
        <div className="flex items-start gap-3 rounded-sm border border-warning-200 bg-warning-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning-800">No active academic year</p>
            <p className="text-xs text-warning-700 mt-0.5">
              Subject assignments, exam types, and most features require an active academic year.
            </p>
          </div>
          <Button
            size="sm"
            className="flex-shrink-0 bg-warning-600 hover:bg-warning-700 text-white"
            onClick={() => setYearDialog(true)}
          >
            Create Academic Year
          </Button>
        </div>
      )}

      {/* Current year banner — shown when year exists */}
      {currentYear && (
        <div className="flex items-center gap-3 rounded-sm border border-success-200 bg-success-50 px-4 py-2.5">
          <Calendar className="h-4 w-4 text-success-600 flex-shrink-0" />
          <p className="text-sm text-success-700">
            Active year: <span className="font-semibold">{currentYear.name}</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 2xl:gap-7.5">
        {modules.map((mod) => (
          <div
            key={mod.href}
            className="cursor-pointer rounded-sm border border-stroke bg-white shadow-default transition-shadow hover:shadow-md dark:border-strokedark dark:bg-boxdark"
            onClick={() => router.push(mod.href)}
          >
            <div className="p-4 sm:p-6 xl:p-7.5">
              <div className={`inline-flex p-3 rounded-full ${mod.bg} mb-4`}>
                <mod.icon className={`h-6 w-6 ${mod.color}`} />
              </div>
              <h3 className="font-semibold text-black dark:text-white mb-1">{mod.title}</h3>
              <p className="text-sm text-gray-500">{mod.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Create Academic Year dialog */}
      <Dialog open={yearDialog} onOpenChange={(open) => { if (!open) setYearDialog(false); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Academic Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="year-name">Year Name *</Label>
              <Input
                id="year-name"
                value={yearName}
                onChange={(e) => setYearName(e.target.value)}
                placeholder="e.g. 2081-82"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="year-bs">BS Year *</Label>
              <Input
                id="year-bs"
                type="number"
                value={yearBs}
                onChange={(e) => setYearBs(e.target.value)}
                placeholder="e.g. 2081"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start-date">Start Date (AD) *</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date">End Date (AD) *</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              This year will be set as the active academic year. Nepal fiscal year typically runs
              mid-July to mid-July (1 Shrawan – 31 Ashadh).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYearDialog(false)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleCreateYear}
              disabled={createYear.isPending || !yearName.trim() || !yearBs}
            >
              {createYear.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
