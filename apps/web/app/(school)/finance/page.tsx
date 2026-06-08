'use client';

import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  const { data: report, isLoading: reportLoading } = useCollectionReport(academicYearId);
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

      {/* Summary cards */}
      {reportLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {summaryCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{card.label}</span>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent paid invoices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">Recent Payments</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {invoicesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentInvoices?.data && recentInvoices.data.length > 0 ? (
              <div className="divide-y">
                {recentInvoices.data.map((inv) => (
                  <div key={inv.id} className="py-2.5 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{inv.studentName}</p>
                      <p className="text-xs text-gray-400 font-mono">{inv.invoiceNumber} · {inv.className}</p>
                    </div>
                    <div className="text-right">
                      <AmountDisplay amount={inv.paidAmount} className="text-success-600 text-sm" />
                      <p className="text-xs text-gray-400">
                        <BsDate date={inv.dueDate} showAd={false} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No recent payments</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-brand-500 hover:text-brand-600"
              onClick={() => router.push('/finance/invoices?status=PAID')}
            >
              View all →
            </Button>
          </CardContent>
        </Card>

        {/* Top defaulters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">Top Defaulters</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {defaultersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : defaulters && defaulters.length > 0 ? (
              <div className="divide-y">
                {defaulters.slice(0, 5).map((d) => (
                  <div key={d.studentId} className="py-2.5 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{d.fullName}</p>
                      <p className="text-xs text-gray-400">{d.className} · {d.overdueInvoices} overdue</p>
                    </div>
                    <AmountDisplay amount={d.totalDue} className="text-error-600 text-sm" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No defaulters</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-brand-500 hover:text-brand-600"
              onClick={() => router.push('/finance/reports')}
            >
              Full report →
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
