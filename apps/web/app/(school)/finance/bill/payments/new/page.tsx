'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Search, Loader2, CheckCircle2 } from 'lucide-react';
import { todayBs } from 'bs-calendar';
import { PageHeader } from '@/components/shared/page-header';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AmountDisplay, formatNPR } from '@/components/finance/amount-display';
import { PrintDocumentButton } from '@/components/finance/print-document-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAcademicYears, useCurrentAcademicYear, useStudents } from '@/lib/hooks/use-students';
import { useStudentOutstandingInvoices, useStudentBalance, useRecordPayment } from '@/lib/hooks/use-bill-payment';
import { COUNTER_PAYMENT_METHODS, canSubmitBillPayment, sumManualTargets, buildPaymentConfirmationText } from '@/lib/bill-payment-form';
import { extractApiErrors } from '@/lib/api-errors';
import { useAuthStore } from '@/store/auth.store';
import type { BillPayment, BillPaymentAllocationMode, BillPaymentMethod, StudentSummary } from '@/types/api.types';

/** Mirrors BillPaymentController's own MANUAL_ALLOCATION_ROLES exactly (not
 * route-access.ts's OWNER_PRINCIPAL, which omits PLATFORM_ADMIN) — the point
 * is to mirror the real backend guard, not just approximate it. */
const MANUAL_ALLOCATION_ROLES = ['PLATFORM_ADMIN', 'SCHOOL_OWNER', 'PRINCIPAL'];

const ALLOCATION_MODES: { mode: BillPaymentAllocationMode; label: string }[] = [
  { mode: 'AUTO_FIFO', label: 'Auto (Oldest First)' },
  { mode: 'MANUAL', label: 'Manual' },
  { mode: 'ADVANCE_ONLY', label: 'Advance Only' },
];

function todayAd() {
  return new Date().toISOString().split('T')[0];
}

export default function RecordPaymentPage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const canManualAllocate = !!role && MANUAL_ALLOCATION_ROLES.includes(role);
  const bsYearNow = useMemo(() => todayBs().year, []);

  // Student picker
  const [studentSearch, setStudentSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [academicYearId, setAcademicYearId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<BillPaymentMethod>('CASH');
  const [allocationMode, setAllocationMode] = useState<BillPaymentAllocationMode>('AUTO_FIFO');
  const [manualTargets, setManualTargets] = useState<Record<string, string>>({}); // billInvoiceId -> amount
  const [chequeBank, setChequeBank] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<BillPayment | null>(null);

  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const effectiveYearId = academicYearId || currentYear?.id || '';

  const { data: studentsData } = useStudents({ search: searchQuery, limit: 10, page: 1 });
  const searchResults = studentsData?.data?.data ?? [];

  const { data: outstandingInvoices, isLoading: invoicesLoading } = useStudentOutstandingInvoices(selectedStudent?.id ?? null);
  const { data: studentBalance } = useStudentBalance(selectedStudent?.id ?? null);
  const recordPayment = useRecordPayment();

  function handleSearchInput(value: string) {
    setStudentSearch(value);
    setSelectedStudent(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
      setShowDropdown(true);
    }, 300);
  }

  function handleSelectStudent(student: StudentSummary) {
    setSelectedStudent(student);
    setStudentSearch(`${student.firstName} ${student.lastName} (${student.studentId})`);
    setShowDropdown(false);
    setManualTargets({});
  }

  function toggleManualTarget(invoiceId: string, invoiceBalance: number, checked: boolean) {
    setManualTargets((prev) => {
      const next = { ...prev };
      if (checked) next[invoiceId] = String(invoiceBalance);
      else delete next[invoiceId];
      return next;
    });
  }

  function reset() {
    setStudentSearch('');
    setSearchQuery('');
    setSelectedStudent(null);
    setAcademicYearId('');
    setAmount('');
    setMethod('CASH');
    setAllocationMode('AUTO_FIFO');
    setManualTargets({});
    setChequeBank('');
    setChequeDate('');
    setReceivedDate('');
    setReference('');
    setNotes('');
    setResult(null);
  }

  const targets = Object.entries(manualTargets).map(([billInvoiceId, amt]) => ({ billInvoiceId, amount: amt }));
  const manualSum = sumManualTargets(targets);

  const canSubmit = !!selectedStudent && canSubmitBillPayment({
    studentId: selectedStudent?.id ?? '',
    academicYearId: effectiveYearId,
    amount,
    method,
    allocationMode,
    targets,
    chequeBank,
    chequeDate,
    reference,
  });

  // UI-4 eyeball finding — a money-moving submit needs a confirmation naming
  // the amount, method, student, and what it settles, same standard as
  // UI-3's bill-run Post confirmation. Built from the same fields the submit
  // itself uses, so it can never drift out of sync with what actually posts.
  const confirmationText = selectedStudent
    ? buildPaymentConfirmationText({
        studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`,
        amount,
        method,
        allocationMode,
        manualAllocations: targets.map((t) => ({
          invoiceNumber: outstandingInvoices?.find((inv) => inv.id === t.billInvoiceId)?.invoiceNumber ?? t.billInvoiceId,
          amount: t.amount,
        })),
      })
    : '';

  async function handleSubmit() {
    if (!selectedStudent || !canSubmit) { toast.error('Fill in every required field'); return; }
    try {
      const res = await recordPayment.mutateAsync({
        studentId: selectedStudent.id,
        academicYearId: effectiveYearId,
        amount,
        method,
        allocationMode,
        targets: allocationMode === 'MANUAL' ? targets : undefined,
        receivedDate: receivedDate || undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        chequeBank: method === 'CHEQUE' ? chequeBank : undefined,
        chequeDate: method === 'CHEQUE' ? chequeDate : undefined,
      });
      setResult(res.data.data);
    } catch (err) {
      extractApiErrors(err, 'Failed to record payment').forEach((m) => toast.error(m));
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/finance/bill/payments" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Payments
      </Link>

      <PageHeader title="Record Payment" description="Record a cash, cheque, or bank transfer payment against a student's invoices" />

      {result ? (
        <div className="rounded-sm border border-stroke bg-white p-8 text-center shadow-default dark:border-strokedark dark:bg-boxdark">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success-500" />
          <p className="mt-3 font-mono text-lg font-semibold text-gray-900 dark:text-white">{result.receiptNumber}</p>
          <p className="mt-1 text-2xl font-bold text-success-600"><AmountDisplay amount={result.amount} /></p>
          <p className="mt-1 text-sm text-gray-500">{result.method.replace(/_/g, ' ')} · {result.allocationMode.replace(/_/g, ' ')}</p>

          <div className="mt-6 mx-auto max-w-sm text-left">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Allocations</p>
            {!result.allocations || result.allocations.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Fully unallocated — held as advance credit</p>
            ) : (
              <div className="space-y-1.5">
                {result.allocations.map((a) => (
                  <div key={a.id} className="flex justify-between text-sm">
                    <span className="font-mono text-xs text-gray-500">Invoice …{a.billInvoiceId.slice(-8)}</span>
                    <AmountDisplay amount={a.amount} />
                  </div>
                ))}
                {result.amount - result.allocations.reduce((s, a) => s + a.amount, 0) > 0 && (
                  <div className="flex justify-between text-sm text-brand-600">
                    <span>Advance credit remainder</span>
                    <AmountDisplay amount={result.amount - result.allocations.reduce((s, a) => s + a.amount, 0)} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BILL-8-UI Phase 1: the load-bearing counter moment. The clerk has
              the parent in front of them right now — the receipt has to be
              here, not only in payment history. */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PrintDocumentButton doc={{ kind: 'receipt', paymentId: result.id }} />
            <Button variant="outline" onClick={reset}>Record Another</Button>
            <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => router.push('/finance/bill/payments')}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark space-y-5 max-w-2xl">
          <div className="space-y-1.5">
            <Label>Student *</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Search student by name or admission no."
                value={studentSearch}
                onChange={(e) => handleSearchInput(e.target.value)}
                onFocus={() => searchQuery && setShowDropdown(true)}
              />
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white dark:bg-gray-900 shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((s) => (
                    <button
                      key={s.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5 flex items-center justify-between"
                      onClick={() => handleSelectStudent(s)}
                    >
                      <span className="font-medium">{s.firstName} {s.lastName}</span>
                      <span className="text-xs text-gray-400 font-mono">{s.studentId}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {selectedStudent && (
            <>
              {/* ── Context: outstanding invoices + advance balance ── */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Outstanding Invoices</p>
                  {studentBalance && studentBalance.sign === 'ADVANCE' && (
                    <span className="text-xs font-medium text-brand-600">
                      Advance credit: {formatNPR(studentBalance.balance)}
                    </span>
                  )}
                </div>
                {invoicesLoading ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : !outstandingInvoices || outstandingInvoices.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No outstanding invoices for this student.</p>
                ) : (
                  <div className="space-y-2">
                    {outstandingInvoices.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-3 text-sm">
                        {allocationMode === 'MANUAL' && (
                          <Checkbox
                            checked={inv.id in manualTargets}
                            onCheckedChange={(checked) => toggleManualTarget(inv.id, inv.balance, !!checked)}
                          />
                        )}
                        <span className="font-mono text-xs text-gray-500 flex-1">{inv.invoiceNumber}</span>
                        {allocationMode === 'MANUAL' && inv.id in manualTargets ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="h-7 w-28 text-right"
                            value={manualTargets[inv.id]}
                            onChange={(e) => setManualTargets((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                          />
                        ) : (
                          <AmountDisplay amount={inv.balance} className={inv.balance > 0 ? 'text-error-600' : ''} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Amount *</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Method *</Label>
                  <Select value={method} onValueChange={(v) => v && setMethod(v as BillPaymentMethod)}>
                    <SelectTrigger><span>{method.replace(/_/g, ' ')}</span></SelectTrigger>
                    <SelectContent>
                      {COUNTER_PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Academic Year *</Label>
                <Select value={effectiveYearId} onValueChange={(v) => setAcademicYearId(v ?? '')}>
                  <SelectTrigger>
                    <span>{effectiveYearId ? (allYears?.find((y) => y.id === effectiveYearId)?.name ?? 'Loading…') : 'Select year'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {allYears?.map((y) => <SelectItem key={y.id} value={y.id}>{y.name} {y.isCurrent ? '(Current)' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Allocation</Label>
                <div className="flex border-b border-gray-200 dark:border-gray-800 -mx-6 px-6">
                  {ALLOCATION_MODES.filter((a) => a.mode !== 'MANUAL' || canManualAllocate).map((a) => (
                    <button
                      key={a.mode}
                      onClick={() => setAllocationMode(a.mode)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        allocationMode === a.mode
                          ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                {allocationMode === 'AUTO_FIFO' && (
                  <p className="text-xs text-gray-400 pt-2">Settles the oldest outstanding invoices first, no picking needed.</p>
                )}
                {allocationMode === 'MANUAL' && (
                  <p className="text-xs text-gray-400 pt-2">
                    Check invoices above and edit the amount applied to each. Selected: {formatNPR(manualSum)}
                    {amount && ` of ${formatNPR(Number(amount) || 0)}`}.
                  </p>
                )}
                {allocationMode === 'ADVANCE_ONLY' && (
                  <p className="text-xs text-gray-400 pt-2">No invoice is touched — the whole amount becomes advance credit.</p>
                )}
              </div>

              {method === 'CHEQUE' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Cheque Bank *</Label>
                    <Input value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} placeholder="e.g. NIC Asia" />
                  </div>
                  <BsDateInput label="Cheque Date (BS) *" value={chequeDate} onChange={setChequeDate} minYear={bsYearNow - 1} maxYear={bsYearNow + 1} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <BsDateInput label="Received Date (BS)" value={receivedDate} onChange={setReceivedDate} minYear={bsYearNow - 1} maxYear={bsYearNow + 1} />
                <div className="space-y-1.5">
                  <Label>Reference {method !== 'CASH' && '*'}</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === 'CASH' ? 'Optional' : 'Cheque / transfer no.'} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => router.push('/finance/bill/payments')}>Cancel</Button>
                {canSubmit && !recordPayment.isPending ? (
                  // Not <Button disabled> + onClick — ConfirmDialog's own trigger span
                  // opens on click regardless of a wrapped button's disabled attribute,
                  // so canSubmit/isPending gate which branch renders instead.
                  <ConfirmDialog
                    title="Record Payment"
                    description={confirmationText}
                    confirmLabel="Record Payment"
                    onConfirm={handleSubmit}
                    trigger={
                      <Button className="bg-brand-500 hover:bg-brand-600 text-white">
                        Record Payment
                      </Button>
                    }
                  />
                ) : (
                  <Button className="bg-brand-500 hover:bg-brand-600 text-white" disabled>
                    {recordPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Record Payment
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
