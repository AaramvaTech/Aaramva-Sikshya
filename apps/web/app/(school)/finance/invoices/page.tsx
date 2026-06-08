'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { BsDate } from '@/components/shared/bs-date';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AmountDisplay } from '@/components/finance/amount-display';
import { InvoiceStatusBadge } from '@/components/finance/invoice-status-badge';
import { InvoiceDetailSheet } from '@/components/finance/invoice-detail-sheet';
import { PaymentForm } from '@/components/finance/payment-form';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useInvoices, useVoidInvoice } from '@/lib/hooks/use-finance';
import { useClasses, useAcademicYears } from '@/lib/hooks/use-students';
import type { InvoiceSummary } from '@/types/api.types';

const STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED'];

export default function InvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const classId = searchParams.get('classId') ?? '';

  const [searchInput, setSearchInput] = useState(search);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceSummary | null>(null);

  const { data: invoiceData, isLoading } = useInvoices({
    page,
    limit: 20,
    search: search || undefined,
    status: status || undefined,
    classId: classId || undefined,
  });
  const { data: classes } = useClasses();
  const voidMutation = useVoidInvoice();

  const invoices = invoiceData?.data ?? [];
  const meta = invoiceData?.meta;

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val) params.set(key, val);
      else params.delete(key);
    });
    router.push(`?${params.toString()}`);
  }

  function handleSearch(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ search: value, page: '1' });
    }, 400);
  }

  const columns: ColumnDef<InvoiceSummary>[] = [
    {
      accessorKey: 'invoiceNumber',
      header: 'Invoice No.',
      cell: ({ getValue }) => (
        <span className="font-mono text-sm text-gray-600">{getValue<string>()}</span>
      ),
    },
    {
      id: 'student',
      header: 'Student',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-gray-900">{row.original.studentName}</p>
          <p className="text-xs text-gray-400 font-mono">{row.original.admissionNumber}</p>
        </div>
      ),
    },
    {
      accessorKey: 'className',
      header: 'Class',
    },
    {
      id: 'dueDate',
      header: 'Due Date',
      cell: ({ row }) => <BsDate date={row.original.dueDate} showAd={false} />,
    },
    {
      id: 'totalAmount',
      header: 'Amount',
      cell: ({ row }) => <AmountDisplay amount={row.original.totalAmount} />,
    },
    {
      id: 'paidAmount',
      header: 'Paid',
      cell: ({ row }) => (
        <AmountDisplay amount={row.original.paidAmount} className="text-success-600" />
      ),
    },
    {
      id: 'balance',
      header: 'Balance',
      cell: ({ row }) => (
        <AmountDisplay
          amount={row.original.balance}
          className={row.original.balance > 0 ? 'text-error-600' : 'text-gray-400'}
        />
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSelectedInvoiceId(row.original.id)}>
              View
            </DropdownMenuItem>
            {row.original.balance > 0 && (
              <DropdownMenuItem onClick={() => setPaymentInvoice(row.original)}>
                Record Payment
              </DropdownMenuItem>
            )}
            {row.original.status !== 'PAID' && row.original.status !== 'WAIVED' && (
              <DropdownMenuItem
                className="text-error-600 focus:text-error-600"
                onClick={() => handleVoid(row.original.id, row.original.invoiceNumber)}
              >
                Void Invoice
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  function handleVoid(id: string, invoiceNumber: string) {
    if (!confirm(`Void invoice ${invoiceNumber}? This cannot be undone.`)) return;
    voidMutation.mutate(id, {
      onSuccess: () => toast.success('Invoice voided'),
      onError: () => toast.error('Failed to void invoice'),
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        description="Student fee invoices and payment records"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={() => router.push('/finance')}
          >
            Finance Hub
          </Button>
        }
      />

      <div className="flex gap-3 flex-wrap">
        <Select
          value={status}
          onValueChange={(v) => updateParams({ status: v ?? '', page: '1' })}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={classId}
          onValueChange={(v) => updateParams({ classId: v ?? '', page: '1' })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Classes</SelectItem>
            {classes?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        searchPlaceholder="Search by name or invoice no."
        onSearchChange={handleSearch}
        pagination={
          meta
            ? {
                page,
                limit: meta.limit,
                total: meta.total,
                onPageChange: (p) => updateParams({ page: String(p) }),
              }
            : undefined
        }
      />

      <InvoiceDetailSheet
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
      />

      {paymentInvoice && (
        <PaymentForm
          invoice={paymentInvoice}
          open={!!paymentInvoice}
          onOpenChange={(v) => !v && setPaymentInvoice(null)}
        />
      )}
    </div>
  );
}
