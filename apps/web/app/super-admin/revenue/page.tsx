'use client';

import { useMemo } from 'react';
import { TrendingUp, DollarSign, School, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { useRevenue } from '@/lib/hooks/use-revenue';

function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${iconBg}`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {subtitle && (
            <p className="text-theme-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RevenuePage() {
  const { data: revenue, isLoading } = useRevenue();

  const stats = useMemo(() => {
    if (!revenue || revenue.length === 0) {
      return {
        totalRevenue: 0,
        totalSchools: 0,
        thisMonth: 0,
        lastMonth: 0,
        byPlan: {} as Record<string, number>,
      };
    }

    const totalRevenue = revenue.reduce((sum, r) => sum + r.revenue, 0);
    const totalSchools = revenue.reduce((sum, r) => sum + r.activeSchools, 0);

    const byMonth: Record<string, number> = {};
    for (const r of revenue) {
      byMonth[r.month] = (byMonth[r.month] ?? 0) + r.revenue;
    }
    const months = Object.keys(byMonth).sort().reverse();
    const thisMonth = months.length > 0 ? byMonth[months[0]] : 0;
    const lastMonth = months.length > 1 ? byMonth[months[1]] : 0;

    const byPlan: Record<string, number> = {};
    for (const r of revenue) {
      byPlan[r.planName] = (byPlan[r.planName] ?? 0) + r.revenue;
    }

    return { totalRevenue, totalSchools, thisMonth, lastMonth, byPlan };
  }, [revenue]);

  const chartData = useMemo(() => {
    if (!revenue) return [];
    const byMonth: Record<string, number> = {};
    for (const r of revenue) {
      byMonth[r.month] = (byMonth[r.month] ?? 0) + r.revenue;
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, rev]) => ({ month, revenue: rev }));
  }, [revenue]);

  const maxRevenue = chartData.length > 0 ? Math.max(...chartData.map((d) => d.revenue)) : 1;

  return (
    <div>
      <PageHeader
        title="Revenue Analytics"
        description="Platform revenue breakdown by month and plan"
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Revenue"
          value={isLoading ? '—' : `Rs. ${stats.totalRevenue.toLocaleString()}`}
          icon={DollarSign}
          iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
          iconColor="text-brand-500 dark:text-brand-400"
          subtitle="All time"
        />
        <StatCard
          title="This Month"
          value={isLoading ? '—' : `Rs. ${stats.thisMonth.toLocaleString()}`}
          icon={TrendingUp}
          iconBg="bg-success-50 dark:bg-success-500/[0.12]"
          iconColor="text-success-500 dark:text-success-400"
          subtitle={
            stats.lastMonth > 0
              ? `${(((stats.thisMonth - stats.lastMonth) / stats.lastMonth) * 100).toFixed(1)}% vs last month`
              : undefined
          }
        />
        <StatCard
          title="Active Subscriptions"
          value={isLoading ? '—' : String(stats.totalSchools)}
          icon={School}
          iconBg="bg-warning-50 dark:bg-warning-500/[0.12]"
          iconColor="text-warning-500 dark:text-warning-400"
          subtitle="Paying schools"
        />
        <StatCard
          title="Plans Generating Revenue"
          value={isLoading ? '—' : String(Object.keys(stats.byPlan).length)}
          icon={Calendar}
          iconBg="bg-purple-50 dark:bg-purple-500/[0.12]"
          iconColor="text-purple-500 dark:text-purple-400"
        />
      </div>

      {/* Revenue bar chart */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 p-5 mb-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">
          Monthly Revenue
        </h3>
        {isLoading ? (
          <div className="flex items-end gap-2 h-48">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1"
                style={{ height: `${30 + Math.random() * 60}%` }}
              />
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-theme-sm text-gray-400 dark:text-gray-500 text-center py-16">
            No revenue data yet
          </p>
        ) : (
          <div className="flex items-end gap-2 h-48">
            {chartData.map((d) => (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                  Rs. {(d.revenue / 1000).toFixed(0)}k
                </span>
                <div
                  className="w-full rounded-t-md bg-brand-500 dark:bg-brand-400 transition-all duration-300 min-h-[4px]"
                  style={{
                    height: `${Math.max((d.revenue / maxRevenue) * 100, 2)}%`,
                  }}
                />
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {d.month.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plan breakdown */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white">
            Revenue by Plan
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Plan
                </th>
                <th className="text-right px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Revenue
                </th>
                <th className="text-right px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    {[1, 2, 3].map((j) => (
                      <td key={j} className="px-5 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : Object.keys(stats.byPlan).length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-5 py-10 text-center text-theme-sm text-gray-400"
                  >
                    No data
                  </td>
                </tr>
              ) : (
                Object.entries(stats.byPlan)
                  .sort(([, a], [, b]) => b - a)
                  .map(([plan, rev]) => (
                    <tr
                      key={plan}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3 font-medium text-gray-800 dark:text-white capitalize">
                        {plan}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-300">
                        Rs. {rev.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">
                        {stats.totalRevenue > 0
                          ? ((rev / stats.totalRevenue) * 100).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
