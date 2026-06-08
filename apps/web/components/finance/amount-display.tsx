import { cn } from '@/lib/utils';

function formatNPR(amount: number): string {
  return 'Rs. ' + amount.toLocaleString('en-NP');
}

interface AmountDisplayProps {
  amount: number;
  className?: string;
  negative?: boolean;
}

export function AmountDisplay({ amount, className, negative = false }: AmountDisplayProps) {
  return (
    <span className={cn('font-mono', negative && 'text-error-600', className)}>
      {negative ? '-' : ''}{formatNPR(amount)}
    </span>
  );
}

export { formatNPR };
