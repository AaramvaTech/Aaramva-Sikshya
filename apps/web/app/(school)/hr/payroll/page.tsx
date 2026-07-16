'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { getErrorDisplay } from '@/lib/errors';
import { Plus, Trash2, Pencil, Loader2, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { AmountDisplay } from '@/components/finance/amount-display';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  usePayrollMonths,
  usePayrollSlips,
  useGeneratePayroll,
  useFinalizePayroll,
  useOpenPayrollMonth,
  useAdjustSlip,
  useDeletePayrollMonth,
} from '@/lib/hooks/use-hr';
import { useAcademicYears, useCurrentAcademicYear } from '@/lib/hooks/use-students';
import type { SalarySlip, PayrollMonth } from '@/types/api.types';

const BS_MONTHS = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

function monthLabel(pm: PayrollMonth) {
  return `${BS_MONTHS[(pm.monthBs - 1) % 12]} ${pm.yearBs}`;
}

// ─── Adjust Slip Dialog ────────────────────────────────────────────────────

const lineSchema = z.object({ name: z.string().min(1, 'Required'), amount: z.number().min(0) });
const adjustSchema = z.object({
  allowances: z.array(lineSchema),
  deductions: z.array(lineSchema),
  unpaidLeaveDays: z.number().min(0).int(),
  notes: z.string().optional(),
});
type AdjustForm = z.infer<typeof adjustSchema>;

function AdjustSlipDialog({
  slip,
  monthId,
  open,
  onClose,
}: {
  slip: SalarySlip;
  monthId: string;
  open: boolean;
  onClose: () => void;
}) {
  const adjustSlip = useAdjustSlip();

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      allowances: slip.allowances ?? [],
      deductions: slip.deductions ?? [],
      unpaidLeaveDays: slip.unpaidLeaveDays ?? 0,
      notes: slip.notes ?? '',
    },
  });

  const allowanceFields = useFieldArray({ control, name: 'allowances' });
  const deductionFields = useFieldArray({ control, name: 'deductions' });

  async function onSubmit(values: AdjustForm) {
    try {
      await adjustSlip.mutateAsync({ monthId, slipId: slip.id, data: values });
      toast.success('Salary slip updated');
      onClose();
    } catch {
      toast.error('Failed to update slip');
    }
  }

  function LineRows({
    fields,
    name,
    onAppend,
    onRemove,
    label,
  }: {
    fields: { id: string }[];
    name: 'allowances' | 'deductions';
    onAppend: () => void;
    onRemove: (i: number) => void;
    label: string;
  }) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</Label>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onAppend}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {fields.length === 0 && (
          <p className="text-xs text-gray-400 italic">None</p>
        )}
        {fields.map((field, i) => (
          <div key={field.id} className="flex gap-2 items-start">
            <Input
              placeholder="Description"
              className="h-8 text-sm flex-1"
              {...register(`${name}.${i}.name`)}
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Amount"
              className="h-8 text-sm w-28"
              {...register(`${name}.${i}.amount`, { valueAsNumber: true })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-error-600"
              onClick={() => onRemove(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjust Slip — {slip.staffName}</DialogTitle>
          <p className="text-xs text-gray-500 font-mono">{slip.employeeId}</p>
        </DialogHeader>

        <div className="text-sm text-gray-600 grid grid-cols-2 gap-y-1 mb-1">
          <span>Base Salary:</span>
          <AmountDisplay amount={slip.baseSalary} className="font-semibold text-black" />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <LineRows
            fields={allowanceFields.fields}
            name="allowances"
            label="Allowances"
            onAppend={() => allowanceFields.append({ name: '', amount: 0 })}
            onRemove={(i) => allowanceFields.remove(i)}
          />
          <LineRows
            fields={deductionFields.fields}
            name="deductions"
            label="Deductions"
            onAppend={() => deductionFields.append({ name: '', amount: 0 })}
            onRemove={(i) => deductionFields.remove(i)}
          />

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Unpaid Leave Days</Label>
            <Input
              type="number"
              min={0}
              className="h-8 text-sm w-32"
              {...register('unpaidLeaveDays', { valueAsNumber: true })}
            />
            {errors.unpaidLeaveDays && (
              <p className="text-xs text-error-600">{errors.unpaidLeaveDays.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</Label>
            <Textarea
              rows={2}
              placeholder="Optional note for this slip"
              className="text-sm resize-none"
              {...register('notes')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white" disabled={adjustSlip.isPending}>
              {adjustSlip.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Salary Slips Modal ────────────────────────────────────────────────────

function SlipsModal({
  month,
  open,
  onClose,
}: {
  month: PayrollMonth | null;
  open: boolean;
  onClose: () => void;
}) {
  const [adjustingSlip, setAdjustingSlip] = useState<SalarySlip | null>(null);
  const generatePayroll = useGeneratePayroll();
  const finalizePayroll = useFinalizePayroll();

  const { data: slips, isLoading: slipsLoading } = usePayrollSlips(month?.id ?? '');

  async function handleGenerate() {
    if (!month) return;
    try {
      await generatePayroll.mutateAsync({ monthId: month.id });
      toast.success('Salary slips generated');
    } catch {
      toast.error('Failed to generate payroll');
    }
  }

  async function handleFinalize() {
    if (!month) return;
    try {
      await finalizePayroll.mutateAsync(month.id);
      toast.success('Payroll finalized');
      onClose();
    } catch {
      toast.error('Failed to finalize');
    }
  }

  const slipList = slips ?? [];
  const isDraft = month?.status === 'DRAFT';

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <div className="flex items-center gap-3 pr-8">
              <DialogTitle>
                {month ? monthLabel(month) : ''} — Salary Slips
              </DialogTitle>
              {month && <StatusBadge status={month.status} />}
            </div>
          </DialogHeader>

          <DialogBody className="p-0 max-h-[65vh] overflow-y-auto">
            {slipsLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : slipList.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400 mb-3">No salary slips yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-stroke dark:border-strokedark sticky top-0">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Base</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Allowances</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Deductions</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Leave Ded.</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Net</th>
                    {isDraft && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-strokedark">
                  {slipList.map((slip) => (
                    <tr key={slip.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-black dark:text-white">{slip.staffName}</p>
                        <p className="text-xs text-gray-400 font-mono">{slip.employeeId}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right"><AmountDisplay amount={slip.baseSalary} /></td>
                      <td className="px-4 py-2.5 text-right text-success-600">
                        {slip.allowanceTotal > 0 ? <AmountDisplay amount={slip.allowanceTotal} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-error-600">
                        {slip.deductionTotal > 0 ? <AmountDisplay amount={slip.deductionTotal} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-error-600">
                        {slip.leaveDeduction > 0 ? <AmountDisplay amount={slip.leaveDeduction} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-brand-500">
                        <AmountDisplay amount={slip.netSalary} />
                      </td>
                      {isDraft && (
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-brand-500"
                            onClick={() => setAdjustingSlip(slip)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-white/5 border-t-2 border-stroke dark:border-strokedark font-semibold sticky bottom-0">
                    <td className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wider">{slipList.length} staff</td>
                    <td className="px-4 py-2.5 text-right text-sm"><AmountDisplay amount={slipList.reduce((s, r) => s + r.baseSalary, 0)} /></td>
                    <td className="px-4 py-2.5 text-right text-sm text-success-600"><AmountDisplay amount={slipList.reduce((s, r) => s + r.allowanceTotal, 0)} /></td>
                    <td className="px-4 py-2.5 text-right text-sm text-error-600"><AmountDisplay amount={slipList.reduce((s, r) => s + r.deductionTotal, 0)} /></td>
                    <td className="px-4 py-2.5 text-right text-sm text-error-600"><AmountDisplay amount={slipList.reduce((s, r) => s + r.leaveDeduction, 0)} /></td>
                    <td className="px-4 py-2.5 text-right text-sm text-brand-500"><AmountDisplay amount={slipList.reduce((s, r) => s + r.netSalary, 0)} /></td>
                    {isDraft && <td />}
                  </tr>
                </tfoot>
              </table>
            )}
          </DialogBody>

          {isDraft && slipList.length > 0 && (
            <DialogFooter>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={generatePayroll.isPending}
              >
                {generatePayroll.isPending
                  ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Generating…</>
                  : 'Re-generate'
                }
              </Button>
              <ConfirmDialog
                title="Finalize Payroll"
                description={`Finalize ${month ? monthLabel(month) : ''}? This locks all salary slips and cannot be undone.`}
                onConfirm={handleFinalize}
                confirmLabel="Finalize"
                trigger={
                  <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white">
                    Finalize
                  </Button>
                }
              />
            </DialogFooter>
          )}

          {isDraft && slipList.length === 0 && (
            <DialogFooter>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={generatePayroll.isPending}
              >
                {generatePayroll.isPending
                  ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Generating…</>
                  : 'Generate Slips'
                }
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {adjustingSlip && month && (
        <AdjustSlipDialog
          slip={adjustingSlip}
          monthId={month.id}
          open={!!adjustingSlip}
          onClose={() => setAdjustingSlip(null)}
        />
      )}
    </>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const [openMonthDialog, setOpenMonthDialog] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<PayrollMonth | null>(null);
  const [newMonth, setNewMonth] = useState({ monthBs: '', yearBs: '', academicYearId: '' });

  const { data: allYears } = useAcademicYears();
  const { data: currentYear } = useCurrentAcademicYear();
  const { data: payrollData, isLoading: monthsLoading } = usePayrollMonths();
  const openPayrollMonth = useOpenPayrollMonth();
  const deletePayrollMonth = useDeletePayrollMonth();

  // Paginated response → extract array
  const payrollMonths: PayrollMonth[] = (payrollData as { data?: PayrollMonth[] } | undefined)?.data ?? [];

  async function handleOpenMonth() {
    if (!newMonth.monthBs || !newMonth.yearBs || !newMonth.academicYearId) {
      toast.error('Please fill all fields');
      return;
    }
    try {
      await openPayrollMonth.mutateAsync({
        monthBs: Number(newMonth.monthBs),
        yearBs: Number(newMonth.yearBs),
        academicYearId: newMonth.academicYearId,
      });
      toast.success('Payroll month opened');
      setOpenMonthDialog(false);
      setNewMonth({ monthBs: '', yearBs: '', academicYearId: '' });
    } catch {
      toast.error('Failed to open payroll month');
    }
  }

  function openDialog() {
    if (currentYear && !newMonth.academicYearId) {
      const yearBs = currentYear.name.split('/')[0].trim();
      setNewMonth((p) => ({ ...p, academicYearId: currentYear.id, yearBs }));
    }
    setOpenMonthDialog(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Monthly staff salary processing"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={openDialog}
          >
            <Plus className="h-4 w-4 mr-1" />
            Open Month
          </Button>
        }
      />

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark overflow-hidden">
        {monthsLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-sm" />
            ))}
          </div>
        ) : payrollMonths.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-12">
            No payroll months yet. Click "Open Month" to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-white/5 border-b border-stroke dark:border-strokedark">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Period</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke dark:divide-strokedark">
              {payrollMonths.map((pm) => (
                <tr key={pm.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-black dark:text-white">{monthLabel(pm)}</p>
                    <p className="text-xs text-gray-400">BS {pm.yearBs}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={pm.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 justify-end items-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-brand-500 hover:text-brand-600"
                        onClick={() => setSelectedMonth(pm)}
                      >
                        View Slips <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                      {pm.status === 'DRAFT' && (
                        <ConfirmDialog
                          title="Delete Payroll Month"
                          description={`Delete ${monthLabel(pm)}? All generated salary slips will also be deleted.`}
                          onConfirm={() =>
                            deletePayrollMonth.mutate(pm.id, {
                              onSuccess: () => toast.success('Payroll month deleted'),
                              onError: (err) => toast.error(getErrorDisplay(err).message),
                            })
                          }
                          confirmLabel="Delete"
                          variant="destructive"
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-error-500 hover:text-error-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Open Month Dialog */}
      <Dialog open={openMonthDialog} onOpenChange={(open) => { if (!open) setOpenMonthDialog(false); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Open Payroll Month</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Month (BS) *</Label>
              <Select
                value={newMonth.monthBs || 'NONE'}
                onValueChange={(v) => setNewMonth((p) => ({ ...p, monthBs: v === 'NONE' ? '' : (v ?? '') }))}
              >
                <SelectTrigger>
                  <span className={newMonth.monthBs ? '' : 'text-muted-foreground'}>
                    {newMonth.monthBs ? BS_MONTHS[(Number(newMonth.monthBs) - 1) % 12] : 'Select month'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Select month</SelectItem>
                  {BS_MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Academic Year *</Label>
              <Select
                value={newMonth.academicYearId || 'NONE'}
                onValueChange={(v) => {
                  const id = v === 'NONE' ? '' : (v ?? '');
                  const year = allYears?.find((y) => y.id === id);
                  const yearBs = year ? year.name.split('/')[0].trim() : newMonth.yearBs;
                  setNewMonth((p) => ({ ...p, academicYearId: id, yearBs }));
                }}
              >
                <SelectTrigger>
                  <span className={newMonth.academicYearId ? '' : 'text-muted-foreground'}>
                    {newMonth.academicYearId
                      ? (() => {
                          const y = allYears?.find((y) => y.id === newMonth.academicYearId);
                          return y ? `${y.name}${y.isCurrent ? ' (Current)' : ''}` : 'Loading…';
                        })()
                      : 'Select academic year'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Select academic year</SelectItem>
                  {allYears?.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}{y.isCurrent ? ' (Current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="year-bs">Year (BS) *</Label>
              <Input
                id="year-bs"
                type="number"
                placeholder="e.g. 2081"
                value={newMonth.yearBs}
                onChange={(e) => setNewMonth((p) => ({ ...p, yearBs: e.target.value }))}
              />
              <p className="text-xs text-gray-400">Auto-filled from academic year. Adjust if needed.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMonthDialog(false)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleOpenMonth}
              disabled={openPayrollMonth.isPending}
            >
              {openPayrollMonth.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening…</> : 'Open Month'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SlipsModal
        month={selectedMonth}
        open={!!selectedMonth}
        onClose={() => setSelectedMonth(null)}
      />
    </div>
  );
}
