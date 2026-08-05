'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAcademicYears, useCurrentAcademicYear } from '@/lib/hooks/use-students';
import { FeeStructureAssignmentPanel } from './fee-structure-assignment-panel';
import { FeeOverridesPanel } from './fee-overrides-panel';
import { StudentConcessionsPanel } from './student-concessions-panel';
import { TransportAssignmentPanel } from './transport-assignment-panel';
import { FeePreviewPanel } from './fee-preview-panel';

interface Props {
  studentId: string;
}

/**
 * UI-2 §5.1 — the "Billing" tab, new-rail, sitting alongside (never
 * replacing) the old-rail "Fees" tab on the same page. Mirrors the old
 * tab's academic-year selector (FeesTab, this same page) as the shared
 * context for every panel below.
 *
 * Every write panel gets `onChanged`, which invalidates the Fee Preview's
 * query key in addition to the panel's own — the exact cross-invalidation
 * discipline the WEB-P Phase 3 `useApplyLeave` staleness bug (CLAUDE.md)
 * already taught this codebase: fixed at the composition layer, not by
 * baking student-specific keys into the shared mutation hooks.
 */
export function StudentBillingTab({ studentId }: Props) {
  const queryClient = useQueryClient();
  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const [selectedYearId, setSelectedYearId] = useState('');

  const academicYearId = selectedYearId || currentYear?.id || '';

  const onChanged = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['fee-preview', studentId] });
  }, [queryClient, studentId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={academicYearId} onValueChange={(v) => setSelectedYearId(v ?? '')}>
          <SelectTrigger className="w-48">
            <span className={academicYearId ? '' : 'text-muted-foreground'}>
              {academicYearId
                ? (() => {
                    const y = allYears?.find((y) => y.id === academicYearId);
                    return y ? `${y.name}${y.isCurrent ? ' (Current)' : ''}` : 'Loading…';
                  })()
                : 'Select year'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {allYears?.map((y) => (
              <SelectItem key={y.id} value={y.id}>{y.name} {y.isCurrent && '(Current)'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-400">Assignment, overrides, and concessions are per-student per-year</p>
      </div>

      {academicYearId && (
        <div className="space-y-4">
          <FeeStructureAssignmentPanel studentId={studentId} academicYearId={academicYearId} onChanged={onChanged} />
          <FeeOverridesPanel studentId={studentId} academicYearId={academicYearId} onChanged={onChanged} />
          <StudentConcessionsPanel studentId={studentId} academicYearId={academicYearId} onChanged={onChanged} />
          <TransportAssignmentPanel studentId={studentId} onChanged={onChanged} />
          <FeePreviewPanel studentId={studentId} academicYearId={academicYearId} />
        </div>
      )}
    </div>
  );
}
