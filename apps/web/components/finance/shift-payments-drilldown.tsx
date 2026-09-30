'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { BsDate } from '@/components/shared/bs-date';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { useShiftPayments } from '@/lib/hooks/use-cashier';
import { formatClassSection } from '@/lib/class-section';
import type { CashierShift } from '@/types/api.types';

/**
 * The receipts under one shift. The server decides membership with the same
 * predicate close-shift uses for expected cash (cashier + CLEARED + created_at
 * inside [opened_at, closed_at|now]), so this list and the total agree. The web
 * must not re-derive it: no date slicing, no CLEARED filter here.
 */
export function ShiftPaymentsDrilldown({ shift }: { shift: CashierShift }) {
  const q = useShiftPayments(shift.id);
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (q.isError) return <QueryErrorState onRetry={() => q.refetch()} />;
  const rows = q.data?.payments ?? [];
  if (rows.length === 0) return <p className="px-3 py-4 text-sm text-gray-400">No cleared payments during this shift.</p>;
  return (
    <div className="overflow-x-auto border-t border-stroke bg-gray-2 px-3 py-3 dark:border-strokedark dark:bg-meta-4">
      <table className="w-full text-sm">
        <thead className="text-left">
          <tr>
            {['Receipt', 'Student', 'Class / Section', 'Method', 'Amount', 'Received'].map((h) => (
              <th key={h} className="px-3 py-2 font-medium text-black dark:text-white">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stroke dark:divide-strokedark">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">{p.receiptNumber}</td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                {p.studentName ?? '—'}
                {p.admissionNumber && <span className="ml-1 font-mono text-xs text-gray-400">{p.admissionNumber}</span>}
              </td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatClassSection(p.className, p.sectionName)}</td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{p.method}</td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">Rs {p.amount}</td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300"><BsDate date={p.receivedDate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
