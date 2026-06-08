interface Counts {
  present: number;
  absent: number;
  late: number;
  leave: number;
  unmarked: number;
}

interface AttendanceSummaryBarProps {
  counts: Counts;
}

const ITEMS = [
  { key: 'present', label: 'Present', color: 'text-success-700 bg-success-50 ring-green-200' },
  { key: 'absent', label: 'Absent', color: 'text-error-700 bg-error-50 ring-red-200' },
  { key: 'late', label: 'Late', color: 'text-yellow-700 bg-yellow-50 ring-yellow-200' },
  { key: 'leave', label: 'Leave', color: 'text-blue-700 bg-blue-50 ring-blue-200' },
  { key: 'unmarked', label: 'Unmarked', color: 'text-gray-500 bg-gray-50 ring-gray-200' },
] as const;

export function AttendanceSummaryBar({ counts }: AttendanceSummaryBarProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {ITEMS.map((item) => (
        <span
          key={item.key}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${item.color}`}
        >
          {item.label}: <strong>{counts[item.key]}</strong>
        </span>
      ))}
    </div>
  );
}
