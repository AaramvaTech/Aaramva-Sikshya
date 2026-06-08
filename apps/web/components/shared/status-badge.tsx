import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  PRESENT:   'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400',
  PAID:      'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400',
  ACTIVE:    'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400',
  APPROVED:  'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400',
  ISSUED:    'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400',
  ABSENT:    'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400',
  UNPAID:    'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400',
  OVERDUE:   'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400',
  REJECTED:  'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400',
  LOST:      'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400',
  LATE:      'bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400',
  PARTIAL:   'bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400',
  PENDING:   'bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400',
  LEAVE:     'bg-brand-50 text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-400',
  RETURNED:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  INACTIVE:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-theme-xs font-medium',
        style,
        className,
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}
