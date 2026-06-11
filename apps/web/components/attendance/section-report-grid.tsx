'use client';

import { Printer, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { adToBs } from '@/lib/bs-calendar';
import { Button } from '@/components/ui/button';
import type { SectionAttendanceReport } from '@/types/api.types';

const CELL_COLORS: Record<string, string> = {
  P: 'bg-success-100 text-success-700',
  A: 'bg-error-100 text-error-700',
  L: 'bg-yellow-100 text-yellow-700',
  LV: 'bg-blue-100 text-blue-700',
  '-': 'bg-gray-50 text-gray-300',
};

const LEGEND = [
  { key: 'P', label: 'Present' },
  { key: 'A', label: 'Absent' },
  { key: 'L', label: 'Late' },
  { key: 'LV', label: 'Leave' },
] as const;

interface SectionReportGridProps {
  report: SectionAttendanceReport;
}

function escapeCsv(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(report: SectionAttendanceReport) {
  const dateHeaders = report.dates.map((ad) => {
    const bs = adToBs(new Date(ad));
    return `${bs.year}-${bs.month}-${bs.day}`;
  });

  const header = [
    'Roll',
    'Student',
    'Admission No',
    ...dateHeaders,
    'Present',
    'Absent',
    'Late',
    'Leave',
    'Total',
    'Attendance %',
  ];

  const rows = report.students.map((s) => [
    s.rollNumber ?? '',
    s.fullName,
    s.admissionNumber,
    ...report.dates.map((ad) => s.attendance[ad] ?? '-'),
    s.summary.present,
    s.summary.absent,
    s.summary.late,
    s.summary.leave,
    s.summary.total,
    `${s.summary.percent.toFixed(1)}%`,
  ]);

  const csv = [header, ...rows]
    .map((r) => r.map(escapeCsv).join(','))
    .join('\n');

  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const slug = `${report.className}_${report.sectionName}`.replace(/[^\w-]+/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance_${slug}_${report.fromDate.bs}_to_${report.toDate.bs}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SectionReportGrid({ report }: SectionReportGridProps) {
  if (!report.dates.length) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No attendance records found for the selected range.
      </p>
    );
  }

  // Overall attendance = total present marks / total marked-or-expected cells.
  const totals = report.students.reduce(
    (acc, s) => {
      acc.present += s.summary.present;
      acc.total += s.summary.total;
      return acc;
    },
    { present: 0, total: 0 },
  );
  const overallRate = totals.total > 0 ? (totals.present / totals.total) * 100 : 0;

  return (
    <div className="print-area space-y-4 rounded-md border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
      {/* Report header */}
      <div className="flex flex-col gap-3 border-b border-stroke pb-4 dark:border-strokedark sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-black dark:text-white">
            Attendance Report
          </h3>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
            {report.className} &middot; Section {report.sectionName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {report.fromDate.bs} &ndash; {report.toDate.bs} BS
          </p>
        </div>

        <div className="no-print flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCsv(report)}>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            size="sm"
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Students:</span>{' '}
          <span className="font-semibold text-black dark:text-white">{report.students.length}</span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Days:</span>{' '}
          <span className="font-semibold text-black dark:text-white">{report.dates.length}</span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Overall attendance:</span>{' '}
          <span className="font-semibold text-success-600">{overallRate.toFixed(1)}%</span>
        </div>
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto rounded-md border border-stroke dark:border-strokedark">
        <table className="text-xs whitespace-nowrap border-collapse w-full">
          <thead className="bg-gray-2 dark:bg-meta-4">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-2 dark:bg-meta-4 border-b border-r border-stroke dark:border-strokedark px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 min-w-[190px]">
                Student
              </th>
              {report.dates.map((ad) => {
                const bs = adToBs(new Date(ad));
                return (
                  <th
                    key={ad}
                    className="border-b border-r border-stroke dark:border-strokedark px-2 py-2 text-center font-medium text-gray-600 dark:text-gray-300 min-w-[40px]"
                  >
                    <div className="leading-tight">{bs.month}/{bs.day}</div>
                  </th>
                );
              })}
              <th className="border-b border-r border-stroke dark:border-strokedark px-2 py-2 text-center font-medium text-success-600 min-w-[40px]">P</th>
              <th className="border-b border-r border-stroke dark:border-strokedark px-2 py-2 text-center font-medium text-error-600 min-w-[40px]">A</th>
              <th className="border-b border-stroke dark:border-strokedark px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-200 min-w-[52px]">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {report.students.map((student, rowIdx) => (
              <tr
                key={student.studentId}
                className={cn(rowIdx % 2 === 0 ? 'bg-white dark:bg-boxdark' : 'bg-gray-50/40 dark:bg-meta-4/40')}
              >
                <td className="sticky left-0 z-10 border-b border-r border-stroke dark:border-strokedark px-3 py-2 bg-inherit">
                  <div className="flex items-baseline gap-2">
                    <span className="text-gray-400 tabular-nums">{student.rollNumber ?? rowIdx + 1}.</span>
                    <span className="font-medium text-gray-900 dark:text-white">{student.fullName}</span>
                  </div>
                  <div className="text-gray-400 pl-5">{student.admissionNumber}</div>
                </td>
                {report.dates.map((ad) => {
                  const status = student.attendance[ad] ?? '-';
                  return (
                    <td key={ad} className="border-b border-r border-stroke dark:border-strokedark px-1 py-1.5 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-7 h-5 rounded text-xs font-bold',
                          CELL_COLORS[status] ?? CELL_COLORS['-'],
                        )}
                      >
                        {status}
                      </span>
                    </td>
                  );
                })}
                <td className="border-b border-r border-stroke dark:border-strokedark px-2 py-2 text-center font-medium text-success-600">
                  {student.summary.present}
                </td>
                <td className="border-b border-r border-stroke dark:border-strokedark px-2 py-2 text-center font-medium text-error-600">
                  {student.summary.absent}
                </td>
                <td className="border-b border-stroke dark:border-strokedark px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-200">
                  {student.summary.percent.toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="font-medium">Legend:</span>
        {LEGEND.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex h-5 w-7 items-center justify-center rounded text-xs font-bold',
                CELL_COLORS[item.key],
              )}
            >
              {item.key}
            </span>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
