// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

// UI-2 §5.2/§7 — pins the bulk-job progress polling contract: keeps polling
// while a job is PENDING/RUNNING, stops once it reaches a terminal status
// (COMPLETED/FAILED). `jobPollInterval` is a pure function precisely so this
// doesn't need to fight TanStack Query's internal timers (see the
// WEB-P Phase 2 Task 6 precedent for the `{enabled}` gate tests this mirrors).

vi.mock('@/lib/api/bill-assignment.api', () => ({
  billAssignmentApi: {
    bulkAssign: { getJob: vi.fn() },
  },
}));

import { billAssignmentApi } from '@/lib/api/bill-assignment.api';
import { useBulkAssignJob, jobPollInterval } from '@/lib/hooks/use-bill-assignment';
import { useTenantStore } from '@/store/tenant.store';

const mockGetJob = billAssignmentApi.bulkAssign.getJob as unknown as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function jobResponse(status: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      success: true,
      data: {
        id: 'job-1', feeStructureId: 'bfs-1', academicYearId: 'year-1', scopeType: 'CLASS',
        scopeClassId: 'class-1', scopeSectionId: null, effectiveFrom: '2026-04-14',
        status, total: 10, processed: 0, failedCount: 0, failures: [],
        createdBy: 'user-1', createdAt: '2026-04-14T00:00:00.000Z', startedAt: null, completedAt: null,
        ...overrides,
      },
    },
  };
}

describe('jobPollInterval (pure)', () => {
  it('keeps polling every 3s while PENDING', () => {
    expect(jobPollInterval('PENDING')).toBe(3000);
  });
  it('keeps polling every 3s while RUNNING', () => {
    expect(jobPollInterval('RUNNING')).toBe(3000);
  });
  it('stops polling once COMPLETED', () => {
    expect(jobPollInterval('COMPLETED')).toBe(false);
  });
  it('stops polling once FAILED', () => {
    expect(jobPollInterval('FAILED')).toBe(false);
  });
  it('keeps polling when status is not yet known (undefined)', () => {
    expect(jobPollInterval(undefined)).toBe(3000);
  });
});

describe('useBulkAssignJob', () => {
  beforeEach(() => {
    mockGetJob.mockReset();
    useTenantStore.setState({
      slug: 'demo-school', name: null, logoUrl: null, primaryColor: null, primaryForeground: null,
    });
  });

  afterEach(() => cleanup());

  it('never fetches when jobId is null — fetchStatus stays idle', async () => {
    const { result } = renderHook(() => useBulkAssignJob(null), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetJob).not.toHaveBeenCalled();
  });

  it('fetches when a real jobId is given', async () => {
    mockGetJob.mockResolvedValueOnce(jobResponse('PENDING'));
    const { result } = renderHook(() => useBulkAssignJob('job-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe('PENDING');
  });
});
