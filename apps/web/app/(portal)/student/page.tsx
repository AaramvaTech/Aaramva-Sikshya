'use client';

import Link from 'next/link';
import {
  CalendarCheck2,
  CheckSquare,
  XCircle,
  AlarmClock,
  CalendarOff,
  Clock,
  ClipboardList,
  Bell,
  GraduationCap,
  ArrowRight,
} from 'lucide-react';
import { todayBs, formatBs } from 'bs-calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { BsDate } from '@/components/shared/bs-date';
import { Badge } from '@/components/ui/badge';
import {
  useStudentMeProfile,
  useMyTodayTimetable,
  useMyAttendanceSummary,
} from '@/lib/hooks/use-student-me';
import { useMyAssignments } from '@/lib/hooks/use-assignments';
import { useNotices } from '@/lib/hooks/use-communication';
import { assignmentStatusConfig } from '@/lib/assignment-status';
import type { MyAssignment } from '@/types/api.types';

/**
 * WEB-P Phase 4 Task 9 — the real student dashboard, replacing Phase 1's
 * placeholder. Pure composition: every widget below re-fetches data via a
 * hook already built (and live-proven) in an earlier task of this phase —
 * no new endpoints, no new derived math beyond plain array filter/sort/slice.
 *
 * Async-gate note (see CLAUDE.md's async-gate bug class): the four data-
 * widget hooks are each independently `enabled: !!slug`-gated with no
 * dependency on `useStudentMeProfile`'s result, so none of them need an
 * extra gate here. The ONE place a guard is needed is the greeting, which
 * reads `profile?.firstName`/`profile?.lastName` directly — gated with the
 * same `!value || isLoading` shape used throughout this bug class (e.g.
 * `app/(portal)/teacher/payroll/page.tsx`'s `!userId || isLoading`).
 */
export default function StudentDashboardPage() {
  const {
    data: profile,
    isLoading: profileLoading,
  } = useStudentMeProfile();

  const {
    data: timetable,
    isLoading: timetableLoading,
    isError: timetableError,
    refetch: refetchTimetable,
  } = useMyTodayTimetable();

  const {
    data: attendance,
    isLoading: attendanceLoading,
    isError: attendanceError,
    refetch: refetchAttendance,
  } = useMyAttendanceSummary();

  const {
    data: assignmentsData,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
    refetch: refetchAssignments,
  } = useMyAssignments({ page: 1, limit: 100 });

  const {
    data: noticesData,
    isLoading: noticesLoading,
    isError: noticesError,
    refetch: refetchNotices,
  } = useNotices({ page: 1, limit: 3 });

  const todayLabel = formatBs(todayBs(), 'en');

  // Client-filter to what's actually "upcoming": not yet submitted and
  // published (DRAFT never appears in /me results — the backend's own
  // filter already excludes it, so no status === 'DRAFT' check is needed
  // here). Sorted soonest-due-first, top 5 shown.
  const upcomingAssignments = (assignmentsData?.data ?? [])
    .filter((a) => a.mySubmission === null && a.status === 'PUBLISHED')
    .slice()
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  const notices = noticesData?.data ?? [];

  return (
    <div className="space-y-6">
      {/* ── Greeting header ─────────────────────────────────────────────── */}
      <div className="mb-2">
        {!profile || profileLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : (
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            Welcome, {profile.firstName} {profile.lastName}
          </h2>
        )}
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{todayLabel}</p>
      </div>

      {/* ── Attendance summary + Results quick-link ─────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white">
              My Attendance
            </h3>
            <CardLink href="/student/attendance" />
          </div>
          {attendanceError ? (
            <QueryErrorState onRetry={() => refetchAttendance()} message="Couldn't load your attendance summary." />
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex flex-shrink-0 items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/[0.12]">
                  <CalendarCheck2 className="h-7 w-7 text-brand-600 dark:text-brand-400" />
                </div>
                <div>
                  <p className="text-theme-sm text-gray-500 dark:text-gray-400">Year-to-date</p>
                  {attendanceLoading ? (
                    <Skeleton className="mt-1 h-9 w-20" />
                  ) : (
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {attendance ? `${attendance.attendancePercent}%` : '—'}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid flex-1 grid-cols-4 gap-2">
                <MiniStat label="Present" value={attendance?.present} isLoading={attendanceLoading} icon={CheckSquare} tone="success" />
                <MiniStat label="Absent" value={attendance?.absent} isLoading={attendanceLoading} icon={XCircle} tone="error" />
                <MiniStat label="Late" value={attendance?.late} isLoading={attendanceLoading} icon={AlarmClock} tone="warning" />
                <MiniStat label="Leave" value={attendance?.leave} isLoading={attendanceLoading} icon={CalendarOff} tone="brand" />
              </div>
            </div>
          )}
        </div>

        <Link
          href="/student/results"
          className="flex flex-col items-start justify-center rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm transition-colors hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-700"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/[0.12]">
            <GraduationCap className="h-6 w-6 text-brand-500 dark:text-brand-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white">My Results</h3>
          <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
            View published exam results and report cards
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
            View results <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </div>

      {/* ── Today's classes + Upcoming assignments ──────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Today&apos;s Classes</h3>
            <CardLink href="/student/timetable" />
          </div>
          <p className="mb-4 text-theme-xs text-gray-500 dark:text-gray-400">
            Your periods scheduled for today
          </p>
          {timetableLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : timetableError ? (
            <QueryErrorState onRetry={() => refetchTimetable()} message="Couldn't load today's timetable." />
          ) : !timetable?.isSchoolDay ? (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No classes today</p>
          ) : timetable.periods.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No classes today</p>
          ) : (
            <div className="space-y-3">
              {timetable.periods.map((period) => (
                <div
                  key={period.slotId}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12]">
                    <Clock className="h-5 w-5 text-brand-500 dark:text-brand-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-white">
                      {period.subject.name}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {period.teacher.fullName}
                      {period.room ? ` · ${period.room}` : ''}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      P{period.periodNumber}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {period.startTime} – {period.endTime}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Upcoming Assignments</h3>
            <CardLink href="/student/assignments" />
          </div>
          <p className="mb-4 text-theme-xs text-gray-500 dark:text-gray-400">
            Homework not yet submitted
          </p>
          {assignmentsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : assignmentsError ? (
            <QueryErrorState onRetry={() => refetchAssignments()} message="Couldn't load your assignments." />
          ) : upcomingAssignments.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              Nothing outstanding — you&apos;re all caught up.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingAssignments.map((a) => (
                <AssignmentRow key={a.id} assignment={a} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent notices ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white">Recent Notices</h3>
          <CardLink href="/student/notices" />
        </div>
        <p className="mb-4 text-theme-xs text-gray-500 dark:text-gray-400">School announcements</p>
        {noticesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : noticesError ? (
          <QueryErrorState onRetry={() => refetchNotices()} message="Couldn't load notices." />
        ) : notices.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No notices yet.</p>
        ) : (
          <div className="space-y-3">
            {notices.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-warning-50 dark:bg-warning-500/[0.12]">
                  <Bell className="h-4 w-4 text-warning-500 dark:text-warning-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-white">{n.title}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    <BsDate date={n.publishedAt ?? n.createdAt} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CardLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex-shrink-0 text-gray-400 transition-colors hover:text-brand-500 dark:hover:text-brand-400"
      aria-label="View all"
    >
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function AssignmentRow({ assignment: a }: { assignment: MyAssignment }) {
  const chip = assignmentStatusConfig(a);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12]">
        <ClipboardList className="h-5 w-5 text-brand-500 dark:text-brand-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-white">{a.title}</p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {a.subjectName ?? 'Subject'} · {a.className ?? 'Class'}
        </p>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        <Badge variant="outline" className={chip.className}>{chip.label}</Badge>
        <span className="text-xs text-gray-400">
          Due <BsDate date={a.dueDate} />
        </span>
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<'success' | 'error' | 'warning' | 'brand', string> = {
  success: 'text-success-700 dark:text-success-400',
  error: 'text-error-700 dark:text-error-400',
  warning: 'text-warning-700 dark:text-warning-400',
  brand: 'text-brand-700 dark:text-brand-400',
};

function MiniStat({
  label,
  value,
  isLoading,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  icon: React.ElementType;
  tone: 'success' | 'error' | 'warning' | 'brand';
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-2 py-2.5 text-center dark:border-gray-800 dark:bg-gray-800/30">
      <Icon className={`mx-auto mb-1 h-4 w-4 ${TONE_CLASSES[tone]}`} />
      {isLoading ? (
        <Skeleton className="mx-auto h-5 w-8" />
      ) : (
        <p className={`text-base font-bold ${TONE_CLASSES[tone]}`}>{value ?? '—'}</p>
      )}
      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
