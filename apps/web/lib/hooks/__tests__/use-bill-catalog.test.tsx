// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/bill-catalog.api', () => ({
  billCatalogApi: {
    feeHeads: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    lateFeeRules: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { billCatalogApi } from '@/lib/api/bill-catalog.api';
import { useFeeHeads, useCreateFeeHead, useDeleteLateFeeRule } from '@/lib/hooks/use-bill-catalog';
import { useTenantStore } from '@/store/tenant.store';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useFeeHeads', () => {
  beforeEach(() => {
    (billCatalogApi.feeHeads.list as ReturnType<typeof vi.fn>).mockReset();
    useTenantStore.setState({
      slug: 'demo-school', name: null, logoUrl: null, primaryColor: null, primaryForeground: null,
    });
  });
  afterEach(() => cleanup());

  it('fetches the fee-head list when a tenant slug is present', async () => {
    (billCatalogApi.feeHeads.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: { data: [{ id: '1', name: 'Tuition' }], meta: { page: 1, limit: 100, total: 1 } } },
    });
    const { result } = renderHook(() => useFeeHeads(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(billCatalogApi.feeHeads.list).toHaveBeenCalledTimes(1);
    expect(result.current.data).toHaveLength(1);
  });

  it('never fetches when no tenant slug is present', async () => {
    useTenantStore.setState({ slug: null, name: null, logoUrl: null, primaryColor: null, primaryForeground: null });
    const { result } = renderHook(() => useFeeHeads(), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.fetchStatus).toBe('idle');
    expect(billCatalogApi.feeHeads.list).not.toHaveBeenCalled();
  });
});

describe('useCreateFeeHead', () => {
  beforeEach(() => {
    (billCatalogApi.feeHeads.create as ReturnType<typeof vi.fn>).mockReset();
    useTenantStore.setState({
      slug: 'demo-school', name: null, logoUrl: null, primaryColor: null, primaryForeground: null,
    });
  });
  afterEach(() => cleanup());

  it('calls the create endpoint with the given payload', async () => {
    (billCatalogApi.feeHeads.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: { id: '1' } } });
    const { result } = renderHook(() => useCreateFeeHead(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ name: 'Tuition', code: 'TUI', recurrence: 'MONTHLY' });
    expect(billCatalogApi.feeHeads.create).toHaveBeenCalledWith({ name: 'Tuition', code: 'TUI', recurrence: 'MONTHLY' });
  });
});

describe('useDeleteLateFeeRule', () => {
  beforeEach(() => {
    (billCatalogApi.lateFeeRules.delete as ReturnType<typeof vi.fn>).mockReset();
  });
  afterEach(() => cleanup());

  it('calls the delete endpoint with the given id', async () => {
    (billCatalogApi.lateFeeRules.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { result } = renderHook(() => useDeleteLateFeeRule(), { wrapper: createWrapper() });
    await result.current.mutateAsync('rule-1');
    expect(billCatalogApi.lateFeeRules.delete).toHaveBeenCalledWith('rule-1');
  });
});
