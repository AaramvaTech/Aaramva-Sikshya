'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { TimetableGrid } from '@/components/academic/timetable-grid';
import { useClasses, useSectionTimetable, useSubjects } from '@/lib/hooks/use-academic';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';

export default function TimetablePage() {
  const router = useRouter();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: currentYear } = useCurrentAcademicYear();

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');

  const selectedClass = classes?.find((c) => c.id === selectedClassId);

  const { data: timetable, isLoading: timetableLoading } = useSectionTimetable(selectedSectionId);

  function handleClassChange(classId: string) {
    setSelectedClassId(classId);
    setSelectedSectionId('');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Timetable" description="Weekly class timetable per section" />
        <Button variant="ghost" size="sm" onClick={() => router.push('/academic')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <div className="w-44">
          <Select value={selectedClassId} onValueChange={(v) => handleClassChange(v ?? '')}>
            <SelectTrigger>
              <span className={selectedClassId ? '' : 'text-muted-foreground'}>
                {selectedClassId
                  ? classes?.find((c) => c.id === selectedClassId)?.name ?? 'Loading…'
                  : 'Select Class'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {classes?.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-44">
          <Select
            value={selectedSectionId}
            onValueChange={(v) => setSelectedSectionId(v ?? '')}
            disabled={!selectedClassId}
          >
            <SelectTrigger>
              <span className={selectedSectionId ? '' : 'text-muted-foreground'}>
                {selectedSectionId
                  ? `Section ${selectedClass?.sections.find((s) => s.id === selectedSectionId)?.name ?? ''}`
                  : 'Select Section'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {selectedClass?.sections.map((sec) => (
                <SelectItem key={sec.id} value={sec.id}>Section {sec.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {!selectedSectionId ? (
        <p className="text-sm text-gray-400 text-center py-12">
          Select a class and section to view the timetable
        </p>
      ) : timetableLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : !timetable ? (
        <p className="text-sm text-gray-400 text-center py-12">No timetable data</p>
      ) : (
        <TimetableGrid
          timetable={timetable}
          subjects={subjects ?? []}
          academicYearId={currentYear?.id ?? ''}
        />
      )}
    </div>
  );
}
