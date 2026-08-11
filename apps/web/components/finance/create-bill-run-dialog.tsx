'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ChevronDown } from 'lucide-react';
import { todayBs, BS_MONTH_NAMES_EN } from 'bs-calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { useAcademicYears, useCurrentAcademicYear, useClasses } from '@/lib/hooks/use-students';
import { useCreateBillRun } from '@/lib/hooks/use-bill-run';
import { canSubmitBillRunDraft } from '@/lib/bill-run-form';
import { extractApiErrors } from '@/lib/api-errors';
import type { BillRunScope } from '@/types/api.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * UI-3-SPEC.md §5.2 — mirrors bulk-assign-dialog.tsx's toggle-tab shape
 * (academic year select, scope toggle, class select), swapped from
 * CLASS/STUDENT_LIST to CLASS/WHOLE_SCHOOL since CreateBillRunDto has no
 * student-list scope. No job-progress hand-off (bill-run posting isn't a
 * background job the way bulk-assign is) — on success this routes straight
 * to the review page, which *is* the draft (UI-3-SPEC.md §0/§5.2).
 */
export function CreateBillRunDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const bsYearNow = useMemo(() => todayBs().year, []);

  const [academicYearId, setAcademicYearId] = useState('');
  const [scope, setScope] = useState<BillRunScope>('WHOLE_SCHOOL');
  const [classId, setClassId] = useState('');
  const [bsYear, setBsYear] = useState(bsYearNow);
  const [bsMonth, setBsMonth] = useState(todayBs().month);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const effectiveYearId = academicYearId || currentYear?.id || '';

  const { data: classes } = useClasses();

  const createBillRun = useCreateBillRun();

  function reset() {
    setAcademicYearId('');
    setScope('WHOLE_SCHOOL');
    setClassId('');
    setBsYear(bsYearNow);
    setBsMonth(todayBs().month);
    setShowAdvanced(false);
    setIssueDate('');
    setDueDate('');
  }

  const canSubmit = canSubmitBillRunDraft({ academicYearId: effectiveYearId, scope, classId, bsYear, bsMonth });

  async function handleSubmit() {
    if (!canSubmit) { toast.error('Fill in every required field'); return; }
    try {
      const res = await createBillRun.mutateAsync({
        academicYearId: effectiveYearId,
        scope,
        classId: scope === 'CLASS' ? classId : undefined,
        bsYear,
        bsMonth,
        issueDate: issueDate || undefined,
        dueDate: dueDate || undefined,
      });
      const runId = res.data.data.id;
      reset();
      onOpenChange(false);
      router.push(`/finance/bill/runs/${runId}`);
    } catch (err) {
      // A 409 here already names the conflicting run's id and status in its
      // own message (BillRunService.generateDraft) — shown as-is rather than
      // parsed into a link, so it isn't coupled to that message's exact text.
      extractApiErrors(err, 'Failed to create bill run').forEach((m) => toast.error(m));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Bill Run</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Academic Year *</Label>
            <Select value={effectiveYearId} onValueChange={(v) => setAcademicYearId(v ?? '')}>
              <SelectTrigger>
                <span>
                  {effectiveYearId
                    ? (allYears?.find((y) => y.id === effectiveYearId)?.name ?? 'Loading…')
                    : 'Select year'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {allYears?.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name} {y.isCurrent ? '(Current)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>BS Year *</Label>
              <Select value={String(bsYear)} onValueChange={(v) => setBsYear(Number(v))}>
                <SelectTrigger><span>{bsYear}</span></SelectTrigger>
                <SelectContent>
                  {[bsYearNow - 1, bsYearNow, bsYearNow + 1].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>BS Month *</Label>
              <Select value={String(bsMonth)} onValueChange={(v) => setBsMonth(Number(v))}>
                <SelectTrigger><span>{BS_MONTH_NAMES_EN[bsMonth - 1]}</span></SelectTrigger>
                <SelectContent>
                  {BS_MONTH_NAMES_EN.map((name, i) => (
                    <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex border-b border-gray-200 dark:border-gray-800 -mx-6 px-6">
            {(['WHOLE_SCHOOL', 'CLASS'] as BillRunScope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  scope === s
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {s === 'WHOLE_SCHOOL' ? 'Whole School' : 'One Class'}
              </button>
            ))}
          </div>

          {scope === 'CLASS' && (
            <div className="space-y-1.5">
              <Label>Class *</Label>
              <Select value={classId} onValueChange={(v) => setClassId(v ?? '')}>
                <SelectTrigger>
                  <span className={classId ? '' : 'text-muted-foreground'}>
                    {classId ? (classes?.find((c) => c.id === classId)?.name ?? 'Loading…') : 'Select class'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Advanced (issue / due date)
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-3">
              <BsDateInput label="Issue Date (BS)" value={issueDate} onChange={setIssueDate} minYear={bsYearNow - 1} maxYear={bsYearNow + 1} />
              <BsDateInput label="Due Date (BS)" value={dueDate} onChange={setDueDate} minYear={bsYearNow - 1} maxYear={bsYearNow + 1} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={handleSubmit}
            disabled={!canSubmit || createBillRun.isPending}
          >
            {createBillRun.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
