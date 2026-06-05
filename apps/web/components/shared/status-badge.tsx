import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-800',
  PAID: 'bg-green-100 text-green-800',
  ACTIVE: 'bg-green-100 text-green-800',
  APPROVED: 'bg-green-100 text-green-800',
  ISSUED: 'bg-green-100 text-green-800',
  ABSENT: 'bg-red-100 text-red-800',
  UNPAID: 'bg-red-100 text-red-800',
  OVERDUE: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800',
  LOST: 'bg-red-100 text-red-800',
  LATE: 'bg-yellow-100 text-yellow-800',
  PARTIAL: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  LEAVE: 'bg-blue-100 text-blue-800',
  RETURNED: 'bg-gray-100 text-gray-600',
  INACTIVE: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        style,
        className,
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}
