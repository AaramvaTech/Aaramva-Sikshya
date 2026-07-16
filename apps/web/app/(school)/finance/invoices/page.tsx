'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorDisplay } from '@/lib/errors';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { InvoiceStatusBadge } from '@/components/finance/invoice-status-badge';
import { InvoiceDetailModal } from '@/components/finance/invoice-detail-modal';
import { PaymentForm } from '@/components/finance/payment-form';
import { GenerateInvoiceDialog } from '@/components/finance/generate-invoice-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useInvoices, useVoidInvoice } from '@/lib/hooks/use-finance';
import { useClasses } from '@/lib/hooks/use-students';
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
  const dueDateFrom = searchParams.get('dueDateFrom') ?? '';
  const dueDateTo = searchParams.get('dueDateTo') ?? '';

  const [searchInput, setSearchInput] = useState(search);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceSummary | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  const { data: invoiceData, isLoading } = useInvoices({
    page,
    limit: 20,
    search: search || undefined,
    status: status || undefined,
    classId: classId || undefined,
  });
  const { data: classes } = useClasses();
  const voidMutation = useVoidInvoice();

  const allInvoices = invoiceData?.data ?? [];
  const meta = invoiceData?.meta;

  // Due date range is client-side filtered
  const invoices = allInvoices.filter((inv) => {
    const dateAd = inv.dueDate?.ad ?? '';
    if (dueDateFrom && dateAd < dueDateFrom) return false;
    if (dueDateTo && dateAd > dueDateTo) return false;
    return true;
  });

  const activeFilterCount = [search, status, classId, dueDateFrom, dueDateTo].filter(Boolean).length;

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

  function clearFilters() {
    setSearchInput('');
    router.push('?');
  }

  function handleVoid(id: string, invoiceNumber: string) {
    if (!confirm(`Void invoice ${invoiceNumber}? This cannot be undone.`)) return;
    voidMutation.mutate(id, {
      onSuccess: () => toast.success('Invoice voided'),
      onError: (err) => toast.error(getErrorDisplay(err).message),
    });
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

  const filterBar = (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search by name or invoice no."
          className="h-9 w-56 pl-9 text-sm"
          value={searchInput}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <Select value={status} onValueChange={(v) => updateParams({ status: v ?? '', page: '1' })}>
        <SelectTrigger className="h-9 w-32 text-sm">
          <span className={status ? '' : 'text-muted-foreground'}>
            {status ? status.charAt(0) + status.slice(1).toLowerCase() : 'All Status'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Status</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={classId} onValueChange={(v) => updateParams({ classId: v ?? '', page: '1' })}>
        <SelectTrigger className="h-9 w-36 text-sm">
          <span className={classId ? '' : 'text-muted-foreground'}>
            {classId ? (classes?.find((c) => c.id === classId)?.name ?? 'Loading…') : 'All Classes'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Classes</SelectItem>
          {classes?.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 shrink-0">Due:</span>
        <input
          type="date"
          value={dueDateFrom}
          onChange={(e) => updateParams({ dueDateFrom: e.target.value, page: '1' })}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="date"
          value={dueDateTo}
          onChange={(e) => updateParams({ dueDateTo: e.target.value, page: '1' })}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        description="Student fee invoices and payment records"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={() => setGenerateOpen(true)}
          >
            + Generate Invoice
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        filterBar={filterBar}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        exportConfig={{
          filename: 'invoices',
          getData: () =>
            invoices.map((inv) => ({
              'Invoice No.': inv.invoiceNumber,
              Student: inv.studentName,
              'Admission No.': inv.admissionNumber,
              Class: inv.className ?? '',
              'Due Date': inv.dueDate?.bs ?? '',
              'Total Amount': inv.totalAmount,
              Paid: inv.paidAmount,
              Balance: inv.balance,
              Status: inv.status,
            })),
        }}
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

      <InvoiceDetailModal
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

      <GenerateInvoiceDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  );
}
