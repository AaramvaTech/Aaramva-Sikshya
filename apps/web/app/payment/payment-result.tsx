'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Smartphone, XCircle } from 'lucide-react';
import { rawApi } from '@/lib/api';
import { formatNPR } from '@/components/finance/amount-display';
import type { EsewaPublicReceipt } from '@/types/api.types';

/**
 * Landing page body for the eSewa browser flow (mobile-initiated). Public by
 * design: it renders only what the public receipt lookup exposes — invoice
 * ref, amount, gateway ref — no student PII. The receipt state comes from OUR
 * server (which trusts only its own status-check), never from query params.
 */
export function PaymentResult({ kind }: { kind: 'success' | 'failure' }) {
  const params = useSearchParams();
  const txn = params.get('txn') ?? '';
  const tenant = params.get('tenant') ?? '';
  const reason = params.get('reason') ?? '';

  const school = useQuery({
    queryKey: ['tenant-verify', tenant],
    queryFn: async () =>
      (await rawApi.get(`/tenants/verify/${tenant}`)).data.data as {
        name: string;
        logoUrl: string | null;
      },
    enabled: Boolean(tenant),
    staleTime: Infinity,
  });

  const receipt = useQuery({
    queryKey: ['esewa-receipt', tenant, txn],
    queryFn: async () =>
      (await rawApi.get(`/finance/payments/esewa/public/receipt/${tenant}/${txn}`)).data
        .data as EsewaPublicReceipt,
    enabled: Boolean(tenant && txn),
  });

  const verified = receipt.data?.status === 'VERIFIED';
  const showSuccess = kind === 'success' && verified;

  return (
    <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
      {school.data && (
        <div className="mb-8 flex flex-col items-center gap-2">
          {school.data.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.data.logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          )}
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{school.data.name}</p>
        </div>
      )}

      {receipt.isLoading ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Checking payment status…</p>
        </div>
      ) : showSuccess ? (
        <>
          <CheckCircle2 className="mx-auto h-16 w-16 text-success-500" />
          <h1 className="mt-4 text-2xl font-semibold text-black dark:text-white">
            Payment successful
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Your fee payment was received and verified.
          </p>
        </>
      ) : (
        <>
          <XCircle className="mx-auto h-16 w-16 text-error-500" />
          <h1 className="mt-4 text-2xl font-semibold text-black dark:text-white">
            {kind === 'success' ? 'Payment not verified yet' : 'Payment not completed'}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {receipt.data?.status === 'INITIATED'
              ? 'The payment has not been confirmed by eSewa yet. If money was deducted, open the app and use "Check status" — it will be verified automatically.'
              : 'No money was received for this transaction. If your eSewa account was debited, it will be reversed by eSewa.'}
          </p>
          {(receipt.data?.failureReason || reason) && (
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Reason: {receipt.data?.failureReason ?? decodeURIComponent(reason)}
            </p>
          )}
        </>
      )}

      {receipt.data && (
        <dl className="mt-8 space-y-2 rounded-lg border border-stroke p-5 text-left text-sm dark:border-form-strokedark">
          <div className="flex justify-between">
            <dt className="text-gray-500 dark:text-gray-400">Invoice</dt>
            <dd className="font-medium text-black dark:text-white">{receipt.data.invoiceNumber}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500 dark:text-gray-400">Amount</dt>
            <dd className="font-medium text-black dark:text-white">{formatNPR(receipt.data.amount)}</dd>
          </div>
          {receipt.data.gatewayRef && (
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">eSewa ref</dt>
              <dd className="font-medium text-black dark:text-white">{receipt.data.gatewayRef}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-gray-500 dark:text-gray-400">Status</dt>
            <dd className="font-medium text-black dark:text-white">{receipt.data.status}</dd>
          </div>
        </dl>
      )}

      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Smartphone className="h-4 w-4" />
        <span>You can close this page and return to the app — it refreshes automatically.</span>
      </div>
    </div>
  );
}
