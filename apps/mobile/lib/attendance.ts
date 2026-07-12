// Semantic attendance palette — matches the design's status colours. NOT brand-coupled
// (documented exception to "tokens only"): never replace these with --primary.
export const STATUS_CONFIG = {
  PRESENT: {
    label: 'Present',
    labelKey: 'common:attendance.present',
    color: '#0E9F77',
    bg: '#E4F6F1',
    dot: '#0E9F77',
    shortCode: 'P',
    icon: 'checkmark-circle',
  },
  ABSENT: {
    label: 'Absent',
    labelKey: 'common:attendance.absent',
    color: '#E5484D',
    bg: '#FCE9E9',
    dot: '#E5484D',
    shortCode: 'A',
    icon: 'close-circle',
  },
  LATE: {
    label: 'Late',
    labelKey: 'common:attendance.late',
    color: '#D9892B',
    bg: '#FEF3E2',
    dot: '#D9892B',
    shortCode: 'L',
    icon: 'time',
  },
  LEAVE: {
    label: 'Leave',
    labelKey: 'common:attendance.leave',
    color: '#5B7FE0',
    bg: '#EAF0FE',
    dot: '#5B7FE0',
    shortCode: 'LV',
    icon: 'calendar',
  },
} as const;

export type AttendanceStatus = keyof typeof STATUS_CONFIG;
