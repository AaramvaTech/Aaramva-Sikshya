'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Scale } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { CorrectionTypeBadge } from '@/components/finance/correction-type-badge';
import { DecideCorrectionDialog } from '@/components/finance/decide-correction-dialog';
import { AmountDisplay } from '@/components/finance/amount-display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useBillCorrections, useApproveCorrection, useRejectCorrection } from '@/lib/hooks/use-bill-correction';
import { extractApiErrors } from '@/lib/api-errors';
import { useAuthStore } from '@/store/auth.store';
import type { BillCorrection, BillCorrectionStatus, BillCorrectionType } from '@/types/api.types';

const TYPES: BillCorrectionType[] = ['CREDIT_NOTE', 'REFUND', 'WRITE_OFF'];
const STATUSES: BillCorrectionStatus[] = ['REQUESTED', 'APPROVED', 'REJECTED'];
const OWNER_ROLES = ['SCHOOL_OWNER', 'PLATFORM_ADMIN'];

/**
 * UI-5-SPEC.md §3.1 — <DataTable> shape lifted from the HR leave page (request/
 * approve/reject list precedent), same owner-gating snippet UI-4's payments
 * list already uses for its own OWNER_ONLY action. `BillCorrectionQueryDto`
 * only filters by an exact studentId, not a search string (same constraint
 * UI-4's payments list has) — student search below is client-side.
 */
export default function BillCorrectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = !!role && OWNER_ROLES.includes(role);

  const page = Number(searchParams.get('page') ?? '1');
  const type = searchParams.get('type') ?? '';
  const status = searchParams.get('status') ?? '';
  const [studentSearch, setStudentSearch] = useState('');

  const [decision, setDecision] = useState<{ id: string; correctionNumber: string; action: 'approve' | 'reject' } | null>(null);

  const { data: correctionsData, isLoading } = useBillCorrections({
    page, limit: 20, type: type || undefined, status: status || undefined,
  });
  const approve = useApproveCorrection();
  const reject = useRejectCorrection();

  const allCorrections = correctionsData?.data ?? [];
  const meta = correctionsData?.meta;
  const corrections = studentSearch
    ? allCorrections.filter((c) => (c.studentName ?? '').toLowerCase().includes(studentSearch.toLowerCase()))
    : allCorrections;

  const activeFilterCount = [type, status, studentSearch].filter(Boolean).length;

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val) params.set(key, val);
      else params.delete(key);
    });
    router.push(`?${params.toString()}`);
  }

  function clearFilters() {
    setStudentSearch('');
    router.push('?');
  }

  async function handleDecision(note: string) {
    if (!decision) return;
    try {
      if (decision.action === 'approve') {
        await approve.mutateAsync({ id: decision.id, data: { note: note || undefined } });
        toast.success(`${decision.correctionNumber} approved`);
      } else {
        await reject.mutateAsync({ id: decision.id, data: { note } });
        toast.success(`${decision.correctionNumber} rejected`);
      }
    } catch (err) {
      extractApiErrors(err, `Failed to ${decision.action} correction`).forEach((m) => toast.error(m));
    }
  }

  const columns: ColumnDef<BillCorrection>[] = [
    {
      id: 'correctionNumber',
      header: 'Correction No.',
      cell: ({ row }) => (
        <button
          className="font-mono text-sm text-brand-500 hover:underline"
          onClick={() => router.push(`/finance/bill/corrections/${row.original.id}`)}
        >
          {row.original.correctionNumber}
        </button>
      ),
    },
    {
      id: 'student',
      header: 'Student',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{row.original.studentName ?? '—'}</p>
          <p className="text-xs text-gray-400 font-mono">{row.original.admissionNumber ?? ''}</p>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => <CorrectionTypeBadge type={row.original.type} />,
    },
    {
      id: 'amount',
      header: 'Amount',
      cell: ({ row }) => <AmountDisplay amount={row.original.amount} />,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'requestedAt',
      header: 'Requested',
      cell: ({ row }) => <span className="text-gray-500 text-sm">{new Date(row.original.requestedAt).toLocaleDateString()}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        if (row.original.status !== 'REQUESTED' || !isOwner) return null;
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 px-2 text-xs bg-success-500 hover:bg-success-600 text-white"
              onClick={() => setDecision({ id: row.original.id, correctionNumber: row.original.correctionNumber, action: 'approve' })}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-error-600 border-error-200 hover:bg-error-50"
              onClick={() => setDecision({ id: row.original.id, correctionNumber: row.original.correctionNumber, action: 'reject' })}
            >
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  const filterBar = (
    <>
      <Input
        placeholder="Search student name..."
        className="h-9 w-48 text-sm"
        value={studentSearch}
        onChange={(e) => setStudentSearch(e.target.value)}
      />

      <Select value={type} onValueChange={(v) => updateParams({ type: v ?? '', page: '1' })}>
        <SelectTrigger className="h-9 w-36 text-sm">
          <span className={type ? '' : 'text-muted-foreground'}>
            {type ? type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ') : 'All Types'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Types</SelectItem>
          {TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ')}</SelectItem>)}
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
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Corrections"
        description="Credit notes, refunds, and write-offs against student invoices"
        action={
          <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => router.push('/finance/bill/corrections/new')}>
            <Scale className="mr-2 h-4 w-4" />
            New Correction
          </Button>
        }
      />

      {!isLoading && corrections.length === 0 && activeFilterCount === 0 ? (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <EmptyState
            icon={Scale}
            message="No corrections yet. Request a credit note, refund, or write-off against a student's invoices to see it here."
            action={
              <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => router.push('/finance/bill/corrections/new')}>
                <Scale className="mr-2 h-4 w-4" />
                New Correction
              </Button>
            }
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={corrections}
          isLoading={isLoading}
          filterBar={filterBar}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
          pagination={
            meta && !studentSearch
              ? { page, limit: meta.limit, total: meta.total, onPageChange: (p) => updateParams({ page: String(p) }) }
              : undefined
          }
        />
      )}

      {decision && (
        <DecideCorrectionDialog
          action={decision.action}
          correctionNumber={decision.correctionNumber}
          open={!!decision}
          onOpenChange={(open) => { if (!open) setDecision(null); }}
          onConfirm={handleDecision}
        />
      )}
    </div>
  );
}
