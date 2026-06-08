'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { StatusSelector } from './status-selector';
import { AttendanceSummaryBar } from './attendance-summary-bar';
import { Button } from '@/components/ui/button';
import type { AttendanceRecord, AttendanceStatus } from '@/types/api.types';

export interface AttendanceGridRef {
  getRecords: () => { studentId: string; status: AttendanceStatus; remarks?: string }[];
}

interface RowState {
  status: AttendanceStatus | null;
  remarks: string;
}

interface StudentRow {
  studentId: string;
  fullName: string;
  admissionNumber: string;
  rollNumber: number | null;
}

interface AttendanceGridProps {
  students: StudentRow[];
  existingRecords?: AttendanceRecord[];
}

export const AttendanceGrid = forwardRef<AttendanceGridRef, AttendanceGridProps>(
  function AttendanceGrid({ students, existingRecords }, ref) {
    const [rows, setRows] = useState<Map<string, RowState>>(() => {
      const map = new Map<string, RowState>();
      students.forEach((s) => {
        map.set(s.studentId, { status: null, remarks: '' });
      });
      return map;
    });

    // Sync from server data once it loads (grid is keyed per date so no stale state risk)
    useEffect(() => {
      if (!existingRecords?.length) return;
      setRows((prev) => {
        const next = new Map(prev);
        existingRecords.forEach((r) => {
          next.set(r.studentId, {
            status: r.status,
            remarks: r.remarks ?? '',
          });
        });
        return next;
      });
    }, [existingRecords]);

    useImperativeHandle(
      ref,
      () => ({
        getRecords() {
          const records: { studentId: string; status: AttendanceStatus; remarks?: string }[] = [];
          rows.forEach((row, studentId) => {
            if (row.status) {
              records.push({
                studentId,
                status: row.status,
                ...(row.remarks ? { remarks: row.remarks } : {}),
              });
            }
          });
          return records;
        },
      }),
      [rows],
    );

    const updateRow = useCallback((studentId: string, patch: Partial<RowState>) => {
      setRows((prev) => {
        const next = new Map(prev);
        const current = prev.get(studentId) ?? { status: null, remarks: '' };
        next.set(studentId, { ...current, ...patch });
        return next;
      });
    }, []);

    function markAllPresent() {
      setRows((prev) => {
        const next = new Map(prev);
        students.forEach((s) => {
          const row = prev.get(s.studentId);
          if (!row?.status) {
            next.set(s.studentId, { status: 'PRESENT', remarks: '' });
          }
        });
        return next;
      });
    }

    const counts = { present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 };
    rows.forEach((row) => {
      if (row.status === 'PRESENT') counts.present++;
      else if (row.status === 'ABSENT') counts.absent++;
      else if (row.status === 'LATE') counts.late++;
      else if (row.status === 'LEAVE') counts.leave++;
      else counts.unmarked++;
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <AttendanceSummaryBar counts={counts} />
          <Button variant="outline" size="sm" onClick={markAllPresent}>
            Mark All Present
          </Button>
        </div>

        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-12">#</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Student</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status / Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {students.map((student, idx) => {
                const row = rows.get(student.studentId) ?? { status: null, remarks: '' };
                return (
                  <tr key={student.studentId} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-400 font-mono text-sm">
                      {student.rollNumber ?? idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{student.fullName}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{student.admissionNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusSelector
                        value={row.status}
                        remarks={row.remarks}
                        onStatusChange={(status) => updateRow(student.studentId, { status })}
                        onRemarksChange={(remarks) => updateRow(student.studentId, { remarks })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  },
);
