'use client';

import { Skeleton } from '@/components/ui/skeleton';

interface StatCardProps {
  title: string;
  value: string | number | undefined;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  isLoading: boolean;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  isLoading,
}: StatCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${iconBg}`}
        >
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">{title}</p>
          {isLoading ? (
            <Skeleton className="h-7 w-16 mt-0.5" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {value ?? '—'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
