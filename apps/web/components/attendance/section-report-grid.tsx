'use client';

import { cn } from '@/lib/utils';
import { adToBs } from '@/lib/bs-calendar';
import type { SectionAttendanceReport } from '@/types/api.types';

const CELL_COLORS: Record<string, string> = {
  P: 'bg-success-100 text-success-700',
  A: 'bg-error-100 text-error-700',
  L: 'bg-yellow-100 text-yellow-700',
  LV: 'bg-blue-100 text-blue-700',
  '-': 'bg-gray-50 text-gray-300',
};

interface SectionReportGridProps {
  report: SectionAttendanceReport;
}

export function SectionReportGrid({ report }: SectionReportGridProps) {
  if (!report.dates.length) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No attendance records found for the selected range.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="text-xs whitespace-nowrap border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 border-b border-r px-3 py-2 text-left font-medium text-gray-600 min-w-[180px]">
              Student
            </th>
            {report.dates.map((ad) => {
              const bs = adToBs(new Date(ad));
              return (
                <th
                  key={ad}
                  className="border-b border-r px-2 py-2 text-center font-medium text-gray-600 min-w-[44px]"
                >
                  <div className="leading-tight">{bs.month}/{bs.day}</div>
                </th>
              );
            })}
            <th className="border-b px-3 py-2 text-center font-semibold text-gray-700 min-w-[52px]">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {report.students.map((student, rowIdx) => (
            <tr
              key={student.studentId}
              className={cn('hover:bg-blue-50/30', rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30')}
            >
              <td className="sticky left-0 z-10 border-b border-r px-3 py-2 bg-inherit">
                <div className="font-medium text-gray-900">{student.fullName}</div>
                <div className="text-gray-400">{student.admissionNumber}</div>
              </td>
              {report.dates.map((ad) => {
                const status = student.attendance[ad] ?? '-';
                return (
                  <td key={ad} className="border-b border-r px-1 py-1.5 text-center">
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
              <td className="border-b px-3 py-2 text-center font-semibold text-gray-700">
                {student.summary.percent.toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
