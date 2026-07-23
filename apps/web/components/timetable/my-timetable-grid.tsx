import { Clock } from 'lucide-react';
import type { TeacherTimetable } from '@/types/api.types';

/**
 * WEB-P Phase 3 Task 3 — read-only weekly grid for a teacher's OWN
 * timetable (`GET /timetable/my`, self-scoped from the JWT — see
 * docs/web/phase-3-ownership-findings.md).
 *
 * Deliberately NOT a reuse of `components/academic/timetable-grid.tsx` —
 * that component is the admin's per-SECTION editable grid (`SectionTimetable`
 * shape: one section, many teachers, add/delete-slot dialogs + mutations).
 * This screen is per-TEACHER (one teacher, many sections) and strictly
 * read-only, so it's a new small component built around `TeacherTimetable`'s
 * actual shape. It copies that component's layout conventions (the DAYS
 * array, the `<table>` with a Period column + one column per day, the
 * `overflow-x-auto rounded-lg border bg-white` wrapper) for visual
 * consistency, and reuses the dashboard's slot-card information set
 * (subject, className + section, room, time) condensed into a grid cell.
 */

// Sunday–Friday only. Saturday ("6") is never rendered — no school that
// day, so an always-empty column would be pure noise.
const DAYS = [
  { key: '0', label: 'SUN' },
  { key: '1', label: 'MON' },
  { key: '2', label: 'TUE' },
  { key: '3', label: 'WED' },
  { key: '4', label: 'THU' },
  { key: '5', label: 'FRI' },
];

interface MyTimetableGridProps {
  timetable: TeacherTimetable;
}

export function MyTimetableGrid({ timetable }: MyTimetableGridProps) {
  // Collect the distinct period numbers actually present across Sun–Fri —
  // there's no fixed period count like the admin grid's DEFAULT_PERIODS;
  // teachers may have gaps, so we only render rows that exist in the data.
  const periodSet = new Set<number>();
  DAYS.forEach(({ key }) => {
    (timetable.schedule[key] ?? []).forEach((slot) => periodSet.add(slot.periodNumber));
  });
  const periods = Array.from(periodSet).sort((a, b) => a - b);

  const slotMap = new Map<string, (typeof timetable.schedule)[string][number]>();
  DAYS.forEach(({ key }) => {
    (timetable.schedule[key] ?? []).forEach((slot) => {
      slotMap.set(`${slot.periodNumber}-${key}`, slot);
    });
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50">
            <th className="w-20 border-r border-gray-200 px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
              Period
            </th>
            {DAYS.map((day) => (
              <th
                key={day.key}
                className="min-w-[150px] px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                {day.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {periods.map((period) => (
            <tr key={period} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
              <td className="border-r border-gray-200 px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                P{period}
              </td>
              {DAYS.map((day) => {
                const slot = slotMap.get(`${period}-${day.key}`);
                return (
                  <td key={day.key} className="px-2 py-2 text-center align-top">
                    {slot ? (
                      <div className="w-full rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-left dark:border-brand-500/20 dark:bg-brand-500/[0.08]">
                        <p className="truncate text-xs font-semibold text-brand-600 dark:text-brand-400">
                          {slot.subject.name}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {slot.className} {slot.section}
                          {slot.room ? ` · ${slot.room}` : ''}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                          <Clock className="h-3 w-3" />
                          {slot.startTime} – {slot.endTime}
                        </p>
                      </div>
                    ) : (
                      <div className="h-12 w-full rounded-md border border-dashed border-gray-200 dark:border-gray-800" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
