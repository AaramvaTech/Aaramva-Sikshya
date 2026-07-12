'use client';

import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import {
  GraduationCap,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useStudentStats } from '@/lib/hooks/use-students';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StorageAvatarImage } from '@/components/shared/storage-avatar-image';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconBg,
  iconColor,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  iconBg: string;
  iconColor: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-20 mt-1" />
          ) : (
            <p className="text-3xl font-bold text-black dark:text-white">{value}</p>
          )}
          {sub && !loading && (
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          )}
        </div>
        <div className={cn('p-3 rounded-xl', iconBg)}>
          <Icon className={cn('h-6 w-6', iconColor)} />
        </div>
      </div>
    </div>
  );
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────────

function ClassTooltip({ active, payload }: { active?: boolean; payload?: { value: number; name: string }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stroke bg-white px-3 py-2 shadow-md dark:border-strokedark dark:bg-boxdark text-sm">
      <p className="font-semibold text-black dark:text-white">{payload[0].value} students</p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#22c55e',
  INACTIVE: '#f59e0b',
  TRANSFERRED: '#3b82f6',
  GRADUATED: '#8b5cf6',
};

const GENDER_COLORS = ['#3b82f6', '#ec4899', '#8b5cf6'];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  TRANSFERRED: 'Transferred',
  GRADUATED: 'Graduated',
};

export default function StudentsOverviewPage() {
  const { data: stats, isLoading } = useStudentStats();

  const statusData = stats
    ? Object.entries(stats.byStatus).map(([key, val]) => ({ name: STATUS_LABELS[key] ?? key, value: val, key }))
    : [];

  const genderData = stats
    ? [
        { name: 'Male', value: stats.byGender.MALE },
        { name: 'Female', value: stats.byGender.FEMALE },
        { name: 'Other', value: stats.byGender.OTHER },
      ].filter((d) => d.value > 0)
    : [];

  const classData = stats?.byClass.map((c) => ({ name: c.className, count: c.count })) ?? [];

  const activePercent = stats && stats.total > 0
    ? Math.round((stats.byStatus.ACTIVE / stats.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students Overview"
        description="At-a-glance view of all enrolled students"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={() => { window.location.href = '/students/new'; }}
          >
            + Admit Student
          </Button>
        }
      />

      {/* ── Top stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Students"
          value={stats?.total ?? 0}
          sub="All enrolled"
          iconBg="bg-brand-50"
          iconColor="text-brand-500"
          loading={isLoading}
        />
        <StatCard
          icon={UserCheck}
          label="Active"
          value={stats?.byStatus.ACTIVE ?? 0}
          sub={stats ? `${activePercent}% of total` : undefined}
          iconBg="bg-green-50"
          iconColor="text-green-600"
          loading={isLoading}
        />
        <StatCard
          icon={UserPlus}
          label="New This Month"
          value={stats?.newThisMonth ?? 0}
          sub="Admitted in current month"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          loading={isLoading}
        />
        <StatCard
          icon={GraduationCap}
          label="Graduated"
          value={stats?.byStatus.GRADUATED ?? 0}
          sub="All time"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          loading={isLoading}
        />
      </div>

      {/* ── Charts row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Status breakdown */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
            <h4 className="font-semibold text-black dark:text-white text-sm">Status Breakdown</h4>
          </div>
          <div className="p-5">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {statusData.map((s) => (
                  <div key={s.key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-black dark:text-white">{s.name}</span>
                      <span className="text-gray-500 font-mono">{s.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: stats && stats.total > 0 ? `${(s.value / stats.total) * 100}%` : '0%',
                          backgroundColor: STATUS_COLORS[s.key] ?? '#6b7280',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Gender distribution */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
            <h4 className="font-semibold text-black dark:text-white text-sm">Gender Distribution</h4>
          </div>
          <div className="p-5 flex flex-col items-center">
            {isLoading ? (
              <Skeleton className="h-40 w-40 rounded-full" />
            ) : genderData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8">No data</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={genderData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                    >
                      {genderData.map((_, i) => (
                        <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>}
                    />
                    <Tooltip
                      formatter={(value) => [`${value} students`, '']}
                      contentStyle={{ fontSize: '12px', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="w-full mt-2 space-y-1.5">
                  {genderData.map((d, i) => (
                    <div key={d.name} className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: GENDER_COLORS[i % GENDER_COLORS.length] }}
                        />
                        {d.name}
                      </span>
                      <span className="font-semibold text-black dark:text-white">
                        {d.value}
                        {stats && stats.total > 0 && (
                          <span className="text-gray-400 font-normal ml-1">
                            ({Math.round((d.value / stats.total) * 100)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Class-wise enrollment */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-5 py-4 dark:border-strokedark flex items-center justify-between">
            <h4 className="font-semibold text-black dark:text-white text-sm">Class Enrollment</h4>
            <span className="text-xs text-gray-400">Active students</span>
          </div>
          <div className="p-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : classData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No class data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, classData.length * 32)}>
                <BarChart
                  data={classData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                  />
                  <Tooltip content={<ClassTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {classData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={`hsl(${220 + i * 15}, 70%, ${55 + (i % 3) * 5}%)`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Admissions ──────────────────────────────────────── */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-5 py-4 dark:border-strokedark flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-500" />
            <h4 className="font-semibold text-black dark:text-white text-sm">Recent Admissions</h4>
          </div>
          <Link href="/students" className="text-xs text-brand-500 hover:underline">
            View all
          </Link>
        </div>

        <div className="divide-y divide-stroke dark:divide-strokedark">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : !stats?.recentAdmissions?.length ? (
            <div className="py-10 text-center text-sm text-gray-400">No recent admissions</div>
          ) : (
            stats.recentAdmissions.map((s) => (
              <Link
                key={s.id}
                href={`/students/${s.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <StorageAvatarImage value={s.photoUrl} className="object-cover" />
                  <AvatarFallback className="text-xs bg-brand-50 text-brand-500 font-semibold">
                    {initials(s.fullName)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-black dark:text-white truncate">{s.fullName}</p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{s.studentId}</p>
                </div>

                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                  {s.className && (
                    <span className="text-xs text-gray-500">
                      {s.className}{s.sectionName ? ` · ${s.sectionName}` : ''}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    <BsDate date={s.admissionDate} showAd={false} />
                  </span>
                </div>

                <div className="shrink-0">
                  <StatusBadge status={s.status} />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
