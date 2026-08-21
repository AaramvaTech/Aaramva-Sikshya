'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Wallet, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorDisplay } from '@/lib/errors';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { AmountDisplay } from '@/components/finance/amount-display';
import { BillPaymentStatusBadge } from '@/components/finance/bill-payment-status-badge';
import { PaymentDetailModal } from '@/components/finance/payment-detail-modal';
import { PrintLanguageItems } from '@/components/finance/print-document-button';
import { canPrintReceipt, receiptPrintLabel } from '@/lib/print-document';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBillPayments, useUpdateChequeStatus, useVoidPayment } from '@/lib/hooks/use-bill-payment';
import { useAuthStore } from '@/store/auth.store';
import type { BillPayment, BillPaymentMethod, BillPaymentStatus } from '@/types/api.types';

const METHODS: BillPaymentMethod[] = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'ESEWA', 'KHALTI'];
const STATUSES: BillPaymentStatus[] = ['CLEARED', 'PENDING', 'BOUNCED', 'VOIDED'];
const OWNER_ROLES = ['SCHOOL_OWNER', 'PLATFORM_ADMIN'];

/**
 * UI-4-CHECKPOINT-A-SPEC.md §3.1 — <DataTable> shape lifted from the
 * invoices/bill-runs list pages. No student-name text search: BillPaymentQueryDto
 * only filters by an exact studentId, not a search string — matches what the
 * backend actually supports rather than building a filter that can't work.
 */
export default function BillPaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = !!role && OWNER_ROLES.includes(role);

  const page = Number(searchParams.get('page') ?? '1');
  const method = searchParams.get('method') ?? '';
  const status = searchParams.get('status') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';

  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  const { data: paymentsData, isLoading } = useBillPayments({
    page,
    limit: 20,
    method: method || undefined,
    status: status || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const updateCheque = useUpdateChequeStatus();
  const voidPayment = useVoidPayment();

  const payments = paymentsData?.data ?? [];
  const meta = paymentsData?.meta;
  const activeFilterCount = [method, status, dateFrom, dateTo].filter(Boolean).length;

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val) params.set(key, val);
      else params.delete(key);
    });
    router.push(`?${params.toString()}`);
  }

  function clearFilters() {
    router.push('?');
  }

  function handleChequeTransition(id: string, receiptNumber: string, next: 'CLEARED' | 'BOUNCED') {
    updateCheque.mutate(
      { id, data: { status: next } },
      {
        onSuccess: () => toast.success(`${receiptNumber} marked ${next.toLowerCase()}`),
        onError: (err) => toast.error(getErrorDisplay(err).message),
      },
    );
  }

  function handleVoid(id: string, receiptNumber: string) {
    // Plain confirm(), not <ConfirmDialog>, matching the invoices list page's
    // own precedent for a destructive action triggered from inside a dropdown
    // — nesting a Radix Dialog inside a Radix DropdownMenuItem is untested in
    // this codebase and risks focus/portal interaction bugs.
    if (!confirm(`Void payment ${receiptNumber}? This is permanent — if a ledger entry was posted, it will be reversed, never edited or deleted.`)) return;
    voidPayment.mutate(
      { id, data: {} },
      {
        onSuccess: () => toast.success(`${receiptNumber} voided`),
        onError: (err) => toast.error(getErrorDisplay(err).message),
      },
    );
  }

  const columns: ColumnDef<BillPayment>[] = [
    {
      id: 'receiptNumber',
      header: 'Receipt No.',
      cell: ({ row }) => (
        <button
          className="font-mono text-sm text-brand-500 hover:underline"
          onClick={() => setSelectedPaymentId(row.original.id)}
        >
          {row.original.receiptNumber}
        </button>
      ),
    },
    {
      id: 'student',
      header: 'Student',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{row.original.studentName}</p>
          <p className="text-xs text-gray-400 font-mono">{row.original.admissionNumber}</p>
        </div>
      ),
    },
    {
      id: 'method',
      header: 'Method',
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.method.replace(/_/g, ' ')}</span>,
    },
    {
      id: 'amount',
      header: 'Amount',
      cell: ({ row }) => <AmountDisplay amount={row.original.amount} />,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <BillPaymentStatusBadge status={row.original.status} />,
    },
    {
      id: 'receivedDate',
      header: 'Date',
      cell: ({ row }) => <span className="text-gray-500 text-sm">{new Date(row.original.receivedDate).toLocaleDateString()}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const p = row.original;
        const isPendingCheque = p.method === 'CHEQUE' && p.status === 'PENDING';
        const canVoid = isOwner && p.status !== 'VOIDED';
        // BILL-RCPT-STATUS: was an inline `!== 'VOIDED'` here and a second
        // copy of the same test in the detail modal — neither covered BOUNCED,
        // which is the state where a receipt is most actively wrong. Now one
        // shared rule, mirroring the server's own; the server refuses anyway.
        const canPrint = canPrintReceipt(p.status);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSelectedPaymentId(p.id)}>View</DropdownMenuItem>
              {isPendingCheque && (
                <>
                  <DropdownMenuItem onClick={() => handleChequeTransition(p.id, p.receiptNumber, 'CLEARED')}>
                    Mark Cleared
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-error-600 focus:text-error-600"
                    onClick={() => handleChequeTransition(p.id, p.receiptNumber, 'BOUNCED')}
                  >
                    Mark Bounced
                  </DropdownMenuItem>
                </>
              )}
              {canVoid && (
                <DropdownMenuItem
                  className="text-error-600 focus:text-error-600"
                  onClick={() => handleVoid(p.id, p.receiptNumber)}
                >
                  Void
                </DropdownMenuItem>
              )}
              {/* Embedded in the menu this row already had, rather than a
                  second dropdown beside it (BILL-8-UI Phase 1). */}
              {/* BILL-PRINT-1 Decision 2: the payments LIST is the office
                  reprint surface — a receipt pulled up days later, not the
                  counter moment — so it produces the A5 stationery. The two
                  counter surfaces (the payment-recorded confirmation and the
                  payment detail modal) stay on the 80mm thermal roll. */}
              {canPrint && (
                <PrintLanguageItems
                  doc={{ kind: 'receipt', paymentId: p.id, format: 'a5' }}
                  heading={`${receiptPrintLabel(p.status)} (A5)`}
                />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const filterBar = (
    <>
      <Select value={method} onValueChange={(v) => updateParams({ method: v ?? '', page: '1' })}>
        <SelectTrigger className="h-9 w-36 text-sm">
          <span className={method ? '' : 'text-muted-foreground'}>
            {method ? method.replace(/_/g, ' ') : 'All Methods'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Methods</SelectItem>
          {METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={(v) => updateParams({ status: v ?? '', page: '1' })}>
        <SelectTrigger className="h-9 w-32 text-sm">
          <span className={status ? '' : 'text-muted-foreground'}>
            {status ? status.charAt(0) + status.slice(1).toLowerCase() : 'All Status'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Status</SelectItem>
          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 shrink-0">Received:</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => updateParams({ dateFrom: e.target.value, page: '1' })}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => updateParams({ dateTo: e.target.value, page: '1' })}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Record and track payments against student invoices"
        action={
          <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => router.push('/finance/bill/payments/new')}>
            <Wallet className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        }
      />

      {!isLoading && payments.length === 0 && activeFilterCount === 0 ? (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <EmptyState
            icon={Wallet}
            message="No payments recorded yet. Record a payment against a student's outstanding invoices to see it here."
            action={
              <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => router.push('/finance/bill/payments/new')}>
                <Wallet className="mr-2 h-4 w-4" />
                Record Payment
              </Button>
            }
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={payments}
          isLoading={isLoading}
          filterBar={filterBar}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
          pagination={
            meta
              ? { page, limit: meta.limit, total: meta.total, onPageChange: (p) => updateParams({ page: String(p) }) }
              : undefined
          }
        />
      )}

      <PaymentDetailModal paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)} />
    </div>
  );
}
