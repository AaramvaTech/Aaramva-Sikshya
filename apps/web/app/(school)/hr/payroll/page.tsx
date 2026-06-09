'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { AmountDisplay } from '@/components/finance/amount-display';
import { StatusBadge } from '@/components/shared/status-badge';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  usePayrollMonths,
  usePayrollSlips,
  useGeneratePayroll,
  useFinalizePayroll,
  useOpenPayrollMonth,
} from '@/lib/hooks/use-hr';

const BS_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra'];

export default function PayrollPage() {
  const [openMonthDialog, setOpenMonthDialog] = useState(false);
  const [slipsSheetOpen, setSlipsSheetOpen] = useState(false);
  const [selectedMonthId, setSelectedMonthId] = useState('');
  const [selectedMonthLabel, setSelectedMonthLabel] = useState('');

  const [newMonth, setNewMonth] = useState({ monthBs: '', yearBs: '', academicYearId: '' });

  const { data: payrollMonths, isLoading: monthsLoading } = usePayrollMonths();
  const { data: slips, isLoading: slipsLoading } = usePayrollSlips(selectedMonthId);
  const generatePayroll = useGeneratePayroll();
  const finalizePayroll = useFinalizePayroll();
  const openPayrollMonth = useOpenPayrollMonth();

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

  async function handleGenerate(monthId: string) {
    try {
      await generatePayroll.mutateAsync({ monthId });
      toast.success('Payroll generated');
    } catch {
      toast.error('Failed to generate payroll');
    }
  }

  async function handleFinalize(monthId: string) {
    try {
      await finalizePayroll.mutateAsync(monthId);
      toast.success('Payroll finalized');
    } catch {
      toast.error('Failed to finalize payroll');
    }
  }

  function openSlips(monthId: string, label: string) {
    setSelectedMonthId(monthId);
    setSelectedMonthLabel(label);
    setSlipsSheetOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Manage monthly salary processing"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={() => setOpenMonthDialog(true)}
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
        ) : payrollMonths && payrollMonths.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-stroke dark:border-strokedark">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Year</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke dark:divide-strokedark">
              {payrollMonths.map((pm) => {
                const monthName = BS_MONTHS[(pm.monthBs - 1) % 12];
                const label = `${monthName} ${pm.yearBs}`;
                return (
                  <tr key={pm.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-black dark:text-white">{pm.yearBs}</td>
                    <td className="px-4 py-3 text-gray-500">{monthName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={pm.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        {pm.status === 'DRAFT' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleGenerate(pm.id)}
                              disabled={generatePayroll.isPending}
                            >
                              Generate
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs text-blue-600 border-blue-300 hover:bg-blue-50"
                              onClick={() => handleFinalize(pm.id)}
                              disabled={finalizePayroll.isPending}
                            >
                              Finalize
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-brand-500 hover:text-brand-600"
                          onClick={() => openSlips(pm.id, label)}
                        >
                          View Slips
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500 text-center py-10">No payroll months yet. Open a new month to get started.</p>
        )}
      </div>

      <Dialog open={openMonthDialog} onOpenChange={(open) => { if (!open) setOpenMonthDialog(false); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Open Payroll Month</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Month (BS) *</Label>
              <Select value={newMonth.monthBs || 'NONE'} onValueChange={(v) => setNewMonth((p) => ({ ...p, monthBs: (v ?? '') === 'NONE' ? '' : (v ?? '') }))}>
                <SelectTrigger>
                  <span className="truncate">
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
              <Label htmlFor="year-bs">Year (BS) *</Label>
              <Input
                id="year-bs"
                type="number"
                placeholder="e.g. 2081"
                value={newMonth.yearBs}
                onChange={(e) => setNewMonth((p) => ({ ...p, yearBs: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ay-id">Academic Year ID *</Label>
              <Input
                id="ay-id"
                placeholder="Academic year UUID"
                value={newMonth.academicYearId}
                onChange={(e) => setNewMonth((p) => ({ ...p, academicYearId: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMonthDialog(false)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleOpenMonth}
              disabled={openPayrollMonth.isPending}
            >
              {openPayrollMonth.isPending ? 'Opening…' : 'Open Month'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={slipsSheetOpen} onOpenChange={setSlipsSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Salary Slips — {selectedMonthLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 rounded-sm border border-stroke dark:border-strokedark overflow-hidden">
            {slipsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-sm" />
                ))}
              </div>
            ) : slips && slips.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-stroke dark:border-strokedark">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Emp ID</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Base</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Allowances</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Deductions</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Leave Ded.</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Salary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-strokedark">
                  {slips.map((slip) => (
                    <tr key={slip.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-black dark:text-white">{slip.staffName}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-500 text-xs">{slip.employeeId}</td>
                      <td className="px-3 py-2.5 text-right"><AmountDisplay amount={slip.baseSalary} /></td>
                      <td className="px-3 py-2.5 text-right text-success-600"><AmountDisplay amount={slip.allowanceTotal} /></td>
                      <td className="px-3 py-2.5 text-right text-error-600"><AmountDisplay amount={slip.deductionTotal} /></td>
                      <td className="px-3 py-2.5 text-right text-error-600"><AmountDisplay amount={slip.leaveDeduction} /></td>
                      <td className="px-3 py-2.5 text-right font-semibold text-brand-500"><AmountDisplay amount={slip.netSalary} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No salary slips for this month. Generate payroll first.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
