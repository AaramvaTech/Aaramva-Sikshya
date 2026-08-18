// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * BILL-8-UI addendum A4 — a presigned read URL lives 300s. The print hooks are
 * mutations precisely so nothing caches it: a query would key the URL and hand
 * a stale (possibly expired) link back on the next click.
 *
 * This is the load-bearing rule of Phase 1 and the one thing a component test
 * could not prove without a browser, so it is pinned here by call count rather
 * than by inspecting the hook's shape.
 */

vi.mock('@/lib/api/bill-print.api', () => ({
  billPrintApi: { invoicePdf: vi.fn(), receipt: vi.fn() },
}));

import { billPrintApi } from '@/lib/api/bill-print.api';
import { usePrintInvoicePdf, usePrintReceipt } from '@/lib/hooks/use-bill-print';

const mockInvoicePdf = billPrintApi.invoicePdf as unknown as ReturnType<typeof vi.fn>;
const mockReceipt = billPrintApi.receipt as unknown as ReturnType<typeof vi.fn>;

function createWrapper() {
  // Deliberately a LONG-cached client: if these hooks were queries, this
  // config would serve the second call from cache and the assertions below
  // would fail. That is the point of the test.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const response = (url: string) => ({ data: { success: true, data: { presignedUrl: url, generated: false } } });

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoicePdf.mockResolvedValue(response('https://storage.example/inv-1.pdf?sig=first'));
  mockReceipt.mockResolvedValue(response('https://storage.example/rcpt-1.pdf?sig=first'));
});
afterEach(() => cleanup());

describe('usePrintInvoicePdf — never caches the presigned URL', () => {
  it('re-fetches on every print of the SAME invoice, even under an infinite cache', async () => {
    const { result } = renderHook(() => usePrintInvoicePdf(), { wrapper: createWrapper() });

    await act(async () => { await result.current.mutateAsync({ invoiceId: 'inv-1', lang: 'EN' }); });
    mockInvoicePdf.mockResolvedValue(response('https://storage.example/inv-1.pdf?sig=second'));
    const second = await act(async () =>
      result.current.mutateAsync({ invoiceId: 'inv-1', lang: 'EN' }),
    );

    expect(mockInvoicePdf).toHaveBeenCalledTimes(2);
    // The second print got the FRESH signature, not the first one replayed.
    expect(second!.presignedUrl).toContain('sig=second');
  });

  it('passes the chosen language straight through', async () => {
    const { result } = renderHook(() => usePrintInvoicePdf(), { wrapper: createWrapper() });
    await act(async () => { await result.current.mutateAsync({ invoiceId: 'inv-9', lang: 'NE' }); });
    expect(mockInvoicePdf).toHaveBeenCalledWith('inv-9', 'NE');
  });

  it('omits lang when none is chosen, so the server applies the tenant default', async () => {
    const { result } = renderHook(() => usePrintInvoicePdf(), { wrapper: createWrapper() });
    await act(async () => { await result.current.mutateAsync({ invoiceId: 'inv-9' }); });
    expect(mockInvoicePdf).toHaveBeenCalledWith('inv-9', undefined);
  });
});

describe('usePrintReceipt — never caches the presigned URL', () => {
  it('re-fetches on every reprint of the SAME payment', async () => {
    const { result } = renderHook(() => usePrintReceipt(), { wrapper: createWrapper() });

    await act(async () => { await result.current.mutateAsync({ paymentId: 'pay-1', lang: 'EN' }); });
    await act(async () => { await result.current.mutateAsync({ paymentId: 'pay-1', lang: 'EN' }); });
    await act(async () => { await result.current.mutateAsync({ paymentId: 'pay-1', lang: 'EN' }); });

    // Reprints are the whole point of the payment-history entry point; each
    // one must fetch its own short-lived URL.
    expect(mockReceipt).toHaveBeenCalledTimes(3);
  });

  it('surfaces the API error rather than swallowing it', async () => {
    mockReceipt.mockRejectedValue({ response: { data: { error: { code: 'STORAGE_UNAVAILABLE' } } } });
    const { result } = renderHook(() => usePrintReceipt(), { wrapper: createWrapper() });
    await expect(
      act(async () => { await result.current.mutateAsync({ paymentId: 'pay-1' }); }),
    ).rejects.toMatchObject({ response: { data: { error: { code: 'STORAGE_UNAVAILABLE' } } } });
  });
});
