import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type { KhaltiInitiateResponse, PaymentGateways } from '../types';

/**
 * Which online gateways the server has configured (PAY-2) — drives the
 * PayChooser. Until the first response arrives callers fall back to
 * eSewa-only (the pre-PAY-2 behavior).
 */
export function usePaymentGateways() {
  return useQuery<PaymentGateways>({
    queryKey: ['payment-gateways'],
    queryFn: async () => {
      const res = await api.get('/finance/payment-gateways');
      return res.data.data as PaymentGateways;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Start a Khalti payment for an invoice. The client sends ONLY the invoice id —
 * the payable amount is computed server-side (and sent to Khalti in paisa).
 * The response's paymentUrl is Khalti's hosted page (absolute URL, open directly).
 */
export function useInitiateKhaltiPayment() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await api.post('/finance/payments/khalti/initiate', { invoiceId });
      return res.data.data as KhaltiInitiateResponse;
    },
  });
}
