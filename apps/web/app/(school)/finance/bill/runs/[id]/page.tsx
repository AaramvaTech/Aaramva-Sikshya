'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Receipt, Ban, XCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BS_MONTH_NAMES_EN } from 'bs-calendar';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/shared/page-header';
import { BsDate } from '@/components/shared/bs-date';
import { StatCard } from '@/components/shared/stat-card';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AmountDisplay, formatNPR } from '@/components/finance/amount-display';
import { BillRunOutcomeBadge, labels as outcomeLabels } from '@/components/finance/bill-run-outcome-badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useBillRun, useExcludeBillRunLines, usePostBillRun, useVoidBillRun } from '@/lib/hooks/use-bill-run';
import { useClasses } from '@/lib/hooks/use-students';
import { BILL_RUN_STATUS_STYLES } from '@/lib/bill-run-form';
import { extractApiErrors } from '@/lib/api-errors';
import type { BillRunLine, BillRunLineOutcome } from '@/types/api.types';

const LINE_OUTCOMES: BillRunLineOutcome[] = [
  'DRAFT', 'POSTED', 'SKIPPED_NO_ASSIGNMENT', 'SKIPPED_ALREADY_BILLED', 'EXCLUDED', 'FAILED',
];

/**
 * UI-3-SPEC.md §5.3–5.5 — the core screen. One page, no wizard steps: a
 * freshly-created draft lands here directly (§5.2) and this same page keeps
 * rendering through POSTING (polling, §1) and POSTED. Editable (exclude/void)
 * only while status === 'DRAFT'; read-only + live-updating otherwise.
 */
export default function BillRunReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const runId = params.id;

  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  const { data: run, isLoading, isError } = useBillRun(runId, {
    limit: 200,
    outcome: outcomeFilter || undefined,
    classId: classFilter || undefined,
  });
  const { data: classes } = useClasses();

  const excludeLines = useExcludeBillRunLines();
  const postRun = usePostBillRun();
  const voidRun = useVoidBillRun();

  if (isLoading || !run) {
    return (
      <div className="space-y-5">
        <Link href="/finance/bill/runs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to Bill Runs
        </Link>
        <div className="rounded-sm border border-stroke bg-white p-10 text-center text-sm text-gray-400 shadow-default dark:border-strokedark dark:bg-boxdark">
          {isError ? 'Bill run not found.' : 'Loading…'}
        </div>
      </div>
    );
  }

  const isDraft = run.status === 'DRAFT';
  const draftCount = run.outcomeSummary.DRAFT ?? 0;
  const noAssignmentCount = run.outcomeSummary.SKIPPED_NO_ASSIGNMENT ?? 0;
  const alreadyBilledCount = run.outcomeSummary.SKIPPED_ALREADY_BILLED ?? 0;
  const excludedCount = run.outcomeSummary.EXCLUDED ?? 0;
  const postedCount = run.outcomeSummary.POSTED ?? 0;
  const failedCount = run.outcomeSummary.FAILED ?? 0;

  async function handleExclude(line: BillRunLine) {
    try {
      await excludeLines.mutateAsync({ id: runId, data: { studentIds: [line.studentId] } });
      toast.success(`${line.studentName ?? 'Student'} excluded from this run`);
    } catch (err) {
      extractApiErrors(err, 'Failed to exclude student').forEach((m) => toast.error(m));
    }
  }

  async function handlePost() {
    try {
      await postRun.mutateAsync(runId);
      toast.success('Posting started');
    } catch (err) {
      extractApiErrors(err, 'Failed to post bill run').forEach((m) => toast.error(m));
    }
  }

  async function handleVoid() {
    try {
      await voidRun.mutateAsync(runId);
      toast.success('Bill run voided');
      router.push('/finance/bill/runs');
    } catch (err) {
      extractApiErrors(err, 'Failed to void bill run').forEach((m) => toast.error(m));
    }
  }

  const columns: ColumnDef<BillRunLine>[] = [
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
    ...(run.scope === 'WHOLE_SCHOOL'
      ? [{
          id: 'class',
          header: 'Class',
          cell: ({ row }: { row: { original: BillRunLine } }) => (
            <span className="text-gray-600 dark:text-gray-300">
              {row.original.className ?? '—'}{row.original.sectionName ? ` ${row.original.sectionName}` : ''}
            </span>
          ),
        } as ColumnDef<BillRunLine>]
      : []),
    {
      id: 'outcome',
      header: 'Outcome',
      cell: ({ row }) => <BillRunOutcomeBadge outcome={row.original.outcome} skipReason={row.original.skipReason} />,
    },
    {
      id: 'net',
      header: 'Net',
      cell: ({ row }) => <AmountDisplay amount={row.original.net} />,
    },
    {
      id: 'action',
      header: '',
      cell: ({ row }) =>
        isDraft && row.original.outcome === 'DRAFT' ? (
          <ConfirmDialog
            title="Exclude student"
            description={`Exclude ${row.original.studentName ?? 'this student'} from this run? This can't be undone without voiding the whole run.`}
            confirmLabel="Exclude"
            variant="destructive"
            onConfirm={() => handleExclude(row.original)}
            trigger={<Button variant="outline" size="sm">Exclude</Button>}
          />
        ) : null,
    },
  ];

  const filterBar = (
    <>
      <Select value={outcomeFilter} onValueChange={(v) => setOutcomeFilter(v ?? '')}>
        <SelectTrigger className="h-9 w-44 text-sm">
          <span className={outcomeFilter ? '' : 'text-muted-foreground'}>
            {outcomeFilter ? outcomeLabels[outcomeFilter as BillRunLineOutcome] : 'All Outcomes'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Outcomes</SelectItem>
          {LINE_OUTCOMES.map((o) => (
            <SelectItem key={o} value={o}>{outcomeLabels[o]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {run.scope === 'WHOLE_SCHOOL' && (
        <Select value={classFilter} onValueChange={(v) => setClassFilter(v ?? '')}>
          <SelectTrigger className="h-9 w-36 text-sm">
            <span className={classFilter ? '' : 'text-muted-foreground'}>
              {classFilter ? (classes?.find((c) => c.id === classFilter)?.name ?? 'Loading…') : 'All Classes'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </>
  );

  const postDescription =
    `Post ${draftCount} invoice${draftCount === 1 ? '' : 's'} totalling ${formatNPR(run.totalNet)}? ` +
    'This creates real invoices and ledger entries and cannot be undone — corrections after posting go through credit notes/refunds, not this screen.';

  return (
    <div className="space-y-5">
      <Link href="/finance/bill/runs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Bill Runs
      </Link>

      <PageHeader
        title={`${BS_MONTH_NAMES_EN[run.bsMonth - 1]} ${run.bsYear} — ${run.scope === 'WHOLE_SCHOOL' ? 'Whole School' : classes?.find((c) => c.id === run.classId)?.name ?? 'Class'}`}
        action={
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-theme-xs font-medium ${BILL_RUN_STATUS_STYLES[run.status]}`}>
            {run.status.charAt(0) + run.status.slice(1).toLowerCase()}
          </span>
        }
      />

      {/* ── Header card ── */}
      <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-gray-400">Issue Date</p>
            <BsDate date={run.issueDate} />
          </div>
          <div>
            <p className="text-xs text-gray-400">Due Date</p>
            <BsDate date={run.dueDate} />
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Students</p>
            <p className="font-medium text-gray-900 dark:text-white">{run.totalStudents}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Net</p>
            <AmountDisplay amount={run.totalNet} className="font-medium" />
          </div>
        </div>
      </div>

      {/* ── Summary strip — always visible, not paginated (UI-3-SPEC.md §5.3.2) ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard title={`To Be Charged (${draftCount})`} value={formatNPR(run.totalNet)} icon={Receipt} iconBg="bg-success-50" iconColor="text-success-600" isLoading={false} />
        <StatCard title="No Fee Assigned" value={noAssignmentCount} icon={Ban} iconBg="bg-gray-100" iconColor="text-gray-500" isLoading={false} />
        <StatCard title="Already Billed" value={alreadyBilledCount} icon={Ban} iconBg="bg-gray-100" iconColor="text-gray-500" isLoading={false} />
        <StatCard title="Excluded" value={excludedCount} icon={XCircle} iconBg="bg-violet-100" iconColor="text-violet-600" isLoading={false} />
        {!isDraft && (
          <StatCard title="Posted" value={postedCount} icon={CheckCircle2} iconBg="bg-success-50" iconColor="text-success-600" isLoading={false} />
        )}
        {failedCount > 0 && (
          <StatCard title="Failed" value={failedCount} icon={AlertTriangle} iconBg="bg-error-50" iconColor="text-error-600" isLoading={false} />
        )}
      </div>

      {/* ── Line table ── */}
      <DataTable
        columns={columns}
        data={run.lines}
        filterBar={filterBar}
        activeFilterCount={[outcomeFilter, classFilter].filter(Boolean).length}
        onClearFilters={() => { setOutcomeFilter(''); setClassFilter(''); }}
      />
      {run.lines.length === 200 && (
        <p className="text-xs text-gray-400">Showing the first 200 lines. Use the filters above to narrow this down.</p>
      )}

      {/* ── Footer actions — DRAFT only ── */}
      {isDraft && (
        <div className="flex justify-end gap-3 pb-4">
          <ConfirmDialog
            title="Void this draft"
            description="Void this draft? It can be redrafted from scratch afterward."
            confirmLabel="Void Draft"
            variant="destructive"
            onConfirm={handleVoid}
            trigger={<Button variant="outline">Void Run</Button>}
          />
          <ConfirmDialog
            title="Post this bill run"
            description={postDescription}
            confirmLabel="Post"
            onConfirm={handlePost}
            trigger={<Button className="bg-brand-500 hover:bg-brand-600 text-white">Post</Button>}
          />
        </div>
      )}
    </div>
  );
}
