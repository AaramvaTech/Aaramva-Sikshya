'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { BsDate } from '@/components/shared/bs-date';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/status-badge';
import { useFeeStructures } from '@/lib/hooks/use-bill-catalog';
import { useStudentFeeStructureAssignments, useAssignFeeStructure } from '@/lib/hooks/use-bill-assignment';
import { extractApiErrors } from '@/lib/api-errors';

interface Props {
  studentId: string;
  academicYearId: string;
  onChanged: () => void;
}

/**
 * UI-2 §5.1.A — current + history, backed by the new
 * GET /finance/students/:studentId/fee-structure (UI-2-SPEC.md §2). No
 * delete/edit on this resource by design: "changing" is a new assign that
 * closes the prior row server-side, never a PATCH.
 *
 * Picker is scoped by academicYearId only, not classId — a correction from
 * the spec's assumption: `StudentDetail` (what useStudent() actually
 * returns) has no classId, only a className string. Not worth widening that
 * response type for this one picker; the structure's own name is expected
 * to carry the class context (as UI-1's catalog data already does).
 */
export function FeeStructureAssignmentPanel({ studentId, academicYearId, onChanged }: Props) {
  const { data: assignments, isLoading } = useStudentFeeStructureAssignments(studentId, academicYearId);
  const { data: structuresResponse } = useFeeStructures({ academicYearId });
  const structures = structuresResponse?.data ?? [];
  const structureName = (id: string) => structures.find((s) => s.id === id)?.name ?? id;

  const assign = useAssignFeeStructure();
  const [showForm, setShowForm] = useState(false);
  const [feeStructureId, setFeeStructureId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const current = assignments?.find((a) => a.effectiveTo === null);
  const history = assignments?.filter((a) => a.effectiveTo !== null) ?? [];

  async function handleAssign() {
    if (!feeStructureId || !effectiveFrom) { toast.error('Select a fee structure and effective date'); return; }
    try {
      await assign.mutateAsync({ studentId, data: { feeStructureId, effectiveFrom } });
      toast.success(current ? 'Fee structure changed' : 'Fee structure assigned');
      setShowForm(false);
      setFeeStructureId('');
      setEffectiveFrom('');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to assign fee structure').forEach((m) => toast.error(m));
    }
  }

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
        <div>
          <h4 className="font-semibold text-black dark:text-white">Fee Structure Assignment</h4>
          <p className="mt-0.5 text-xs text-gray-500">Which fee structure this student is billed against</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" /> {current ? 'Change' : 'Assign'}
        </Button>
      </div>

      {showForm && (
        <div className="flex flex-wrap items-end gap-2 border-b border-stroke bg-gray-50/50 px-6 py-4 dark:border-strokedark dark:bg-gray-800/20">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Fee Structure</label>
            <Select value={feeStructureId} onValueChange={(v) => setFeeStructureId(v ?? '')}>
              <SelectTrigger className="w-56">
                <span className={feeStructureId ? '' : 'text-muted-foreground'}>
                  {feeStructureId ? structureName(feeStructureId) : 'Select fee structure'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {structures.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {structures.length === 0 && (
              <p className="text-xs text-gray-400">No fee structures for this class/year yet.</p>
            )}
          </div>
          <BsDateInput label="Effective From" value={effectiveFrom} onChange={setEffectiveFrom} />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleAssign} disabled={assign.isPending}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
        </div>
      )}

      <div className="px-6 py-4">
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {!isLoading && !current && (
          <p className="text-sm text-gray-400">No fee structure assigned for this year yet.</p>
        )}
        {current && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-800 dark:text-white">{structureName(current.feeStructureId)}</span>
            <StatusBadge status="ACTIVE" />
            <span className="text-xs text-gray-500">Since <BsDate date={current.effectiveFrom} /></span>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-gray-500">History</p>
            <div className="space-y-1.5">
              {history.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{structureName(a.feeStructureId)}</span>
                  <span><BsDate date={a.effectiveFrom} /> — {a.effectiveTo ? <BsDate date={a.effectiveTo} /> : 'ongoing'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
