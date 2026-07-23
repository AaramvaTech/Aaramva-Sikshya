'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Clock, GraduationCap, CheckSquare, XCircle, AlarmClock, CalendarOff, BookOpen,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { BsDate } from '@/components/shared/bs-date';
import { useTenantStore } from '@/store/tenant.store';
import { useMySections, useMyTimetable } from '@/lib/hooks/use-timetable';
import { useMyStaffProfile } from '@/lib/hooks/use-hr';
import { useMyStaffAttendanceSummary } from '@/lib/hooks/use-attendance';
import { useWeeklyAttendance, useUpcomingEvents } from '@/lib/hooks/use-dashboard';

/**
 * WEB-P Phase 2 Task 1 — real TEACHER dashboard, replacing the Phase 1
 * placeholder. Only calls endpoints TEACHER_AND_ABOVE can reach:
 * /timetable/my, /timetable/my/sections, /hr/staff/me,
 * /attendance/staff/my/summary, /dashboard/weekly-attendance,
 * /dashboard/upcoming. Deliberately does NOT call /dashboard/overview or
 * /dashboard/activity (PRINCIPAL_AND_ABOVE only) — this is what resolves two
 * of the four pre-existing TEACHER 403 bugs (WEB-P-PORTAL.md §6), by
 * construction rather than a backend role change.
 */
export default function TeacherDashboardPage() {
  const tenantName = useTenantStore((s) => s.name);

  const {
    data: timetable,
    isLoading: timetableLoading,
    isError: timetableError,
    refetch: refetchTimetable,
  } = useMyTimetable();

  const {
    data: sections,
    isLoading: sectionsLoading,
    isError: sectionsError,
    refetch: refetchSections,
  } = useMySections();

  const { data: profile, isLoading: profileLoading } = useMyStaffProfile();

  // /attendance/staff/my/summary requires AD year/month (Postgres EXTRACT on
  // the stored date) — "this month" means the current AD month, not BS.
  const now = new Date();
  const {
    data: attendanceSummary,
    isLoading: attendanceSummaryLoading,
    isError: attendanceSummaryError,
    refetch: refetchAttendanceSummary,
  } = useMyStaffAttendanceSummary(now.getFullYear(), now.getMonth() + 1);

  const {
    data: weekly,
    isLoading: weeklyLoading,
    isError: weeklyError,
    refetch: refetchWeekly,
  } = useWeeklyAttendance();

  const {
    data: upcoming,
    isLoading: upcomingLoading,
    isError: upcomingError,
    refetch: refetchUpcoming,
  } = useUpcomingEvents();

  // schedule is keyed 0(Sun)–6(Sat), matching JS Date#getDay() 1:1. Saturday
  // naturally has no slots (no school), so no special-cased day check is
  // needed — an empty todaysClasses list covers both "nothing scheduled" and
  // "it's Saturday" with the same empty state.
  const todayKey = String(now.getDay());
  const todaysClasses = (timetable?.schedule[todayKey] ?? [])
    .slice()
    .sort((a, b) => a.periodNumber - b.periodNumber);

  return (
    <div>
      <PageHeader
        title={profile?.fullName ? `Welcome, ${profile.fullName.split(' ')[0]}` : 'Welcome'}
        description={tenantName ? `Your teaching overview at ${tenantName}` : 'Your teaching overview'}
      />

      {/* ── Today's Classes + My Sections ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            Today&apos;s Classes
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            Your periods scheduled for today
          </p>
          {timetableLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : timetableError ? (
            <QueryErrorState onRetry={() => refetchTimetable()} />
          ) : todaysClasses.length > 0 ? (
            <div className="space-y-3">
              {todaysClasses.map((slot) => (
                <div
                  key={slot.slotId}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-800 p-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12] flex-shrink-0">
                    <Clock className="h-5 w-5 text-brand-500 dark:text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                      {slot.subject.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {slot.className} {slot.section}
                      {slot.room ? ` · ${slot.room}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      P{slot.periodNumber}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {slot.startTime} – {slot.endTime}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              No classes scheduled today
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            My Sections
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            Classes and sections you teach or lead
          </p>
          {sectionsLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : sectionsError ? (
            <QueryErrorState onRetry={() => refetchSections()} />
          ) : sections && sections.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sections.map((sec) => (
                <div
                  key={sec.sectionId}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-800 p-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12] flex-shrink-0">
                    <GraduationCap className="h-4 w-4 text-brand-500 dark:text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                      {sec.className} {sec.sectionName}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              No sections assigned
            </p>
          )}
        </div>
      </div>

      {/* ── My Attendance This Month + Weekly Attendance (school-wide) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            My Attendance This Month
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            Your own staff-attendance record
          </p>
          {attendanceSummaryLoading || profileLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : attendanceSummaryError ? (
            <QueryErrorState onRetry={() => refetchAttendanceSummary()} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                title="Present"
                value={attendanceSummary?.present}
                isLoading={false}
                icon={CheckSquare}
                iconBg="bg-success-50 dark:bg-success-500/[0.12]"
                iconColor="text-success-500 dark:text-success-400"
              />
              <StatCard
                title="Absent"
                value={attendanceSummary?.absent}
                isLoading={false}
                icon={XCircle}
                iconBg="bg-error-50 dark:bg-error-500/[0.12]"
                iconColor="text-error-500 dark:text-error-400"
              />
              <StatCard
                title="Late"
                value={attendanceSummary?.late}
                isLoading={false}
                icon={AlarmClock}
                iconBg="bg-warning-50 dark:bg-warning-500/[0.12]"
                iconColor="text-warning-500 dark:text-warning-400"
              />
              <StatCard
                title="Leave"
                value={attendanceSummary?.leave}
                isLoading={false}
                icon={CalendarOff}
                iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
                iconColor="text-brand-500 dark:text-brand-400"
              />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
            Weekly Attendance
          </h3>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
            School-wide attendance rate over the past 7 days
          </p>
          {weeklyLoading ? (
            <div className="flex items-end gap-2 h-[200px] px-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${30 + Math.random() * 60}%` }} />
              ))}
            </div>
          ) : weeklyError ? (
            <QueryErrorState onRetry={() => refetchWeekly()} />
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
      </div>

      {/* ── Upcoming Exams ────────────────────────────────────────────────── */}
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
        ) : upcomingError ? (
          <QueryErrorState onRetry={() => refetchUpcoming()} />
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
  );
}
