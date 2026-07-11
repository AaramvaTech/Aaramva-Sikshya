import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import type { EsewaInitiateResponse } from '../types';

/**
 * Start an eSewa payment for an invoice. The client sends ONLY the invoice id —
 * the payable amount (outstanding balance) is computed server-side.
 */
export function useInitiateEsewaPayment() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await api.post('/finance/payments/esewa/initiate', { invoiceId });
      return res.data.data as EsewaInitiateResponse;
    },
  });
}
