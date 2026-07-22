// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

// WEB-P Phase 2 Task 6 — pins Task 4's fix contract:
// `enabled: options?.enabled ?? true` in useAssignments
// (lib/hooks/use-assignments.ts). The teacher assignments list page holds
// this query off (`scopeReady`) until the async useMySections() lookup has
// settled, avoiding one unfiltered whole-school fetch on a fresh deep link.
// These tests prove the gate genuinely blocks/unblocks the fetch.

vi.mock('@/lib/api/assignments.api', () => ({
  assignmentsApi: {
    list: vi.fn(),
  },
}));

import { assignmentsApi } from '@/lib/api/assignments.api';
import { useAssignments } from '@/lib/hooks/use-assignments';

const mockList = assignmentsApi.list as unknown as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useAssignments — enabled gate (WEB-P Phase 2 Task 4 fix)', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockList.mockResolvedValue({
      data: { success: true, data: { data: [], meta: { page: 1, limit: 20, total: 0 } } },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('never fetches when enabled: false — fetchStatus stays idle', async () => {
    const { result } = renderHook(() => useAssignments({}, { enabled: false }), {
      wrapper: createWrapper(),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockList).not.toHaveBeenCalled();
  });

  it('fetches when enabled: true', async () => {
    const { result } = renderHook(() => useAssignments({}, { enabled: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('fetches when `options` is omitted entirely (default behavior preserved)', async () => {
    const { result } = renderHook(() => useAssignments({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
