export const STATUS_CONFIG = {
  PRESENT: {
    label: 'Present',
    color: '#065f46',
    bg: '#d1fae5',
    dot: '#059669',
    shortCode: 'P',
    icon: 'checkmark-circle',
  },
  ABSENT: {
    label: 'Absent',
    color: '#dc2626',
    bg: '#fee2e2',
    dot: '#dc2626',
    shortCode: 'A',
    icon: 'close-circle',
  },
  LATE: {
    label: 'Late',
    color: '#d97706',
    bg: '#fef3c7',
    dot: '#d97706',
    shortCode: 'L',
    icon: 'time',
  },
  LEAVE: {
    label: 'Leave',
    color: '#1d4ed8',
    bg: '#dbeafe',
    dot: '#2563eb',
    shortCode: 'LV',
    icon: 'calendar',
  },
} as const;

export type AttendanceStatus = keyof typeof STATUS_CONFIG;
