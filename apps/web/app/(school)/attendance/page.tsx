'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mark Today&apos;s Attendance</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* School-wide summary */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Today&apos;s School Summary
        </h2>

        {summaryLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
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
                <Card key={item.label}>
                  <CardContent className="pt-4 pb-3">
                    <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {summary.byClass.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Class</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">Present</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">Absent</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {summary.byClass.map((row) => (
                      <tr key={row.classId} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium">{row.className}</td>
                        <td className="px-4 py-2.5 text-right text-success-600 font-medium">
                          {row.present}
                        </td>
                        <td className="px-4 py-2.5 text-right text-error-600 font-medium">
                          {row.absent}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{row.total}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">
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
