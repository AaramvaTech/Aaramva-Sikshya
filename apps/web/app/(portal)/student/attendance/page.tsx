'use client';

import { useMemo, useState } from 'react';
import { CalendarCheck2, ChevronLeft, ChevronRight } from 'lucide-react';
import { todayBs, bsToAd, daysInBsMonth, BS_MONTH_NAMES_EN } from 'bs-calendar';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMyAttendanceSummary, useMyAttendanceHistory } from '@/lib/hooks/use-student-me';

/**
 * WEB-P Phase 4 Task 5 — student's own BS-month attendance calendar, desktop.
 *
 * TZ correction (do not "fix" this back to .toISOString()): `bsToAd()`
 * returns a `Date` built from local (year, month, day) components. Turning
 * that back into a "YYYY-MM-DD" wire string MUST read those same local
 * components — never `.toISOString().split('T')[0]`, which converts to UTC
 * first and silently shifts the date backward by one day for any caller in
 * a UTC+ timezone (this dev machine runs Asia/Kathmandu, UTC+5:45; e.g.
 * `new Date(2026,6,17,0,0,0).toISOString()` → `"2026-07-16T18:15:00.000Z"`,
 * one day EARLY). `BsDateInput`'s `fireChange()` has exactly this bug — a
 * real, pre-existing issue in already-shipped code, out of scope to fix
 * there, but it must not be copied into this new screen. Mirrors the
 * backend's already-fixed rule: `formatLocalDate()` in
 * `apps/api/src/modules/common/utils/date.util.ts` (see CLAUDE.md's FIX-2).
 */
function formatLocalDateAd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Design decision (per task brief — record it, don't silently invent a
// second formula): the backend's official `attendancePercent` in
// `MyAttendanceSummary` is computed over the whole CURRENT ACADEMIC YEAR's
// working-day set, not a single BS month. It is shown below exactly as
// returned, in one stat card, never recomputed. The visible month's
// grid + summary strip show only raw status COUNTS tallied client-side from
// the fetched day rows — never a percentage, which would use a different
// (month-only) denominator and could visibly disagree with the official
// year-to-date figure.

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type StatusKey = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';

// Same semantic families StatusBadge already uses (components/shared/status-badge.tsx),
// reused here as a cell BACKGROUND FILL instead of a pill — do not invent new colors.
const STATUS_CELL_STYLES: Record<StatusKey, { bg: string; text: string; dot: string }> = {
  PRESENT: {
    bg: 'bg-success-50 dark:bg-success-500/[0.12]',
    text: 'text-success-700 dark:text-success-400',
    dot: 'bg-success-500',
  },
  ABSENT: {
    bg: 'bg-error-50 dark:bg-error-500/[0.12]',
    text: 'text-error-700 dark:text-error-400',
    dot: 'bg-error-500',
  },
  LATE: {
    bg: 'bg-warning-50 dark:bg-warning-500/[0.12]',
    text: 'text-warning-700 dark:text-warning-400',
    dot: 'bg-warning-500',
  },
  LEAVE: {
    bg: 'bg-brand-50 dark:bg-brand-500/[0.12]',
    text: 'text-brand-700 dark:text-brand-400',
    dot: 'bg-brand-500',
  },
};

const LEGEND_ITEMS: { status: StatusKey; label: string }[] = [
  { status: 'PRESENT', label: 'Present' },
  { status: 'ABSENT', label: 'Absent' },
  { status: 'LATE', label: 'Late' },
  { status: 'LEAVE', label: 'Leave' },
];

interface GridCell {
  day: number;
  dateAd: string;
  isSaturday: boolean;
  isToday: boolean;
}

function CountTile({
  label,
  value,
  textClass,
  isLoading,
}: {
  label: string;
  value: number;
  textClass: string;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5 text-center dark:border-gray-800 dark:bg-gray-800/30">
      {isLoading ? (
        <Skeleton className="mx-auto h-6 w-8" />
      ) : (
        <p className={cn('text-lg font-bold', textClass)}>{value}</p>
      )}
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

export default function StudentAttendancePage() {
  const today = todayBs();
  const [view, setView] = useState<{ year: number; month: number }>({
    year: today.year,
    month: today.month,
  });

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useMyAttendanceSummary();

  // Fetch range for the visible BS month — converted to AD once per month
  // via the codebase's real bsToAd(), then formatted with the TZ-safe
  // helper above (not toISOString()).
  const monthInfo = useMemo(() => {
    const daysInMonth = daysInBsMonth(view.year, view.month);
    const firstAd = bsToAd({ year: view.year, month: view.month, day: 1 });
    const lastAd = bsToAd({ year: view.year, month: view.month, day: daysInMonth });
    return {
      daysInMonth,
      weekdayOfFirst: firstAd.getDay(), // 0 = Sun … 6 = Sat, matches DAY_HEADERS
      fromDate: formatLocalDateAd(firstAd),
      toDate: formatLocalDateAd(lastAd),
    };
  }, [view.year, view.month]);

  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useMyAttendanceHistory({ fromDate: monthInfo.fromDate, toDate: monthInfo.toDate });

  const historyMap = useMemo(() => {
    const map = new Map<string, string>();
    (history ?? []).forEach((row) => map.set(row.dateAd, row.status));
    return map;
  }, [history]);

  // Raw counts for the VISIBLE MONTH ONLY — plain tallies of the fetched
  // day rows. Deliberately not a percentage; see the design-decision note above.
  const monthCounts = useMemo(() => {
    const counts: Record<StatusKey, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
    (history ?? []).forEach((row) => {
      if (row.status in counts) counts[row.status as StatusKey] += 1;
    });
    return counts;
  }, [history]);

  const cells = useMemo<(GridCell | null)[]>(() => {
    const result: (GridCell | null)[] = [];
    for (let i = 0; i < monthInfo.weekdayOfFirst; i++) result.push(null);
    for (let day = 1; day <= monthInfo.daysInMonth; day++) {
      const columnIndex = (monthInfo.weekdayOfFirst + day - 1) % 7;
      const dateAd = formatLocalDateAd(bsToAd({ year: view.year, month: view.month, day }));
      result.push({
        day,
        dateAd,
        isSaturday: columnIndex === 6,
        isToday: today.year === view.year && today.month === view.month && today.day === day,
      });
    }
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [monthInfo.weekdayOfFirst, monthInfo.daysInMonth, view.year, view.month, today.year, today.month, today.day]);

  function goToMonth(direction: -1 | 1) {
    setView((prev) => {
      let month = prev.month + direction;
      let year = prev.year;
      if (month < 1) {
        month = 12;
        year -= 1;
      } else if (month > 12) {
        month = 1;
        year += 1;
      }
      return { year, month };
    });
  }

  function goToToday() {
    setView({ year: today.year, month: today.month });
  }

  const isCurrentMonth = view.year === today.year && view.month === today.month;
  const monthLabel = `${BS_MONTH_NAMES_EN[view.month - 1]} ${view.year}`;

  return (
    <div className="space-y-5">
      <PageHeader title="My Attendance" description="Your attendance record, by Bikram Sambat month" />

      {/* Year-to-date stat card — sourced directly from the backend's official
          figure, never client-recomputed. Stays full-width and first: the
          headline number deserves top billing regardless of viewport. */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        {summaryError ? (
          <QueryErrorState onRetry={() => refetchSummary()} message="Couldn't load your attendance summary." />
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/[0.12]">
                <CalendarCheck2 className="h-7 w-7 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                  Year-to-date attendance
                  {summary?.academicYearName ? ` · ${summary.academicYearName}` : ''}
                </p>
                {summaryLoading ? (
                  <Skeleton className="mt-1 h-9 w-24" />
                ) : (
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {summary ? `${summary.attendancePercent}%` : '—'}
                  </p>
                )}
              </div>
            </div>
            {!summaryLoading && summary && (
              <div className="grid grid-cols-4 gap-3">
                <CountTile
                  label="Present"
                  value={summary.present}
                  textClass="text-success-700 dark:text-success-400"
                  isLoading={false}
                />
                <CountTile
                  label="Absent"
                  value={summary.absent}
                  textClass="text-error-700 dark:text-error-400"
                  isLoading={false}
                />
                <CountTile
                  label="Late"
                  value={summary.late}
                  textClass="text-warning-700 dark:text-warning-400"
                  isLoading={false}
                />
                <CountTile
                  label="Leave"
                  value={summary.leave}
                  textClass="text-brand-700 dark:text-brand-400"
                  isLoading={false}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* WEB-P timetable UX pass (2026-07-24, see docs/superpowers/specs/
          2026-07-24-timetable-ux-design.md §3): calendar + its month nav
          live in a width-capped left column so day cells never scale with
          the full page width; the freed space on wide screens holds the
          monthly summary strip instead of sitting empty. Stacks to one
          column below xl:. Mirrors the parent attendance page's identical
          fix (docs/superpowers/specs/2026-07-24-portal-shell-sidebar-
          design.md §5.1) — student has no leave-request form to pair with
          the calendar, so the summary strip fills that role instead. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,560px)_1fr] xl:items-start">
        <div className="mx-auto w-full max-w-[560px] space-y-5 xl:mx-0">
          {/* Month nav */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" onClick={() => goToMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="w-40 text-center text-base font-semibold text-gray-900 dark:text-white sm:w-48 sm:text-lg">
                {monthLabel}
              </p>
              <Button variant="outline" size="icon-sm" onClick={() => goToMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={goToToday} disabled={isCurrentMonth}>
              Today
            </Button>
          </div>

          {/* Calendar grid */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
            {historyError ? (
              <QueryErrorState onRetry={() => refetchHistory()} message="Couldn't load this month's attendance." />
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {DAY_HEADERS.map((label, i) => (
                    <div
                      key={label}
                      className={cn(
                        'py-1 text-center text-xs font-semibold uppercase tracking-wide',
                        i === 6 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500',
                      )}
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
                  {historyLoading
                    ? Array.from({ length: 35 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-square w-full rounded-lg" />
                      ))
                    : cells.map((cell, idx) => {
                        if (!cell) return <div key={`blank-${idx}`} aria-hidden />;
                        const status = historyMap.get(cell.dateAd);
                        const style = status && status in STATUS_CELL_STYLES ? STATUS_CELL_STYLES[status as StatusKey] : undefined;
                        return (
                          <div
                            key={cell.dateAd}
                            title={cell.dateAd}
                            className={cn(
                              'flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg text-sm font-semibold',
                              // A real recorded status always wins. Saturday's amber/muted
                              // background is only the fallback for a Saturday cell with no
                              // recorded status (the common case, since Saturday is normally
                              // a non-school day) — mirrors mobile's AttendanceCalendar
                              // precedence (`cfg ? cfg.bg : isSat ? SATURDAY_HIGHLIGHT.bg : ...`).
                              style
                                ? cn(style.bg, style.text)
                                : cell.isSaturday
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/[0.08] dark:text-amber-400'
                                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
                              cell.isToday && 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-gray-900',
                            )}
                          >
                            <span>{cell.day}</span>
                            {style && <span className={cn('h-1 w-1 rounded-full', style.dot)} />}
                          </div>
                        );
                      })}
                </div>

                {/* Legend */}
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                  {LEGEND_ITEMS.map(({ status, label }) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_CELL_STYLES[status].dot)} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 dark:bg-amber-500/70" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Saturday (non-school day)</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {/* Raw-counts summary strip for the visible month — plain tallies from
              the fetched day rows, no percentage claim here (see design-decision
              note above). */}
          {!historyError && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="mb-3 text-theme-sm font-medium text-gray-700 dark:text-gray-300">{monthLabel} summary</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountTile
                  label="Present"
                  value={monthCounts.PRESENT}
                  textClass="text-success-700 dark:text-success-400"
                  isLoading={historyLoading}
                />
                <CountTile
                  label="Absent"
                  value={monthCounts.ABSENT}
                  textClass="text-error-700 dark:text-error-400"
                  isLoading={historyLoading}
                />
                <CountTile
                  label="Late"
                  value={monthCounts.LATE}
                  textClass="text-warning-700 dark:text-warning-400"
                  isLoading={historyLoading}
                />
                <CountTile
                  label="Leave"
                  value={monthCounts.LEAVE}
                  textClass="text-brand-700 dark:text-brand-400"
                  isLoading={historyLoading}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
