'use client';

import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { InvoiceStatusBadge } from '@/components/finance/invoice-status-badge';
import {
  useCollectionReport,
  useDefaulters,
  useInvoices,
} from '@/lib/hooks/use-finance';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';

export default function FinancePage() {
  const router = useRouter();
  const { data: currentYear } = useCurrentAcademicYear();
  const academicYearId = currentYear?.id ?? '';

  const { data: report, isLoading: reportLoading, isError: reportError, refetch: refetchReport } = useCollectionReport(academicYearId);
  const { data: defaulters, isLoading: defaultersLoading } = useDefaulters(academicYearId);
  const { data: recentInvoices, isLoading: invoicesLoading } = useInvoices({
    page: 1,
    limit: 5,
    academicYearId: academicYearId || undefined,
    status: 'PAID',
  });

  const summaryCards = report
    ? [
        {
          label: 'Total Invoiced',
          value: <AmountDisplay amount={report.totalInvoiced} />,
          icon: DollarSign,
          color: 'text-gray-700',
        },
        {
          label: 'Collected',
          value: <AmountDisplay amount={report.totalCollected} />,
          icon: TrendingUp,
          color: 'text-success-600',
        },
        {
          label: 'Pending',
          value: <AmountDisplay amount={report.totalPending} />,
          icon: TrendingDown,
          color: 'text-error-600',
        },
        {
          label: 'Collection Rate',
          value: <span className="font-mono">{report.collectionRate.toFixed(1)}%</span>,
          icon: Percent,
          color: 'text-brand-500',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Fee structures, invoices, and payments"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/finance/fee-structures')}
            >
              Fee Structures
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              size="sm"
              onClick={() => router.push('/finance/invoices')}
            >
              View Invoices
            </Button>
          </div>
        }
      />

      {/* Summary cards — TailAdmin stat card style */}
      {reportError ? (
        <QueryErrorState onRetry={() => refetchReport()} />
      ) : reportLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 2xl:gap-7.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-sm" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 2xl:gap-7.5">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-2 dark:bg-meta-4">
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <h4 className="text-title-md font-bold text-black dark:text-white">
                    {card.value}
                  </h4>
                  <span className="text-sm font-medium">{card.label}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 2xl:gap-7.5">
        {/* Recent paid invoices */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
            <h4 className="text-xl font-semibold text-black dark:text-white">Recent Payments</h4>
          </div>
          <div className="p-4 sm:p-6 xl:p-7.5">
            {invoicesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentInvoices?.data && recentInvoices.data.length > 0 ? (
              <div className="divide-y divide-stroke dark:divide-strokedark">
                {recentInvoices.data.map((inv) => (
                  <div key={inv.id} className="py-3 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium text-black dark:text-white">{inv.studentName}</p>
                      <p className="text-xs text-gray-500 font-mono">{inv.invoiceNumber} · {inv.className}</p>
                    </div>
                    <div className="text-right">
                      <AmountDisplay amount={inv.paidAmount} className="text-success-600 text-sm" />
                      <p className="text-xs text-gray-500">
                        <BsDate date={inv.dueDate} showAd={false} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No recent payments</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-brand-500 hover:text-brand-600"
              onClick={() => router.push('/finance/invoices?status=PAID')}
            >
              View all →
            </Button>
          </div>
        </div>

        {/* Top defaulters */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
            <h4 className="text-xl font-semibold text-black dark:text-white">Top Defaulters</h4>
          </div>
          <div className="p-4 sm:p-6 xl:p-7.5">
            {defaultersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : defaulters && defaulters.length > 0 ? (
              <div className="divide-y divide-stroke dark:divide-strokedark">
                {defaulters.slice(0, 5).map((d) => (
                  <div key={d.studentId} className="py-3 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium text-black dark:text-white">{d.fullName}</p>
                      <p className="text-xs text-gray-500">{d.className} · {d.overdueInvoices} overdue</p>
                    </div>
                    <AmountDisplay amount={d.totalDue} className="text-error-600 text-sm" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No defaulters</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-brand-500 hover:text-brand-600"
              onClick={() => router.push('/finance/reports')}
            >
              Full report →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
