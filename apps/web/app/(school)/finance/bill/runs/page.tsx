'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, Layers, Printer } from 'lucide-react';
import { BS_MONTH_NAMES_EN } from 'bs-calendar';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { AmountDisplay } from '@/components/finance/amount-display';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { CreateBillRunDialog } from '@/components/finance/create-bill-run-dialog';
import { BulkPrintDialog } from '@/components/finance/bulk-print-dialog';
import { useBillRuns } from '@/lib/hooks/use-bill-run';
import { useClasses } from '@/lib/hooks/use-students';
import { BILL_RUN_STATUS_STYLES } from '@/lib/bill-run-form';
import type { BillRunStatus, BillRunSummary } from '@/types/api.types';

const STATUSES: BillRunStatus[] = ['DRAFT', 'POSTING', 'POSTED', 'VOIDED'];

/**
 * UI-3-SPEC.md §5.1 — <DataTable> shape lifted from finance/invoices/page.tsx
 * (URL-param pagination, filter bar). No export here — a bill run isn't a
 * row-shaped CSV target the way invoices are.
 */
export default function BillRunsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const status = searchParams.get('status') ?? '';
  const classId = searchParams.get('classId') ?? '';

  const [createOpen, setCreateOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const { data: runsData, isLoading } = useBillRuns({
    page,
    limit: 20,
    status: status || undefined,
  });
  const { data: classes } = useClasses();

  const allRuns = runsData?.data ?? [];
  const meta = runsData?.meta;
  const runs = classId ? allRuns.filter((r) => r.classId === classId) : allRuns;

  const activeFilterCount = [status, classId].filter(Boolean).length;

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

  const columns: ColumnDef<BillRunSummary>[] = [
    {
      id: 'period',
      header: 'Period',
      cell: ({ row }) => (
        <Link href={`/finance/bill/runs/${row.original.id}`} className="font-medium text-brand-500 hover:underline">
          {BS_MONTH_NAMES_EN[row.original.bsMonth - 1]} {row.original.bsYear}
        </Link>
      ),
    },
    {
      id: 'scope',
      header: 'Scope',
      cell: ({ row }) =>
        row.original.scope === 'WHOLE_SCHOOL'
          ? <span className="text-gray-600 dark:text-gray-300">Whole School</span>
          : <span className="text-gray-600 dark:text-gray-300">{classes?.find((c) => c.id === row.original.classId)?.name ?? 'Class'}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-theme-xs font-medium ${BILL_RUN_STATUS_STYLES[row.original.status]}`}>
          {row.original.status.charAt(0) + row.original.status.slice(1).toLowerCase()}
        </span>
      ),
    },
    {
      id: 'totalStudents',
      header: 'Students',
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.totalStudents}</span>,
    },
    {
      id: 'totalNet',
      header: 'Total Net',
      cell: ({ row }) => <AmountDisplay amount={row.original.totalNet} />,
    },
    {
      id: 'createdAt',
      header: 'Created',
      cell: ({ row }) => <span className="text-gray-500 text-sm">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
    },
  ];

  const filterBar = (
    <>
      <Select value={status} onValueChange={(v) => updateParams({ status: v ?? '', page: '1' })}>
        <SelectTrigger className="h-9 w-36 text-sm">
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
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bill Runs"
        description="Generate, review, and post monthly bills for a class or the whole school"
        action={
          <div className="flex items-center gap-2">
            {/* BILL-8-UI Phase 2, addendum A1 — the ad-hoc entry point. Lives
                here rather than on an invoice list because no invoice list
                page exists, and month-end printing is what this screen is
                already about. */}
            <Button variant="outline" onClick={() => setPrintOpen(true)}>
              <Printer className="mr-2 h-4 w-4" />
              Print by Class
            </Button>
            <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => setCreateOpen(true)}>
              <Layers className="mr-2 h-4 w-4" />
              New Bill Run
            </Button>
          </div>
        }
      />

      {!isLoading && runs.length === 0 && activeFilterCount === 0 ? (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <EmptyState
            icon={Search}
            message="No bill runs yet. Generate a draft for a class or the whole school to see it here."
            action={
              <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => setCreateOpen(true)}>
                <Layers className="mr-2 h-4 w-4" />
                New Bill Run
              </Button>
            }
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={runs}
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

      <CreateBillRunDialog open={createOpen} onOpenChange={setCreateOpen} />
      <BulkPrintDialog open={printOpen} onOpenChange={setPrintOpen} scope={{ kind: 'class' }} />
    </div>
  );
}
