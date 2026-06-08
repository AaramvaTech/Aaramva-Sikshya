import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StudentAttendanceSummary } from '@/types/api.types';

interface StudentSummaryCardProps {
  summary: StudentAttendanceSummary;
}

const STATS = [
  { key: 'present', label: 'Present', color: 'text-success-600' },
  { key: 'absent', label: 'Absent', color: 'text-error-600' },
  { key: 'late', label: 'Late', color: 'text-yellow-600' },
  { key: 'leave', label: 'Leave', color: 'text-blue-600' },
  { key: 'totalWorkingDays', label: 'Working Days', color: 'text-gray-700' },
] as const;

export function StudentSummaryCard({ summary }: StudentSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{summary.studentName}</span>
          <span className="text-2xl font-bold text-brand-500">
            {summary.attendancePercent}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {STATS.map((item) => (
            <div key={item.key} className="text-center rounded-lg border p-3">
              <div className={`text-xl font-bold ${item.color}`}>{summary[item.key]}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>

        {summary.recentHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Recent 30 Days</h4>
            <div className="flex flex-wrap gap-2">
              {summary.recentHistory.map((entry) => (
                <div key={entry.ad} className="flex flex-col items-center gap-0.5">
                  <StatusBadge status={entry.status} />
                  <span className="text-[10px] text-gray-400">{entry.bs}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
