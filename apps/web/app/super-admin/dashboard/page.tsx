'use client';

import Link from 'next/link';
import { School, CheckCircle, Clock, Ban } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { usePlatformOverview } from '@/lib/hooks/use-super-admin';

function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  title: string;
  value: number | undefined;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${iconBg}`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">{title}</p>
          {value === undefined ? (
            <Skeleton className="h-7 w-12 mt-0.5" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlatformDashboardPage() {
  const { data: overview, isLoading } = usePlatformOverview();

  return (
    <div>
      <PageHeader title="Platform Overview" description="Aaramva Shikshya — Admin Console" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Schools"
          value={overview?.totals.schools}
          icon={School}
          iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
          iconColor="text-brand-500 dark:text-brand-400"
        />
        <StatCard
          title="Active Schools"
          value={overview?.totals.activeSchools}
          icon={CheckCircle}
          iconBg="bg-success-50 dark:bg-success-500/[0.12]"
          iconColor="text-success-500 dark:text-success-400"
        />
        <StatCard
          title="On Trial"
          value={overview?.totals.trialSchools}
          icon={Clock}
          iconBg="bg-warning-50 dark:bg-warning-500/[0.12]"
          iconColor="text-warning-500 dark:text-warning-400"
        />
        <StatCard
          title="Suspended"
          value={overview?.totals.suspendedSchools}
          icon={Ban}
          iconBg="bg-error-50 dark:bg-error-500/[0.12]"
          iconColor="text-error-500 dark:text-error-400"
        />
      </div>

      <h2 className="text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
        By Subscription Plan
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {['trial', 'basic', 'pro', 'enterprise'].map((plan) => (
          <div
            key={plan}
            className="rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-theme-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <p className="text-theme-xs font-medium text-gray-500 dark:text-gray-400 capitalize mb-1">
              {plan}
            </p>
            {isLoading ? (
              <Skeleton className="h-8 w-8 mx-auto" />
            ) : (
              <p className="text-3xl font-bold text-gray-800 dark:text-white">
                {overview?.subscriptions[plan as keyof typeof overview.subscriptions] ?? 0}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white">
            Recently Joined Schools
          </h3>
          <Link
            href="/super-admin/schools"
            className="text-theme-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  School
                </th>
                <th className="text-left px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Slug
                </th>
                <th className="text-left px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Plan
                </th>
                <th className="text-left px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                      {[1, 2, 3, 4].map((j) => (
                        <td key={j} className="px-5 py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                : (overview?.recentOnboarding ?? []).map((school) => (
                    <tr
                      key={school.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-gray-800 dark:text-white">
                        {school.name}
                      </td>
                      <td className="px-5 py-3 font-mono text-theme-xs text-gray-500 dark:text-gray-400">
                        {school.slug}
                      </td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{school.planName}</td>
                      <td className="px-5 py-3 text-theme-xs text-gray-500 dark:text-gray-400">
                        {new Date(school.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
              {!isLoading && (overview?.recentOnboarding ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-theme-sm text-gray-400 dark:text-gray-500"
                  >
                    No schools onboarded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
