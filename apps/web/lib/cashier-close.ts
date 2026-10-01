import type { BillPaymentMethod } from '@/types/api.types';

export const rs = (n: number) => `Rs ${n.toLocaleString('en-NP')}`;

/** Wording + tone for the post-close result. Exact match is neutral; short or over is a warning. */
export function describeVariance(variance: number): { text: string; tone: 'neutral' | 'warning' } {
  if (variance === 0) return { text: 'Variance Rs 0', tone: 'neutral' };
  return variance < 0
    ? { text: `Variance -${rs(-variance)} (short)`, tone: 'warning' }
    : { text: `Variance +${rs(variance)} (over)`, tone: 'warning' };
}

/** Warn only once the shift lookup has settled — "not loaded yet" must never read as "no open shift". */
export function showNoShiftWarning(method: BillPaymentMethod, shiftsLoaded: boolean, hasOpenShift: boolean): boolean {
  return method === 'CASH' && shiftsLoaded && !hasOpenShift;
}
