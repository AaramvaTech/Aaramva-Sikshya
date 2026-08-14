'use client';

import { AlertTriangle, CheckCircle2, Receipt, Wallet, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { FeePreviewPanel } from '@/components/finance/fee-preview-panel';
import { BillInvoiceStatusBadge } from '@/components/finance/bill-invoice-status-badge';
import { cn } from '@/lib/utils';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { useStudentBalance, useStudentBillInvoices } from '@/lib/hooks/use-bill-payment';
import { sumInvoiceTotals } from '@/lib/invoice-totals';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';
import type { BillInvoice } from '@/types/api.types';

/**
 * WEB-P Phase 5 Task 9 — parent's per-child fee ledger, view-only.
 * BILLING-CUTOVER Phase 1 (§1 of the parent audit doc) — rewired off old
 * Finance's `reports/student/:id` onto Billing throughout: the invoice list
 * is `GET /finance/students/:studentId/bill/invoices` (`useStudentBillInvoices`,
 * year-bounded, limit 100 — same bound `useStudentOutstandingInvoices`
 * already uses for the payment counter), Balance Due is the separate,
 * authoritative `GET /finance/students/:studentId/balance`
 * (`useStudentBalance`, already built for UI-4). Total Invoiced/Total Paid
 * are summed client-side from the invoice list via `sumInvoiceTotals` —
 * NEVER Balance Due, which would double-count each invoice's carried-forward
 * `previousBalance` if summed the same way (see that helper's docblock and
 * its regression test). `BillInvoice.status` (POSTED/SETTLED/
 * PARTIALLY_PAID/VOIDED) is a different enum from old Finance's
 * `InvoiceSummary.status` (PAID/PARTIAL/UNPAID/OVERDUE/WAIVED) that the
 * shared `<StatusBadge>` rendered — `<BillInvoiceStatusBadge>` is its own
 * component for this rail, not a shim over the old one.
 *
 * Per the locked spec, this list stands in for invoice detail —
 * `GET /finance/bill/invoices/:id` IS PARENT-reachable and object-scoped
 * (live-confirmed, BILLING-CUTOVER Phase 1), but no per-invoice
 * detail/expand UI was speced for v1, so none is built here.
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
 * Secondary "Fee structure" section reuses the admin's `FeePreviewPanel`
 * as-is (BILLING-CUTOVER Phase 1 — same reuse pattern as WEB-P Phase 4's
 * parent `ReportCardView`). It was originally built against old Finance's
 * `GET /finance/students/:studentId/assignments` via `useStudentAssignments`;
 * that endpoint has no Billing equivalent reachable by PARENT
 * (`GET .../fee-structure` is ACCOUNTANT_AND_ABOVE-only), but Billing's
 * `GET .../fee-preview` already is PARENT-allowed and object-scoped, and
 * returns a strict superset (structure name + per-head gross/override/
 * concession/net breakdown) of what the old section showed.
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

function InvoiceCard({ invoice: inv }: { invoice: BillInvoice }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-gray-600 dark:text-gray-300">
            {inv.invoiceNumber ?? '—'}
          </span>
          <BillInvoiceStatusBadge status={inv.status} />
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Due <BsDate date={inv.dueDate} />
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase text-gray-400 dark:text-gray-500">Total</p>
          {/* totalReceivable, not netAmount — the full amount this invoice carries
              (its own charge plus any previousBalance carry-forward), matching
              what "Total" meant on the old rail. */}
          <AmountDisplay
            amount={inv.totalReceivable}
            className="text-sm font-semibold text-gray-800 dark:text-white"
          />
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

  // Guard: never let these fire with an empty studentId/academicYearId —
  // both hooks are already `enabled: !!studentId && ...`-gated at the hook
  // level (use-bill-payment.ts), same discipline as every other per-child
  // screen in this phase.
  const {
    data: invoicesData,
    isLoading: invoicesLoading,
    isError: invoicesError,
    refetch: refetchInvoices,
  } = useStudentBillInvoices(selectedChildId, academicYearId || null);
  const {
    data: balance,
    isLoading: balanceLoading,
    isError: balanceError,
    refetch: refetchBalance,
  } = useStudentBalance(selectedChildId);

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

  const showSummarySkeleton = yearLoading || invoicesLoading || balanceLoading;
  const invoices = invoicesData ?? [];
  const hasError = invoicesError || balanceError;

  // Total Invoiced/Total Paid are summed client-side from the invoice list
  // (sumInvoiceTotals — never totalReceivable/balance, see its docblock).
  // Balance Due comes from the separate, authoritative /balance endpoint,
  // NOT summed from invoices, which would double-count each invoice's
  // carried-forward previousBalance.
  const { totalInvoiced, totalPaid } = sumInvoiceTotals(invoices);
  const isAdvance = balance?.sign === 'ADVANCE';
  const balanceLabel = isAdvance ? 'Advance Credit' : 'Balance Due';
  const balanceValue = balance ? Math.abs(balance.balance) : undefined;

  return (
    <div className="space-y-5">
      {header}

      {hasError ? (
        <QueryErrorState
          onRetry={() => {
            refetchInvoices();
            refetchBalance();
          }}
          message="Couldn't load the fee ledger."
        />
      ) : (
        <>
          {/* Summary stat cards — Total Invoiced/Total Paid summed from the
              invoice list, Balance Due read straight from /balance. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total Invoiced"
              value={showSummarySkeleton ? undefined : totalInvoiced}
              isLoading={showSummarySkeleton}
              icon={Wallet}
              valueClassName="text-gray-700 dark:text-gray-200"
            />
            <StatCard
              label="Total Paid"
              value={showSummarySkeleton ? undefined : totalPaid}
              isLoading={showSummarySkeleton}
              icon={CheckCircle2}
              valueClassName="text-success-700 dark:text-success-400"
            />
            <StatCard
              label={balanceLabel}
              value={balanceValue}
              isLoading={showSummarySkeleton}
              icon={AlertTriangle}
              valueClassName={isAdvance ? 'text-success-700 dark:text-success-400' : 'text-error-700 dark:text-error-400'}
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

      <FeePreviewPanel studentId={selectedChildId} academicYearId={academicYearId} />
    </div>
  );
}
