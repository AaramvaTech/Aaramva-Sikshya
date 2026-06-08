'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { MarkRecord } from '@/types/api.types';

export interface MarksGridRef {
  getMarks: () => {
    studentId: string;
    marksObtained?: number;
    isAbsent?: boolean;
    remarks?: string;
  }[];
}

interface MarkState {
  marks: string;
  isAbsent: boolean;
  remarks: string;
}

interface MarksGridProps {
  students: MarkRecord[];
  fullMarks: number;
  /** Pre-populate from existing API marks (only studentId + marks fields used) */
  existingMarks?: Pick<MarkRecord, 'studentId' | 'marksObtained' | 'isAbsent' | 'remarks'>[];
}

export const MarksGrid = forwardRef<MarksGridRef, MarksGridProps>(
  function MarksGrid({ students, fullMarks, existingMarks }, ref) {
    const [rows, setRows] = useState<Map<string, MarkState>>(() => {
      const map = new Map<string, MarkState>();
      students.forEach((s) => {
        map.set(s.studentId, {
          marks: s.marksObtained != null ? String(s.marksObtained) : '',
          isAbsent: s.isAbsent,
          remarks: s.remarks ?? '',
        });
      });
      return map;
    });

    useEffect(() => {
      if (!existingMarks?.length) return;
      setRows((prev) => {
        const next = new Map(prev);
        existingMarks.forEach((r) => {
          next.set(r.studentId, {
            marks: r.marksObtained != null ? String(r.marksObtained) : '',
            isAbsent: r.isAbsent,
            remarks: r.remarks ?? '',
          });
        });
        return next;
      });
    }, [existingMarks]);

    useImperativeHandle(
      ref,
      () => ({
        getMarks() {
          const result: ReturnType<MarksGridRef['getMarks']> = [];
          rows.forEach((row, studentId) => {
            const marksNum = row.marks !== '' ? Number(row.marks) : undefined;
            result.push({
              studentId,
              marksObtained: row.isAbsent ? undefined : marksNum,
              isAbsent: row.isAbsent || undefined,
              remarks: row.remarks || undefined,
            });
          });
          return result;
        },
      }),
      [rows],
    );

    const updateRow = useCallback(
      (studentId: string, patch: Partial<MarkState>) => {
        setRows((prev) => {
          const next = new Map(prev);
          const current = prev.get(studentId) ?? { marks: '', isAbsent: false, remarks: '' };
          next.set(studentId, { ...current, ...patch });
          return next;
        });
      },
      [],
    );

    function handleAbsentChange(studentId: string, checked: boolean) {
      updateRow(studentId, { isAbsent: checked, marks: checked ? '' : rows.get(studentId)?.marks ?? '' });
    }

    function handleMarksChange(studentId: string, value: string) {
      if (value === '') {
        updateRow(studentId, { marks: '' });
        return;
      }
      const num = Number(value);
      if (isNaN(num) || num < 0) return;
      if (num > fullMarks) return;
      updateRow(studentId, { marks: value });
    }

    return (
      <div className="rounded-md border overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-12">Roll</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Student</th>
              <th className="text-center px-4 py-2.5 font-medium text-gray-600 w-28">
                Marks <span className="text-gray-400 font-normal">/ {fullMarks}</span>
              </th>
              <th className="text-center px-4 py-2.5 font-medium text-gray-600 w-20">Absent</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((student, idx) => {
              const row = rows.get(student.studentId) ?? { marks: '', isAbsent: false, remarks: '' };
              return (
                <tr key={student.studentId} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-sm text-center">
                    {student.rollNumber ?? idx + 1}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{student.studentName}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{student.admissionNumber}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Input
                      type="number"
                      min={0}
                      max={fullMarks}
                      value={row.marks}
                      onChange={(e) => handleMarksChange(student.studentId, e.target.value)}
                      disabled={row.isAbsent}
                      className="h-8 text-center w-full tabular-nums"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Checkbox
                      checked={row.isAbsent}
                      onCheckedChange={(checked) =>
                        handleAbsentChange(student.studentId, !!checked)
                      }
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Input
                      value={row.remarks}
                      onChange={(e) => updateRow(student.studentId, { remarks: e.target.value })}
                      className="h-8"
                      placeholder="Optional"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  },
);
