// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

// WEB-P Phase 2 Task 6 — pins Task 3's fix contract:
// `enabled: !!slug && (options?.enabled ?? true)` in useStudents
// (lib/hooks/use-students.ts). Before that fix, a page whose filter key
// resolved asynchronously (e.g. a still-loading schedule lookup) had no way
// to hold this query off — it fired once, unfiltered, on first render. These
// tests prove the caller-supplied `enabled` gate genuinely blocks/unblocks
// the fetch, isolated from the separate tenant-slug gate it's ANDed with.

vi.mock('@/lib/api/students.api', () => ({
  studentsApi: {
    list: vi.fn(),
  },
}));

import { studentsApi } from '@/lib/api/students.api';
import { useStudents } from '@/lib/hooks/use-students';
import { useTenantStore } from '@/store/tenant.store';

const mockList = studentsApi.list as unknown as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useStudents — enabled gate (WEB-P Phase 2 Task 3 fix)', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockList.mockResolvedValue({
      data: { success: true, data: { data: [], meta: { page: 1, limit: 20, total: 0 } } },
    });
    // Real tenant slug set so these tests isolate the `enabled` option from
    // the separate `!!slug` half of the AND — a null slug would make every
    // case below pass for the wrong reason.
    useTenantStore.setState({
      slug: 'demo-school',
      name: null,
      logoUrl: null,
      primaryColor: null,
      primaryForeground: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('never fetches when enabled: false — fetchStatus stays idle', async () => {
    const { result } = renderHook(() => useStudents({}, { enabled: false }), {
      wrapper: createWrapper(),
    });

    // Give any pending microtask queue a chance to run so a wrongly-firing
    // query would have started by now.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockList).not.toHaveBeenCalled();
  });

  it('fetches when enabled: true', async () => {
    const { result } = renderHook(() => useStudents({}, { enabled: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('fetches when `options` is omitted entirely (default behavior preserved)', async () => {
    const { result } = renderHook(() => useStudents({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('still does not fetch without a tenant slug, even with enabled: true (the AND, not just the new gate)', async () => {
    useTenantStore.setState({
      slug: null,
      name: null,
      logoUrl: null,
      primaryColor: null,
      primaryForeground: null,
    });

    const { result } = renderHook(() => useStudents({}, { enabled: true }), {
      wrapper: createWrapper(),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockList).not.toHaveBeenCalled();
  });
});
