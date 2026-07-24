'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { subjectColor } from '@/lib/subjects';

/**
 * Shared weekly timetable grid for the student/parent/teacher portal
 * (WEB-P timetable UX pass — see docs/superpowers/specs/2026-07-24-
 * timetable-ux-design.md). Deliberately knows nothing about the backend's
 * TimetableSlot/TeacherSlotItem shapes — each page normalizes its own data
 * into NormalizedTimetableSlot before rendering, so this component is the
 * ONE place subject-color/today/now logic lives instead of three
 * near-duplicate copies (retiring my-timetable-grid.tsx and the inline
 * tables on the student/parent pages).
 */

export interface NormalizedTimetableSlot {
  slotId: string;
  periodNumber: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  subjectId: string;
  subjectName: string;
  subtitle: string;
  room: string | null;
}

export interface TimetableGridProps {
  schedule: Record<string, NormalizedTimetableSlot[]>;
}

// Sunday-Friday only, matching every existing timetable page's convention —
// Saturday ("6") is never rendered, since it's never a school day here.
const DAYS = [
  { key: '0', label: 'SUN' },
  { key: '1', label: 'MON' },
  { key: '2', label: 'TUE' },
  { key: '3', label: 'WED' },
  { key: '4', label: 'THU' },
  { key: '5', label: 'FRI' },
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function TimetableGrid({ schedule }: TimetableGridProps) {
  // Refreshed every 60s so the "now" ring doesn't go stale on a page left
  // open across a period change — no need for finer precision than that.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayKey = String(now.getDay());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Distinct period numbers actually present across Sun-Fri — no fixed
  // period count, only rows that exist in the data render.
  const periodSet = new Set<number>();
  DAYS.forEach(({ key }) => {
    (schedule[key] ?? []).forEach((slot) => periodSet.add(slot.periodNumber));
  });
  const periods = Array.from(periodSet).sort((a, b) => a - b);

  const slotMap = new Map<string, NormalizedTimetableSlot>();
  DAYS.forEach(({ key }) => {
    (schedule[key] ?? []).forEach((slot) => {
      slotMap.set(`${slot.periodNumber}-${key}`, slot);
    });
  });

  // Each period's canonical time range, derived from the first slot found
  // for that period number on any day — periods only ever appear in
  // `periods` when at least one real slot references them.
  function periodTimeRange(period: number): string {
    for (const day of DAYS) {
      const match = (schedule[day.key] ?? []).find((s) => s.periodNumber === period);
      if (match) return `${match.startTime}–${match.endTime}`;
    }
    return '';
  }

  function isNowSlot(dayKey: string, slot: NormalizedTimetableSlot): boolean {
    return (
      dayKey === todayKey &&
      nowMinutes >= toMinutes(slot.startTime) &&
      nowMinutes < toMinutes(slot.endTime)
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="w-24 border-r border-gray-200 px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                Period
              </th>
              {DAYS.map((day) => {
                const isToday = day.key === todayKey;
                return (
                  <th
                    key={day.key}
                    className={cn(
                      'min-w-[150px] px-3 py-2.5 text-center text-xs font-medium',
                      isToday
                        ? 'font-semibold text-brand-600 dark:text-brand-400'
                        : 'text-gray-500 dark:text-gray-400',
                    )}
                  >
                    {day.label}
                    {isToday && (
                      <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle" />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {periods.map((period) => (
              <tr key={period} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                <td className="border-r border-gray-200 px-3 py-2.5 text-center align-top dark:border-gray-800">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">P{period}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{periodTimeRange(period)}</p>
                </td>
                {DAYS.map((day) => {
                  const slot = slotMap.get(`${period}-${day.key}`);
                  const isToday = day.key === todayKey;
                  if (!slot) {
                    return (
                      <td key={day.key} className="px-2 py-2 text-center align-top">
                        <div
                          className={cn(
                            'h-12 w-full rounded-md border border-dashed border-gray-200 dark:border-gray-800',
                            isToday && 'bg-brand-50/40 dark:bg-brand-500/[0.04]',
                          )}
                        />
                      </td>
                    );
                  }
                  const style = subjectColor(slot.subjectId);
                  const isNow = isNowSlot(day.key, slot);
                  return (
                    <td key={day.key} className="px-2 py-2 text-center align-top">
                      <div
                        className={cn(
                          'relative w-full rounded-md border-l-4 px-2 py-1.5 text-left',
                          style.bg,
                          style.border,
                          isNow && 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-gray-900',
                        )}
                      >
                        {isNow && (
                          <span className="absolute -top-2 right-1 rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                            Now
                          </span>
                        )}
                        <p className={cn('truncate text-xs font-semibold', style.text)}>{slot.subjectName}</p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {slot.subtitle}
                          {slot.room ? ` · ${slot.room}` : ''}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                          <Clock className="h-3 w-3" />
                          {slot.startTime} – {slot.endTime}
                        </p>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Today&apos;s column is highlighted · a ring marks the period happening right now
      </p>
    </div>
  );
}
