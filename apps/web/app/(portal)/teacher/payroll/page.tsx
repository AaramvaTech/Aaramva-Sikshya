'use client';

import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyPayrollHistory } from '@/lib/hooks/use-hr';
import { useAuthStore } from '@/store/auth.store';
import type { SalarySlip } from '@/types/api.types';

/**
 * WEB-P Phase 3 Task 4 — teacher's own payroll slip history, VIEW-ONLY.
 *
 * GET /hr/payroll/staff/:userId/history (TEACHER_AND_ABOVE) accepts an
 * arbitrary :userId path param at the route level, but
 * payroll.service.ts's getStaffSalaryHistory calls assertSelfOrHrAdmin
 * before querying — only the caller's own id (or an HR-admin caller) gets
 * through; a teacher passing anyone else's id gets a real 403. See
 * docs/web/phase-3-ownership-findings.md. This page always passes the
 * logged-in user's own id from the auth store.
 *
 * Known data-shape limitation (also documented in that file): the response
 * has no month/year label — payroll_months is only joined for ORDER BY,
 * never selected — and GET /hr/payroll/months (which could resolve one) is
 * ACCOUNTANT_AND_ABOVE-only, unreachable here. So each slip is dated by
 * `createdAt` (always populated) rather than a fabricated month label,
 * shown in the order the backend already guarantees (most recent fiscal
 * month first). paymentDate/paymentMethod are effectively always null
 * (never written in payroll.service.ts) and are not rendered.
 *
 * Per-slip breakdown mirrors the admin payroll page's rendering
 * conventions (`app/(school)/hr/payroll/page.tsx`'s SlipsModal table:
 * AmountDisplay for all currency, success/error colors for
 * allowances/deductions, net salary as the most prominent figure) but as
 * cards instead of a table row, since this list is for one person across
 * many months rather than many people for one month — and uses the
 * teacher-portal card convention (rounded-2xl border-gray-200
 * shadow-theme-sm) already established by the profile/leave screens in
 * this same phase.
 */

function SlipCard({ slip }: { slip: SalarySlip }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">
            Generated
          </p>
          <p className="text-sm font-semibold text-gray-800 dark:text-white">
            <BsDate date={slip.createdAt} />
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">
            Net Pay
          </p>
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
            <AmountDisplay amount={slip.netSalary} />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Base Salary</span>
          <AmountDisplay amount={slip.baseSalary} className="font-medium text-gray-800 dark:text-white" />
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Gross Salary</span>
          <AmountDisplay amount={slip.grossSalary} className="font-medium text-gray-800 dark:text-white" />
        </div>
      </div>

      {slip.allowances.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Allowances
          </p>
          <div className="space-y-1">
            {slip.allowances.map((line, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">{line.name}</span>
                <AmountDisplay amount={line.amount} className="text-success-600" />
              </div>
            ))}
          </div>
        </div>
      )}

      {slip.deductions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Deductions
          </p>
          <div className="space-y-1">
            {slip.deductions.map((line, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">{line.name}</span>
                <AmountDisplay amount={line.amount} className="text-error-600" />
              </div>
            ))}
          </div>
        </div>
      )}

      {slip.unpaidLeaveDays > 0 && (
        <div className="mt-4 flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Unpaid Leave ({slip.unpaidLeaveDays} day{slip.unpaidLeaveDays === 1 ? '' : 's'})
          </span>
          <AmountDisplay amount={slip.leaveDeduction} className="text-error-600" />
        </div>
      )}

      {slip.notes && (
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 italic">{slip.notes}</p>
      )}
    </div>
  );
}

export default function TeacherPayrollPage() {
  const userId = useAuthStore((s) => s.user?.id);
  const {
    data: slips,
    isLoading,
    isError,
    refetch,
  } = useMyPayrollHistory(userId ?? '');

  // Defensive guard: PortalShell already gates on session hydration before
  // rendering this page, so userId should always be present by the time we
  // get here — but don't assume; treat a not-yet-hydrated store the same as
  // "still loading" rather than misreporting an empty history.
  const loading = !userId || isLoading;

  return (
    <div>
      <PageHeader
        title="My Payroll"
        description="Your salary slip history — most recent first"
      />

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} message="Couldn't load your payroll history." />
      ) : !slips || slips.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400 dark:text-gray-500">
          No payroll slips yet.
        </div>
      ) : (
        <div className="space-y-4">
          {slips.map((slip) => (
            <SlipCard key={slip.id} slip={slip} />
          ))}
        </div>
      )}
    </div>
  );
}
