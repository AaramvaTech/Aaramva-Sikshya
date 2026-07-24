'use client';

import Link from 'next/link';
import { ArrowRight, Bell, ClipboardList } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { useStudentAttendanceSummary } from '@/lib/hooks/use-attendance';
import { useStudentLedger } from '@/lib/hooks/use-finance';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';
import { useMyChildrenAssignments } from '@/lib/hooks/use-assignments';
import { useNotices } from '@/lib/hooks/use-communication';
import type { MyChild, MyChildAssignments } from '@/types/api.types';

type ChildAssignmentRow = MyChildAssignments['assignments'][number] & { studentName: string };

/**
 * WEB-P Phase 5 Task 3 — the real parent dashboard, replacing Phase 1's
 * placeholder. This is the FIRST screen in the phase and hosts both required
 * child-switcher modes at once:
 *   1. overview cards, one per child (loops `children` from useSelectedChild)
 *   2. a side-by-side comparison table, one COLUMN per child
 *
 * Why the comparison table lives here instead of its own route: comparing
 * children is a "glance at everyone at once" view built from the exact same
 * attendance/fee data the overview cards already show — it isn't a distinct
 * workflow with its own actions the way Attendance or Fees are, so giving it
 * a dedicated nav entry would just fragment one data set across two pages
 * and add a nav item for what is fundamentally a dashboard sub-section.
 *
 * Async-gate note: `academicYearId` is derived from useCurrentAcademicYear()
 * and passed down as `currentYear?.id ?? ''`. Every per-child attendance/
 * ledger hook below is already `enabled: !!studentId && !!academicYearId`
 * -gated at the hook level (confirmed in use-attendance.ts/use-finance.ts),
 * so an empty academicYearId never fires a request — it just renders '—'
 * until the year resolves. `yearLoading` is threaded through in addition so
 * that brief window renders a skeleton instead of a premature '—'.
 */
export default function ParentDashboardPage() {
  const {
    children,
    isLoading: childrenLoading,
    isError: childrenError,
    setSelectedChild,
  } = useSelectedChild();

  const { data: currentYear, isLoading: yearLoading } = useCurrentAcademicYear();
  const academicYearId = currentYear?.id ?? '';

  const {
    data: assignmentsByChild,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
    refetch: refetchAssignments,
  } = useMyChildrenAssignments();

  const {
    data: noticesData,
    isLoading: noticesLoading,
    isError: noticesError,
    refetch: refetchNotices,
  } = useNotices({ page: 1, limit: 3 });

  // Flatten every child's assignments into one list, tagging each row with
  // whose it is, then filter to "not yet submitted and actually postable"
  // (submission === null && status === 'PUBLISHED' — DRAFT/CLOSED never
  // belong in an "upcoming" widget), soonest-due-first, capped at 5.
  const upcomingAssignments: ChildAssignmentRow[] = (assignmentsByChild ?? [])
    .flatMap((c) => c.assignments.map((a) => ({ ...a, studentName: c.studentName })))
    .filter((a) => a.submission === null && a.status === 'PUBLISHED')
    .slice()
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  const notices = noticesData?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Children"
        description="An overview of each child, and how they compare side by side"
      />

      {/* ── Per-child overview cards ─────────────────────────────────────── */}
      {childrenLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : childrenError ? (
        <QueryErrorState message="Couldn't load your children." />
      ) : children.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No children are linked to your account yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <ChildOverviewCard
              key={child.id}
              child={child}
              academicYearId={academicYearId}
              yearLoading={yearLoading}
              onSelect={setSelectedChild}
            />
          ))}
        </div>
      )}

      {/* ── Side-by-side comparison ──────────────────────────────────────── */}
      {children.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-white">Compare</h3>
          <p className="mb-4 text-theme-xs text-gray-500 dark:text-gray-400">
            Attendance and fee balance, side by side across all your children
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2 pr-4 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Metric
                  </th>
                  {children.map((c) => (
                    <th
                      key={c.id}
                      className="py-2 px-4 text-xs font-medium text-gray-800 dark:text-white"
                    >
                      {c.firstName} {c.lastName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="py-3 pr-4 text-gray-500 dark:text-gray-400">Attendance</td>
                  {children.map((c) => (
                    <ComparisonAttendanceCell
                      key={c.id}
                      studentId={c.id}
                      academicYearId={academicYearId}
                    />
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-gray-500 dark:text-gray-400">Fee Balance</td>
                  {children.map((c) => (
                    <ComparisonFeeCell
                      key={c.id}
                      studentId={c.id}
                      academicYearId={academicYearId}
                    />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Upcoming assignments across all children ─────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-white">
          Upcoming Assignments
        </h3>
        <p className="mb-4 text-theme-xs text-gray-500 dark:text-gray-400">
          Homework not yet submitted, across all your children
        </p>
        {assignmentsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : assignmentsError ? (
          <QueryErrorState onRetry={() => refetchAssignments()} message="Couldn't load assignments." />
        ) : upcomingAssignments.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            Nothing outstanding — everyone&apos;s caught up.
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingAssignments.map((a) => (
              <ChildAssignmentRowView key={`${a.id}-${a.studentName}`} assignment={a} />
            ))}
          </div>
        )}
      </div>

      {/* ── Recent notices ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-white">Recent Notices</h3>
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

// ─── Per-child overview card ──────────────────────────────────────────────

function ChildOverviewCard({
  child,
  academicYearId,
  yearLoading,
  onSelect,
}: {
  child: MyChild;
  academicYearId: string;
  yearLoading: boolean;
  onSelect: (id: string) => void;
}) {
  const { data: attendance, isLoading: attendanceLoading } = useStudentAttendanceSummary(
    child.id,
    academicYearId || undefined,
  );
  const { data: ledger, isLoading: ledgerLoading } = useStudentLedger(child.id, academicYearId);

  const attendancePercent = attendance?.attendancePercent ?? null;
  const balance = ledger?.summary?.totalBalance ?? null;
  const showAttendanceSkeleton = yearLoading || attendanceLoading;
  const showFeeSkeleton = yearLoading || ledgerLoading;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400">
          {child.firstName[0]}
          {child.lastName[0]}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-gray-800 dark:text-white">
            {child.firstName} {child.lastName}
          </p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {child.currentEnrollment
              ? `${child.currentEnrollment.className} ${child.currentEnrollment.sectionName}`
              : 'Not currently enrolled'}
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/30">
          <p className="text-[10px] uppercase text-gray-500 dark:text-gray-400">Attendance</p>
          {showAttendanceSkeleton ? (
            <Skeleton className="mt-1 h-5 w-12" />
          ) : (
            <p className="text-base font-bold text-gray-900 dark:text-white">
              {attendancePercent !== null ? `${attendancePercent}%` : '—'}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/30">
          <p className="text-[10px] uppercase text-gray-500 dark:text-gray-400">Fee Balance</p>
          {showFeeSkeleton ? (
            <Skeleton className="mt-1 h-5 w-16" />
          ) : balance !== null ? (
            <AmountDisplay amount={balance} className="text-base font-bold" />
          ) : (
            <p className="text-base font-bold text-gray-900 dark:text-white">—</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-gray-100 pt-3 dark:border-gray-800">
        <Link
          href="/parent/attendance"
          onClick={() => onSelect(child.id)}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Attendance <ArrowRight className="h-3 w-3" />
        </Link>
        <Link
          href="/parent/fees"
          onClick={() => onSelect(child.id)}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Fees <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

// ─── Comparison table cells ───────────────────────────────────────────────
// Deliberately separate fetches from ChildOverviewCard's, rather than a
// shared prop/context — same queryKey (studentId + academicYearId) means
// TanStack Query dedupes the network call and both consumers share one
// cache entry, so there's no extra request, just a second render target.

function ComparisonAttendanceCell({
  studentId,
  academicYearId,
}: {
  studentId: string;
  academicYearId: string;
}) {
  const { data, isLoading } = useStudentAttendanceSummary(studentId, academicYearId || undefined);
  return (
    <td className="py-3 px-4 font-medium text-gray-800 dark:text-white">
      {isLoading ? (
        <Skeleton className="h-4 w-10" />
      ) : data ? (
        `${data.attendancePercent}%`
      ) : (
        '—'
      )}
    </td>
  );
}

function ComparisonFeeCell({
  studentId,
  academicYearId,
}: {
  studentId: string;
  academicYearId: string;
}) {
  const { data, isLoading } = useStudentLedger(studentId, academicYearId);
  const balance = data?.summary?.totalBalance ?? null;
  return (
    <td className="py-3 px-4 font-medium text-gray-800 dark:text-white">
      {isLoading ? <Skeleton className="h-4 w-16" /> : balance !== null ? <AmountDisplay amount={balance} /> : '—'}
    </td>
  );
}

// ─── Upcoming assignment row ──────────────────────────────────────────────

function isPastDue(dueDate: string): boolean {
  return new Date(dueDate).getTime() < Date.now();
}

function ChildAssignmentRowView({ assignment: a }: { assignment: ChildAssignmentRow }) {
  const badge = a.status === 'CLOSED'
    ? { label: 'Closed', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' }
    : isPastDue(a.dueDate)
      ? { label: 'Overdue', className: 'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400' }
      : { label: 'Open', className: 'bg-brand-50 text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-400' };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12]">
        <ClipboardList className="h-5 w-5 text-brand-500 dark:text-brand-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-white">{a.title}</p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {a.studentName} · {a.subjectName ?? 'Subject'} · {a.className ?? 'Class'}
        </p>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
        <span className="text-xs text-gray-400">
          Due <BsDate date={a.dueDate} />
        </span>
      </div>
    </div>
  );
}
