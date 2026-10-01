'use client';

import { useMyOpenShift } from '@/lib/hooks/use-cashier';
import { showNoShiftWarning } from '@/lib/cashier-close';
import type { BillPaymentMethod } from '@/types/api.types';

/** Non-blocking: saving is never gated on this. */
export function NoShiftWarning({ method }: { method: BillPaymentMethod }) {
  const { isLoading, isError, data } = useMyOpenShift();
  if (!showNoShiftWarning(method, !isLoading && !isError, !!data)) return null;
  return (
    <p role="status" className="text-sm text-warning-600">
      No cash shift is open. This payment will not be counted in any shift.
    </p>
  );
}
