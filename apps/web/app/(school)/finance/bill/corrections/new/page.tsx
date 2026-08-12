'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AmountDisplay, formatNPR } from '@/components/finance/amount-display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAcademicYears, useCurrentAcademicYear, useStudents } from '@/lib/hooks/use-students';
import { useCorrectionReasons } from '@/lib/hooks/use-bill-catalog';
import { useStudentOutstandingInvoices, useStudentBalance, useBillInvoiceDetail } from '@/lib/hooks/use-bill-payment';
import {
  useBillCorrections, useFinanceSettings,
  useRequestCreditNote, useRequestRefund, useRequestWriteOff,
} from '@/lib/hooks/use-bill-correction';
import {
  sumApprovedCorrectionsForInvoice, sumApprovedCorrectionsForItem,
  creditNoteCapPreview, refundCapPreview, writeOffCapPreview,
  canSubmitCorrection,
} from '@/lib/bill-correction-form';
import { extractApiErrors } from '@/lib/api-errors';
import type { BillCorrectionType, RefundMethod, StudentSummary } from '@/types/api.types';

const TYPES: { type: BillCorrectionType; label: string }[] = [
  { type: 'CREDIT_NOTE', label: 'Credit Note' },
  { type: 'REFUND', label: 'Refund' },
  { type: 'WRITE_OFF', label: 'Write-off' },
];

const WHOLE_BALANCE = '__WHOLE_BALANCE__';
const WHOLE_INVOICE = '__WHOLE_INVOICE__';

/**
 * UI-5-SPEC.md §3.2 — one page, one type switcher (ruling 3), three POSTs
 * underneath. Student/invoice/balance pickers reused verbatim from UI-4's
 * payment-counter form.
 */
export default function NewCorrectionPage() {
  const router = useRouter();
  const [type, setType] = useState<BillCorrectionType>('CREDIT_NOTE');

  // Student picker — identical shape to payments/new/page.tsx.
  const [studentSearch, setStudentSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [academicYearId, setAcademicYearId] = useState('');
  const [amount, setAmount] = useState('');
  const [reasonId, setReasonId] = useState('');

  // Credit Note fields
  const [targetInvoiceId, setTargetInvoiceId] = useState('');
  const [targetInvoiceItemId, setTargetInvoiceItemId] = useState(WHOLE_INVOICE);

  // Refund fields
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('CASH');
  const [refundReference, setRefundReference] = useState('');

  // Write-off fields — targetInvoiceId reused; WHOLE_BALANCE sentinel means "no invoice"
  const [writeOffTarget, setWriteOffTarget] = useState(WHOLE_BALANCE);

  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const effectiveYearId = academicYearId || currentYear?.id || '';

  const { data: studentsData } = useStudents({ search: searchQuery, limit: 10, page: 1 });
  const searchResults = studentsData?.data?.data ?? [];

  const { data: reasons } = useCorrectionReasons();
  const { data: financeSettings } = useFinanceSettings();
  const { data: outstandingInvoices, isLoading: invoicesLoading } = useStudentOutstandingInvoices(selectedStudent?.id ?? null);
  const { data: studentBalance } = useStudentBalance(selectedStudent?.id ?? null);
  const { data: invoiceDetail } = useBillInvoiceDetail(type === 'CREDIT_NOTE' && targetInvoiceId ? targetInvoiceId : null);
  // Prior APPROVED corrections against this student — feeds the cap preview
  // (§3.2's non-authoritative "credited" math, mirroring creditableAmount).
  const { data: priorCorrections } = useBillCorrections({ studentId: selectedStudent?.id, status: 'APPROVED', limit: 100 });
  const priorApproved = priorCorrections?.data ?? [];

  const requestCreditNote = useRequestCreditNote();
  const requestRefund = useRequestRefund();
  const requestWriteOff = useRequestWriteOff();
  const isPending = requestCreditNote.isPending || requestRefund.isPending || requestWriteOff.isPending;

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
    setTargetInvoiceId('');
    setTargetInvoiceItemId(WHOLE_INVOICE);
    setWriteOffTarget(WHOLE_BALANCE);
  }

  // ── Cap preview (§3.2) — non-authoritative, backend re-validates for real ──
  let capPreview: number | null = null;
  let capLabel = '';
  if (type === 'CREDIT_NOTE' && targetInvoiceId) {
    const invoice = outstandingInvoices?.find((inv) => inv.id === targetInvoiceId);
    if (targetInvoiceItemId !== WHOLE_INVOICE) {
      const item = invoiceDetail?.items?.find((i) => i.id === targetInvoiceItemId);
      if (item) {
        capPreview = creditNoteCapPreview(item.netAmount, sumApprovedCorrectionsForItem(priorApproved, item.id));
        capLabel = 'this line';
      }
    } else if (invoice) {
      capPreview = creditNoteCapPreview(invoice.balance, sumApprovedCorrectionsForInvoice(priorApproved, invoice.id));
      capLabel = 'this invoice';
    }
  } else if (type === 'REFUND' && studentBalance) {
    capPreview = refundCapPreview(studentBalance.balance, studentBalance.sign);
    capLabel = 'available advance credit';
  } else if (type === 'WRITE_OFF' && studentBalance) {
    if (writeOffTarget !== WHOLE_BALANCE) {
      const invoice = outstandingInvoices?.find((inv) => inv.id === writeOffTarget);
      if (invoice) {
        capPreview = writeOffCapPreview(
          { balance: invoice.balance, priorApprovedCredited: sumApprovedCorrectionsForInvoice(priorApproved, invoice.id) },
          studentBalance.balance, studentBalance.sign,
        );
        capLabel = 'this invoice';
      }
    } else {
      capPreview = writeOffCapPreview(null, studentBalance.balance, studentBalance.sign);
      capLabel = 'overall owed balance';
    }
  }

  const willAutoPost = type === 'CREDIT_NOTE'
    && financeSettings != null
    && Number(amount) > 0
    && Number(amount) < financeSettings.creditNoteApprovalThreshold;

  const draftFields = {
    studentId: selectedStudent?.id ?? '',
    academicYearId: effectiveYearId,
    amount,
    reasonId,
    targetInvoiceId: type === 'WRITE_OFF' ? (writeOffTarget === WHOLE_BALANCE ? '' : writeOffTarget) : targetInvoiceId,
    refundMethod,
    refundReference,
  };
  const canSubmit = !!selectedStudent && canSubmitCorrection(type, draftFields);

  const confirmationText = (() => {
    const studentName = selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : '';
    const amountText = formatNPR(Number(amount) || 0);
    if (type === 'CREDIT_NOTE') {
      return `Request a ${amountText} credit note for ${studentName}? `
        + (willAutoPost
          ? 'This is below the approval threshold and posts immediately.'
          : 'This is at or above the approval threshold and needs owner approval before it posts.');
    }
    if (type === 'REFUND') {
      return `Request a ${amountText} ${refundMethod.replace('_', ' ').toLowerCase()} refund for ${studentName}? This always needs owner approval before it posts.`;
    }
    return `Request a ${amountText} write-off for ${studentName}${writeOffTarget !== WHOLE_BALANCE ? ' against the selected invoice' : ' against their overall balance'}? This always needs owner approval before it posts.`;
  })();

  async function handleSubmit() {
    if (!selectedStudent || !canSubmit) { toast.error('Fill in every required field'); return; }
    try {
      if (type === 'CREDIT_NOTE') {
        const res = await requestCreditNote.mutateAsync({
          studentId: selectedStudent.id,
          academicYearId: effectiveYearId,
          targetInvoiceId,
          targetInvoiceItemId: targetInvoiceItemId !== WHOLE_INVOICE ? targetInvoiceItemId : undefined,
          amount,
          reasonId,
        });
        router.push(`/finance/bill/corrections/${res.data.data.id}`);
      } else if (type === 'REFUND') {
        const res = await requestRefund.mutateAsync({
          studentId: selectedStudent.id,
          academicYearId: effectiveYearId,
          amount,
          reasonId,
          refundMethod,
          refundReference: refundReference || undefined,
        });
        router.push(`/finance/bill/corrections/${res.data.data.id}`);
      } else {
        const res = await requestWriteOff.mutateAsync({
          studentId: selectedStudent.id,
          academicYearId: effectiveYearId,
          targetInvoiceId: writeOffTarget !== WHOLE_BALANCE ? writeOffTarget : undefined,
          amount,
          reasonId,
        });
        router.push(`/finance/bill/corrections/${res.data.data.id}`);
      }
    } catch (err) {
      extractApiErrors(err, 'Failed to request correction').forEach((m) => toast.error(m));
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/finance/bill/corrections" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Corrections
      </Link>

      <PageHeader title="New Correction" description="Request a credit note, refund, or write-off against a student's invoices" />

      <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark space-y-5 max-w-2xl">
        {/* ── Type switcher ── */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 -mx-6 px-6">
          {TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => setType(t.type)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                type === t.type
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

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
            {studentBalance && studentBalance.sign !== 'ZERO' && (
              <p className="text-xs text-gray-500">
                Current balance: <span className={studentBalance.sign === 'OWES' ? 'text-error-600' : 'text-brand-600'}>
                  {studentBalance.sign === 'OWES' ? 'Owes' : 'Advance credit'} {formatNPR(studentBalance.balance)}
                </span>
              </p>
            )}

            {type === 'CREDIT_NOTE' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Invoice *</Label>
                  <Select value={targetInvoiceId} onValueChange={(v) => { setTargetInvoiceId(v ?? ''); setTargetInvoiceItemId(WHOLE_INVOICE); }}>
                    <SelectTrigger>
                      <span>{invoicesLoading ? 'Loading…' : (outstandingInvoices?.find((i) => i.id === targetInvoiceId)?.invoiceNumber ?? 'Select invoice')}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {outstandingInvoices?.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>{inv.invoiceNumber} — {formatNPR(inv.balance)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {targetInvoiceId && invoiceDetail?.items && invoiceDetail.items.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Line (optional — credits the whole invoice if left as-is)</Label>
                    <Select value={targetInvoiceItemId} onValueChange={(v) => setTargetInvoiceItemId(v ?? WHOLE_INVOICE)}>
                      <SelectTrigger>
                        <span>{targetInvoiceItemId === WHOLE_INVOICE ? 'Whole invoice' : invoiceDetail.items.find((i) => i.id === targetInvoiceItemId)?.itemName}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={WHOLE_INVOICE}>Whole invoice</SelectItem>
                        {invoiceDetail.items.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.itemName} — {formatNPR(item.netAmount)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {type === 'REFUND' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Method *</Label>
                  <Select value={refundMethod} onValueChange={(v) => v && setRefundMethod(v as RefundMethod)}>
                    <SelectTrigger><span>{refundMethod.replace('_', ' ')}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">CASH</SelectItem>
                      <SelectItem value="BANK_TRANSFER">BANK TRANSFER</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Reference {refundMethod === 'BANK_TRANSFER' && '*'}</Label>
                  <Input value={refundReference} onChange={(e) => setRefundReference(e.target.value)} placeholder={refundMethod === 'BANK_TRANSFER' ? 'Transfer reference' : 'Optional'} />
                </div>
              </div>
            )}

            {type === 'WRITE_OFF' && (
              <div className="space-y-1.5">
                <Label>Target *</Label>
                <Select value={writeOffTarget} onValueChange={(v) => setWriteOffTarget(v ?? WHOLE_BALANCE)}>
                  <SelectTrigger>
                    <span>{writeOffTarget === WHOLE_BALANCE ? 'Whole balance (no specific invoice)' : outstandingInvoices?.find((i) => i.id === writeOffTarget)?.invoiceNumber}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={WHOLE_BALANCE}>Whole balance (no specific invoice)</SelectItem>
                    {outstandingInvoices?.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>{inv.invoiceNumber} — {formatNPR(inv.balance)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
            </div>

            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Select value={reasonId} onValueChange={(v) => setReasonId(v ?? '')}>
                <SelectTrigger>
                  <span>{reasons?.find((r) => r.id === reasonId)?.name ?? 'Select reason'}</span>
                </SelectTrigger>
                <SelectContent>
                  {reasons?.filter((r) => r.isActive).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* ── Cap preview (§3.2) — explicitly non-authoritative ── */}
            {capPreview !== null && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/5 px-4 py-2.5 text-sm">
                <span className="text-gray-500">Estimated limit ({capLabel}): </span>
                <AmountDisplay amount={capPreview} className="font-semibold" />
                <span className="text-xs text-gray-400 ml-2">re-checked on submit</span>
              </div>
            )}
            {type === 'CREDIT_NOTE' && amount && Number(amount) > 0 && financeSettings && (
              <p className="text-xs text-gray-400">
                {willAutoPost
                  ? `Below the ${formatNPR(financeSettings.creditNoteApprovalThreshold)} approval threshold — posts immediately.`
                  : `At or above the ${formatNPR(financeSettings.creditNoteApprovalThreshold)} approval threshold — needs owner approval.`}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => router.push('/finance/bill/corrections')}>Cancel</Button>
              {canSubmit && !isPending ? (
                <ConfirmDialog
                  title="Request Correction"
                  description={confirmationText}
                  confirmLabel="Request Correction"
                  onConfirm={handleSubmit}
                  trigger={<Button className="bg-brand-500 hover:bg-brand-600 text-white">Request Correction</Button>}
                />
              ) : (
                <Button className="bg-brand-500 hover:bg-brand-600 text-white" disabled>Request Correction</Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
