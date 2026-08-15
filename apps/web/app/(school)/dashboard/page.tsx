'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Users, CheckSquare, CreditCard, Bell, UserPlus, PenSquare, DollarSign,
  FileText, CalendarDays, BookOpen, GraduationCap, Clock,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { BsDate } from '@/components/shared/bs-date';
import { useDashboardOverview, useWeeklyAttendance, useRecentActivity, useUpcomingEvents } from '@/lib/hooks/use-dashboard';
import api from '@/lib/api';
import type { ApiResponse } from '@/types/api.types';

export default function DashboardPage() {
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview();
  const { data: weekly, isLoading: weeklyLoading } = useWeeklyAttendance();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();
  const { data: upcoming, isLoading: upcomingLoading } = useUpcomingEvents();

  // Fetch total students count (separate for the "Total Students" card active count)
  const studentsCount = useQuery({
    queryKey: ['dashboard', 'students-count'],
    queryFn: () =>
      api.get<ApiResponse<unknown>>('/students?page=1&limit=1').then((r) => r.data.meta?.total ?? 0),
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="School overview and key metrics"
      />

      {/* ── Stat Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Students"
          value={overview?.students.active ?? studentsCount.data}
          isLoading={overviewLoading && studentsCount.isLoading}
          icon={Users}
          iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
          iconColor="text-brand-500 dark:text-brand-400"
        />
        <StatCard
          title="Today's Attendance"
          value={overview ? `${overview.attendance.attendanceRate}%` : undefined}
          isLoading={overviewLoading}
          icon={CheckSquare}
          iconBg="bg-success-50 dark:bg-success-500/[0.12]"
          iconColor="text-success-500 dark:text-success-400"
        />
        <StatCard
          title="Pending Fees"
          value={overview?.fees ? `Rs. ${overview.fees.totalPending.toLocaleString()}` : undefined}
          isLoading={overviewLoading}
          icon={CreditCard}
          iconBg="bg-warning-50 dark:bg-warning-500/[0.12]"
          iconColor="text-warning-500 dark:text-warning-400"
        />
        <StatCard
          title="Unread Notices"
          value={overview?.unreadNotifications}
          isLoading={overviewLoading}
          icon={Bell}
          iconBg="bg-error-50 dark:bg-error-500/[0.12]"
          iconColor="text-error-500 dark:text-error-400"
        />
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Link
          href="/attendance/mark"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <PenSquare className="h-4 w-4" />
          Mark Attendance
        </Link>
        <Link
          href="/students/new"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Add Student
        </Link>
        <Link
          href="/communication/notices"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Send Notice
        </Link>
        <Link
          href="/finance/bill/payments/new"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <DollarSign className="h-4 w-4" />
          Record Payment
        </Link>
      </div>

      {/* ── Charts Row: Weekly Attendance + Class Breakdown ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Weekly Attendance Chart */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            Weekly Attendance
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            Attendance rate over the past 7 days
          </p>
          {weeklyLoading ? (
            <div className="flex items-end gap-2 h-[200px] px-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${30 + Math.random() * 60}%` }} />
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekly?.days ?? []} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" vertical={false} />
                <XAxis
                  dataKey="dayOfWeek"
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
                  formatter={(v) => [`${v}%`, 'Attendance']}
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: '1px solid var(--color-gray-200)',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="rate" fill="var(--color-brand-500)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Class-wise Attendance Breakdown */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            Class-wise Attendance
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            Today&apos;s attendance breakdown by class
          </p>
          {overviewLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : overview?.attendance.byClass.length ? (
            <div className="space-y-3">
              {overview.attendance.byClass.map((cls) => (
                <div key={cls.classId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12]">
                      <GraduationCap className="h-4 w-4 text-brand-500 dark:text-brand-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white">
                        {cls.className}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {cls.present}/{cls.total} present
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      cls.rate >= 90
                        ? 'text-success-500'
                        : cls.rate >= 75
                          ? 'text-warning-500'
                          : 'text-error-500'
                    }`}
                  >
                    {cls.rate}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              No attendance data for today
            </p>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Recent Activity + Upcoming Events ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            Recent Activity
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            Latest updates across the school
          </p>
          {activityLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Recent Students */}
              {activity?.recentStudents && activity.recentStudents.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    New Students
                  </p>
                  {activity.recentStudents.slice(0, 3).map((s) => (
                    <div key={s.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/[0.12]">
                        <Users className="h-3.5 w-3.5 text-brand-500 dark:text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                          {s.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          <BsDate date={s.admittedAt.ad} />
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Payments */}
              {activity?.recentPayments && activity.recentPayments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    Recent Payments
                  </p>
                  {activity.recentPayments.slice(0, 3).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-50 dark:bg-success-500/[0.12]">
                        <DollarSign className="h-3.5 w-3.5 text-success-500 dark:text-success-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                          {p.studentName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Rs. {p.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Notices */}
              {activity?.recentNotices && activity.recentNotices.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    Recent Notices
                  </p>
                  {activity.recentNotices.slice(0, 3).map((n) => (
                    <div key={n.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-500/[0.12]">
                        <Bell className="h-3.5 w-3.5 text-warning-500 dark:text-warning-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                          {n.title}
                        </p>
                        {n.publishedAt && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <BsDate date={n.publishedAt.ad} />
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!activity?.recentStudents?.length && !activity?.recentPayments?.length && !activity?.recentNotices?.length && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  No recent activity
                </p>
              )}
            </div>
          )}
        </div>

        {/* Upcoming Exams */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            Upcoming Exams
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            Scheduled examinations
          </p>
          {upcomingLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : upcoming?.exams.length ? (
            <div className="space-y-3">
              {upcoming.exams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-800 p-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12]">
                    <BookOpen className="h-5 w-5 text-brand-500 dark:text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">
                      {exam.subjectName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {exam.className}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      <BsDate date={exam.examDate.ad} />
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {exam.startTime} – {exam.endTime}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              No upcoming exams scheduled
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
