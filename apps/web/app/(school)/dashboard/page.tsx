'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Users, CheckSquare, CreditCard, Bell,
} from 'lucide-react';
import api from '@/lib/api';
import type { ApiResponse } from '@/types/api.types';

interface StatCardProps {
  title: string;
  value: string | number | undefined;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  isLoading: boolean;
}

function StatCard({ title, value, icon: Icon, iconBg, iconColor, isLoading }: StatCardProps) {
  return (
    <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-2 dark:bg-meta-4">
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          {isLoading ? (
            <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
          ) : (
            <h4 className="text-title-md font-bold text-black dark:text-white">
              {value ?? '—'}
            </h4>
          )}
          <span className="text-sm font-medium">{title}</span>
        </div>
      </div>
    </div>
  );
}

const weeklyData = [
  { day: 'Mon', present: 85 },
  { day: 'Tue', present: 78 },
  { day: 'Wed', present: 92 },
  { day: 'Thu', present: 88 },
  { day: 'Fri', present: 76 },
  { day: 'Sat', present: 45 },
];

export default function DashboardPage() {
  const students = useQuery({
    queryKey: ['dashboard', 'students'],
    queryFn: () =>
      api.get<ApiResponse<unknown>>('/students?page=1&limit=1').then((r) => r.data.meta?.total ?? 0),
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
      {/* Page title */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">Dashboard</h2>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-1">School overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:gap-7.5">
        <StatCard
          title="Total Students"
          value={students.data}
          isLoading={students.isLoading}
          icon={Users}
          iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
          iconColor="text-brand-500 dark:text-brand-400"
        />
        <StatCard
          title="Today's Attendance"
          value={attendance.data}
          isLoading={attendance.isLoading}
          icon={CheckSquare}
          iconBg="bg-success-50 dark:bg-success-500/[0.12]"
          iconColor="text-success-500 dark:text-success-400"
        />
        <StatCard
          title="Pending Fees"
          value={fees.data}
          isLoading={fees.isLoading}
          icon={CreditCard}
          iconBg="bg-warning-50 dark:bg-warning-500/[0.12]"
          iconColor="text-warning-500 dark:text-warning-400"
        />
        <StatCard
          title="Unread Notices"
          value={notices.data}
          isLoading={notices.isLoading}
          icon={Bell}
          iconBg="bg-error-50 dark:bg-error-500/[0.12]"
          iconColor="text-error-500 dark:text-error-400"
        />
      </div>

      {/* Weekly attendance chart */}
      <div className="mt-4 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark 2xl:mt-7.5">
        <div className="px-4 py-6 md:px-6 xl:px-7.5">
          <h4 className="text-xl font-semibold text-black dark:text-white">
            Weekly Attendance
          </h4>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
            Attendance percentage this week
          </p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weeklyData} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: 'var(--color-gray-500)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: 'var(--color-gray-500)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              formatter={(v) => [`${v}%`, 'Present']}
              contentStyle={{
                borderRadius: '0.75rem',
                border: '1px solid var(--color-gray-200)',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="present" fill="var(--color-brand-500)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
