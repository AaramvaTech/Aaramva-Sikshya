'use client';

import { AlertTriangle, CheckCircle2, Receipt, Wallet, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { cn } from '@/lib/utils';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { useStudentLedger, useStudentAssignments } from '@/lib/hooks/use-finance';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';
import type { InvoiceDetail, FeeAssignment } from '@/types/api.types';

/**
 * WEB-P Phase 5 Task 9 — parent's per-child fee ledger, view-only.
 *
 * Renders `useStudentLedger()`'s response directly: `summary`
 * (totalInvoiced/totalPaid/totalBalance) as three stat cards, then
 * `invoices[]` as a card list (invoice number, due date via <BsDate>,
 * status via the shared <StatusBadge>, totalAmount/paidAmount/balance via
 * <AmountDisplay>). Per the locked spec, this list IS the invoice detail —
 * there is no invoice-detail-by-id endpoint reachable by PARENT and this
 * file deliberately has no detail route/page/expand-per-invoice-items UI.
 *
 * HARD EXCLUSION (this phase's Global Constraints, applies to this screen
 * specifically because it's the one place a "Pay Now" button would
 * naturally be tempting): no checkout button, no call to the endpoint that
 * lists which online payment gateways are enabled, and no call to either
 * online gateway's transaction lookup/verification endpoint anywhere in
 * this file. Those lookup endpoints are side-effecting (they can finalize
 * and credit a stuck transaction) despite being simple reads, even though
 * PARENT is technically role-permitted to call them — checkout stays out of
 * scope for v1. See the finance-security audit doc referenced in this
 * task's commit message.
 *
 * Secondary "Fee structure" section (via `useStudentAssignments`) is called
 * out as optional in the brief; included here as brief, clearly-labeled
 * read-only context (what's assigned, at what amount) so it reads as a
 * distinct concept from the invoice/payment history above it, not a
 * duplicate of it.
 *
 * Guard shape: identical to every other per-child screen in this phase —
 * children loading -> children error -> empty roster -> the one-tick
 * window before useSelectedChild() picks a default child. Never
 * re-derived here; read from useSelectedChild() only.
 */

function StatCard({
  label,
  value,
  isLoading,
  icon: Icon,
  valueClassName,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  icon: LucideIcon;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={cn('h-4 w-4', valueClassName)} />
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <AmountDisplay amount={value ?? 0} className={cn('text-2xl font-bold', valueClassName)} />
      )}
    </div>
  );
}

function InvoiceCard({ invoice: inv }: { invoice: InvoiceDetail }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-gray-600 dark:text-gray-300">{inv.invoiceNumber}</span>
          <StatusBadge status={inv.status} />
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Due <BsDate date={inv.dueDate} />
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase text-gray-400 dark:text-gray-500">Total</p>
          <AmountDisplay amount={inv.totalAmount} className="text-sm font-semibold text-gray-800 dark:text-white" />
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-400 dark:text-gray-500">Paid</p>
          <AmountDisplay
            amount={inv.paidAmount}
            className="text-sm font-semibold text-success-700 dark:text-success-400"
          />
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-400 dark:text-gray-500">Balance</p>
          <AmountDisplay
            amount={inv.balance}
            className="text-sm font-semibold text-error-700 dark:text-error-400"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Optional secondary section: fee STRUCTURE assignment (not homework
// assignments — see module docblock). Read-only, own query/error/empty
// states, distinct from the invoice list above. ─────────────────────────────
export function FeeStructureSection({
  studentId,
  academicYearId,
}: {
  studentId: string;
  academicYearId: string;
}) {
  const {
    data: assignments,
    isLoading,
    isError,
    refetch,
  } = useStudentAssignments(studentId, academicYearId || undefined);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-white">Fee structure</h3>
      <p className="mb-4 text-theme-xs text-gray-500 dark:text-gray-400">
        What&apos;s assigned to this child and at what amount — separate from the billing history above
      </p>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} message="Couldn't load the fee structure." />
      ) : !assignments || assignments.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
          No fee categories assigned yet.
        </p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {assignments.map((a: FeeAssignment) => (
            <div key={a.feeStructureItemId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-700 dark:text-gray-200">{a.feeCategoryName}</p>
                {(a.isWaived || a.discountPercent > 0) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {a.isWaived ? 'Waived' : `${a.discountPercent}% discount`}
                    {a.discountReason ? ` · ${a.discountReason}` : ''}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 text-right">
                {(a.isWaived || a.customAmount !== null) && (
                  <AmountDisplay
                    amount={a.originalAmount}
                    className="mr-2 text-xs text-gray-400 line-through dark:text-gray-500"
                  />
                )}
                <AmountDisplay
                  amount={a.effectiveAmount}
                  className="text-sm font-semibold text-gray-800 dark:text-white"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ParentFeesPage() {
  const {
    children,
    selectedChildId,
    selectedChild,
    isLoading: childrenLoading,
    isError: childrenError,
  } = useSelectedChild();

  const { data: currentYear, isLoading: yearLoading } = useCurrentAcademicYear();
  const academicYearId = currentYear?.id ?? '';

  // Guard: never let this fire with an empty studentId — useStudentLedger is
  // already `enabled: !!studentId && !!academicYearId`-gated at the hook
  // level (see use-finance.ts), same discipline as every other per-child
  // screen in this phase.
  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerError,
    refetch: refetchLedger,
  } = useStudentLedger(selectedChildId ?? '', academicYearId);

  const header = (
    <PageHeader
      title="Fees"
      description="Your child's fee invoices and payment history"
    />
  );

  // ── Guards: never let per-child data render with an empty/undefined
  //    studentId. Children still loading, a real fetch error, a genuinely
  //    empty roster, and the one-tick window before useSelectedChild()'s
  //    effect picks a default child are each handled explicitly and
  //    distinctly — same shape as every other per-child screen in this
  //    phase. Never re-derived; read from useSelectedChild() only.
  if (childrenLoading) {
    return (
      <div className="space-y-5">
        {header}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (childrenError) {
    return (
      <div className="space-y-5">
        {header}
        <QueryErrorState message="Couldn't load your children." />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="space-y-5">
        {header}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <EmptyState message="No children are linked to your account yet." />
        </div>
      </div>
    );
  }

  if (!selectedChildId || !selectedChild) {
    // Children have loaded but useSelectedChild()'s effect hasn't picked a
    // default child yet (one-render window) — show a skeleton, never fire
    // any per-child query with an empty-string studentId.
    return (
      <div className="space-y-5">
        {header}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const showSummarySkeleton = yearLoading || ledgerLoading;
  const invoices = ledger?.invoices ?? [];

  return (
    <div className="space-y-5">
      {header}

      {ledgerError ? (
        <QueryErrorState onRetry={() => refetchLedger()} message="Couldn't load the fee ledger." />
      ) : (
        <>
          {/* Summary stat cards — sourced directly from useStudentLedger()'s
              `summary`, never recomputed client-side. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total Invoiced"
              value={ledger?.summary.totalInvoiced}
              isLoading={showSummarySkeleton}
              icon={Wallet}
              valueClassName="text-gray-700 dark:text-gray-200"
            />
            <StatCard
              label="Total Paid"
              value={ledger?.summary.totalPaid}
              isLoading={showSummarySkeleton}
              icon={CheckCircle2}
              valueClassName="text-success-700 dark:text-success-400"
            />
            <StatCard
              label="Balance Due"
              value={ledger?.summary.totalBalance}
              isLoading={showSummarySkeleton}
              icon={AlertTriangle}
              valueClassName="text-error-700 dark:text-error-400"
            />
          </div>

          {/* Invoice / payment history — this IS the invoice detail per the
              locked spec; no separate detail-by-id route exists or is
              called anywhere in this file. */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Invoices</h3>
            {showSummarySkeleton ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
                <EmptyState message="No invoices for this child yet." icon={Receipt} />
              </div>
            ) : (
              <div className="space-y-3">
                {invoices.map((inv) => (
                  <InvoiceCard key={inv.id} invoice={inv} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <FeeStructureSection studentId={selectedChildId} academicYearId={academicYearId} />
    </div>
  );
}
