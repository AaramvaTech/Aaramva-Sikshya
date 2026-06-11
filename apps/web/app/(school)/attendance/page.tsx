'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ClipboardCheck, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { BsDate } from '@/components/shared/bs-date';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useClasses } from '@/lib/hooks/use-students';
import { useSchoolAttendanceSummary } from '@/lib/hooks/use-attendance';

const ALL = 'all';

function rateColor(rate: number): string {
  if (rate >= 90) return 'bg-success-50 text-success-700 ring-green-200';
  if (rate >= 75) return 'bg-yellow-50 text-yellow-700 ring-yellow-200';
  return 'bg-error-50 text-error-700 ring-red-200';
}

export default function AttendancePage() {
  const router = useRouter();
  const [classId, setClassId] = useState(ALL);
  const [sectionId, setSectionId] = useState(ALL);

  const { data: classes } = useClasses();
  const { data: summary, isLoading: summaryLoading } = useSchoolAttendanceSummary();

  const today = new Date().toISOString().split('T')[0];

  const selectedClass = classes?.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];

  // Filter the section-level breakdown by the chosen grade + section.
  const rows = useMemo(() => {
    const all = summary?.bySection ?? [];
    return all.filter(
      (r) =>
        (classId === ALL || r.classId === classId) &&
        (sectionId === ALL || r.sectionId === sectionId),
    );
  }, [summary, classId, sectionId]);

  // Stat cards recompute from the filtered rows so they always match the table.
  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
    rows.forEach((r) => {
      t.present += r.present;
      t.absent += r.absent;
      t.late += r.late;
      t.leave += r.leave;
      t.total += r.total;
    });
    const notMarked = t.total - (t.present + t.absent + t.late + t.leave);
    return { ...t, notMarked: notMarked > 0 ? notMarked : 0 };
  }, [rows]);

  const isFiltered = classId !== ALL || sectionId !== ALL;

  const stats = [
    { label: 'Present', value: totals.present, color: 'text-success-600' },
    { label: 'Absent', value: totals.absent, color: 'text-error-600' },
    { label: 'Late', value: totals.late, color: 'text-yellow-600' },
    { label: 'Leave', value: totals.leave, color: 'text-blue-600' },
    { label: 'Not Marked', value: totals.notMarked, color: 'text-gray-500' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Today's attendance overview across all classes"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/attendance/reports')}
            >
              View Reports
            </Button>
            <Button
              size="sm"
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={() => router.push('/attendance/mark')}
            >
              <ClipboardCheck className="mr-1.5 h-4 w-4" />
              Mark Attendance
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Grade
              </label>
              <Select
                value={classId}
                onValueChange={(v) => {
                  if (!v) return;
                  setClassId(v);
                  setSectionId(ALL);
                }}
              >
                <SelectTrigger className="w-48">
                  <span className={classId === ALL ? 'text-muted-foreground' : ''}>
                    {classId === ALL
                      ? 'All Grades'
                      : (classes?.find((c) => c.id === classId)?.name ?? 'Loading…')}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Grades</SelectItem>
                  {classes?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Section
              </label>
              <Select
                value={sectionId}
                onValueChange={(v) => {
                  if (v) setSectionId(v);
                }}
                disabled={classId === ALL}
              >
                <SelectTrigger className="w-40">
                  <span className={sectionId === ALL ? 'text-muted-foreground' : ''}>
                    {sectionId === ALL
                      ? 'All Sections'
                      : (sections.find((s) => s.id === sectionId)?.name ?? 'Loading…')}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Sections</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-500"
                onClick={() => {
                  setClassId(ALL);
                  setSectionId(ALL);
                }}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300">
            <CalendarDays className="h-4 w-4 text-brand-500" />
            <BsDate date={today} showAd />
          </div>
        </div>
      </div>

      {/* Stat cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-sm" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {stats.map((item) => (
            <div
              key={item.label}
              className="rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-5"
            >
              <div className={`text-3xl font-bold ${item.color}`}>{item.value}</div>
              <div className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section breakdown table */}
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-black dark:text-white">
            {isFiltered ? 'Filtered Breakdown' : 'Class & Section Breakdown'}
          </h2>
          <span className="text-xs text-gray-400">Click a row to mark attendance</span>
        </div>

        {summaryLoading ? (
          <Skeleton className="h-40 rounded-sm" />
        ) : rows.length === 0 ? (
          <div className="rounded-sm border border-dashed border-stroke px-4 py-10 text-center text-sm text-gray-500 dark:border-strokedark">
            No attendance data for this selection.
          </div>
        ) : (
          <div className="overflow-hidden rounded-sm border border-stroke dark:border-strokedark">
            <table className="w-full text-sm">
              <thead className="bg-gray-2 text-left dark:bg-meta-4">
                <tr>
                  <th className="px-4 py-3 font-medium text-black dark:text-white">Class</th>
                  <th className="px-4 py-3 font-medium text-black dark:text-white">Section</th>
                  <th className="px-4 py-3 text-right font-medium text-success-600">Present</th>
                  <th className="px-4 py-3 text-right font-medium text-error-600">Absent</th>
                  <th className="px-4 py-3 text-right font-medium text-yellow-600">Late</th>
                  <th className="px-4 py-3 text-right font-medium text-blue-600">Leave</th>
                  <th className="px-4 py-3 text-right font-medium text-black dark:text-white">Total</th>
                  <th className="px-4 py-3 text-right font-medium text-black dark:text-white">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke dark:divide-strokedark">
                {rows.map((row) => (
                  <tr
                    key={row.sectionId}
                    role="link"
                    tabIndex={0}
                    title={`Mark attendance for ${row.className} / Section ${row.sectionName}`}
                    onClick={() =>
                      router.push(`/attendance/mark?sectionId=${row.sectionId}&date=${today}`)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/attendance/mark?sectionId=${row.sectionId}&date=${today}`);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-brand-50 focus:bg-brand-50 focus:outline-none dark:hover:bg-meta-4 dark:focus:bg-meta-4"
                  >
                    <td className="px-4 py-3 font-medium text-black dark:text-white">
                      {row.className}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      Section {row.sectionName}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-success-600">
                      {row.present}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-error-600">
                      {row.absent}
                    </td>
                    <td className="px-4 py-3 text-right text-yellow-600">{row.late}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{row.leave}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{row.total}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${rateColor(row.rate)}`}
                      >
                        {row.rate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
