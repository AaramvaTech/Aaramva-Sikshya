'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useClasses } from '@/lib/hooks/use-students';
import { useSchoolAttendanceSummary } from '@/lib/hooks/use-attendance';

export default function AttendancePage() {
  const router = useRouter();
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');

  const { data: classes } = useClasses();
  const { data: summary, isLoading: summaryLoading } = useSchoolAttendanceSummary();

  const selectedClass = classes?.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];

  const today = new Date().toISOString().split('T')[0];

  function handleMarkAttendance() {
    if (!sectionId) return;
    router.push(`/attendance/mark?sectionId=${sectionId}&date=${today}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Mark and review daily attendance"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/attendance/reports')}
          >
            View Reports
          </Button>
        }
      />

      {/* Class + Section selector */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
          <h4 className="text-xl font-semibold text-black dark:text-white">Mark Today&apos;s Attendance</h4>
        </div>
        <div className="p-4 sm:p-6 xl:p-7.5">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Class</label>
              <Select
                value={classId}
                onValueChange={(v) => {
                  if (!v) return;
                  setClassId(v);
                  setSectionId('');
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Section</label>
              <Select value={sectionId} onValueChange={(v) => { if (v) setSectionId(v); }} disabled={!classId}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleMarkAttendance}
              disabled={!sectionId}
            >
              Mark Attendance
            </Button>
          </div>
        </div>
      </div>

      {/* School-wide summary */}
      <div>
        <h2 className="text-sm font-semibold text-black dark:text-white mb-3">
          Today&apos;s School Summary
        </h2>

        {summaryLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-sm" />
            ))}
          </div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
              {[
                { label: 'Present', value: summary.present, color: 'text-success-600' },
                { label: 'Absent', value: summary.absent, color: 'text-error-600' },
                { label: 'Late', value: summary.late, color: 'text-yellow-600' },
                { label: 'Leave', value: summary.leave, color: 'text-blue-600' },
                { label: 'Not Marked', value: summary.notMarked, color: 'text-gray-500' },
              ].map((item) => (
                <div key={item.label} className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                  <div className="p-4 sm:p-6 xl:p-7.5">
                    <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {summary.byClass.length > 0 && (
              <div className="rounded-sm border border-stroke dark:border-strokedark overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-2 text-left dark:bg-meta-4">
                    <tr>
                      <th className="px-4 py-2.5 font-medium text-black dark:text-white">Class</th>
                      <th className="text-right px-4 py-2.5 font-medium text-black dark:text-white">Present</th>
                      <th className="text-right px-4 py-2.5 font-medium text-black dark:text-white">Absent</th>
                      <th className="text-right px-4 py-2.5 font-medium text-black dark:text-white">Total</th>
                      <th className="text-right px-4 py-2.5 font-medium text-black dark:text-white">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke dark:divide-strokedark">
                    {summary.byClass.map((row) => (
                      <tr key={row.classId} className="hover:bg-gray-2 dark:hover:bg-meta-4">
                        <td className="px-4 py-2.5 font-medium text-black dark:text-white">{row.className}</td>
                        <td className="px-4 py-2.5 text-right text-success-600 font-medium">
                          {row.present}
                        </td>
                        <td className="px-4 py-2.5 text-right text-error-600 font-medium">
                          {row.absent}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{row.total}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-black dark:text-white">
                          {row.rate.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
