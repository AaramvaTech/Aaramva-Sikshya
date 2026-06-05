'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, CheckSquare, CreditCard, Bell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import api from '@/lib/api';
import type { ApiResponse } from '@/types/api.types';

interface StatCardProps {
  title: string;
  icon: React.ElementType;
  value: string | number | undefined;
  isLoading: boolean;
}

function StatCard({ title, icon: Icon, value, isLoading }: StatCardProps) {
  return (
    <Card className="border-gray-100 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            {isLoading ? (
              <Skeleton className="h-9 w-24 mb-1" />
            ) : (
              <p className="text-3xl font-bold text-[#1A5C38]">{value ?? '—'}</p>
            )}
            <p className="text-sm text-gray-500 mt-1">{title}</p>
          </div>
          <div className="rounded-full bg-[#1A5C38]/10 p-3">
            <Icon className="h-5 w-5 text-[#1A5C38]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const students = useQuery({
    queryKey: ['dashboard', 'students'],
    queryFn: () =>
      api
        .get<ApiResponse<unknown>>('/students?page=1&limit=1')
        .then((r) => r.data.meta?.total ?? 0),
  });

  const attendance = useQuery({
    queryKey: ['dashboard', 'attendance'],
    queryFn: () =>
      api
        .get<ApiResponse<{ percent: number }>>('/attendance/students/school/summary')
        .then((r) => `${r.data.data?.percent ?? 0}%`),
  });

  const fees = useQuery({
    queryKey: ['dashboard', 'fees'],
    queryFn: () =>
      api
        .get<ApiResponse<{ totalPending: number }>>('/finance/reports/collection')
        .then((r) => {
          const v = r.data.data?.totalPending ?? 0;
          return `Rs. ${v.toLocaleString()}`;
        })
        .catch(() => 'Rs. 0'),
  });

  const notices = useQuery({
    queryKey: ['dashboard', 'notices'],
    queryFn: () =>
      api
        .get<ApiResponse<{ count: number }>>('/communication/notifications/unread-count')
        .then((r) => r.data.data?.count ?? 0),
  });

  return (
    <div>
      <PageHeader title="Dashboard" description="School overview" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Students"
          icon={Users}
          value={students.data}
          isLoading={students.isLoading}
        />
        <StatCard
          title="Today's Attendance"
          icon={CheckSquare}
          value={attendance.data}
          isLoading={attendance.isLoading}
        />
        <StatCard
          title="Pending Fees"
          icon={CreditCard}
          value={fees.data}
          isLoading={fees.isLoading}
        />
        <StatCard
          title="Unread Notices"
          icon={Bell}
          value={notices.data}
          isLoading={notices.isLoading}
        />
      </div>

      <div className="mt-8 rounded-xl border border-gray-100 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-2">Recent Activity</h2>
        <p className="text-sm text-gray-400">Activity feed coming in a future session.</p>
      </div>
    </div>
  );
}
