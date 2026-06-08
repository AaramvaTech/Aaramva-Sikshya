'use client';

import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import type { AttendanceStatus } from '@/types/api.types';

interface StatusSelectorProps {
  value: AttendanceStatus | null;
  remarks: string;
  onStatusChange: (status: AttendanceStatus) => void;
  onRemarksChange: (remarks: string) => void;
}

const OPTIONS: { label: string; value: AttendanceStatus; selected: string; idle: string }[] = [
  {
    label: 'P',
    value: 'PRESENT',
    selected: 'border-green-500 bg-success-50 text-success-700',
    idle: 'border-gray-200 bg-white text-gray-400 hover:border-success-300',
  },
  {
    label: 'A',
    value: 'ABSENT',
    selected: 'border-error-500 bg-error-50 text-error-700',
    idle: 'border-gray-200 bg-white text-gray-400 hover:border-error-200',
  },
  {
    label: 'L',
    value: 'LATE',
    selected: 'border-yellow-500 bg-yellow-50 text-yellow-700',
    idle: 'border-gray-200 bg-white text-gray-400 hover:border-yellow-300',
  },
  {
    label: 'LV',
    value: 'LEAVE',
    selected: 'border-blue-500 bg-blue-50 text-blue-700',
    idle: 'border-gray-200 bg-white text-gray-400 hover:border-blue-300',
  },
];

export function StatusSelector({
  value,
  remarks,
  onStatusChange,
  onRemarksChange,
}: StatusSelectorProps) {
  const showRemarks = value === 'ABSENT' || value === 'LEAVE';

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onStatusChange(opt.value)}
            className={cn(
              'w-9 h-9 rounded border-2 text-xs font-bold transition-colors',
              value === opt.value ? opt.selected : opt.idle,
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {showRemarks && (
        <Textarea
          value={remarks}
          onChange={(e) => onRemarksChange(e.target.value)}
          placeholder="Remarks (optional)"
          rows={2}
          className="text-xs min-h-0 resize-none"
        />
      )}
    </div>
  );
}
