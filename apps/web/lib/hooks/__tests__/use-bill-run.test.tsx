// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

// UI-3 §1/§5.5 — pins the bill-run detail polling contract: keeps polling
// while a run is DRAFT/POSTING, stops once it reaches a terminal status
// (POSTED/VOIDED). `billRunPollInterval` is a pure function for the same
// reason use-bill-assignment.ts's jobPollInterval is — unit-testable without
// fighting TanStack Query's internal timers.

vi.mock('@/lib/api/bill-run.api', () => ({
  billRunApi: {
    get: vi.fn(),
  },
}));

import { billRunApi } from '@/lib/api/bill-run.api';
import { useBillRun, billRunPollInterval } from '@/lib/hooks/use-bill-run';
import { useTenantStore } from '@/store/tenant.store';

const mockGet = billRunApi.get as unknown as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function runResponse(status: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      success: true,
      data: {
        id: 'run-1', academicYearId: 'year-1', bsYear: 2083, bsMonth: 3, scope: 'WHOLE_SCHOOL',
        classId: null, status, issueDate: '2026-07-16', dueDate: '2026-07-31',
        totalStudents: 10, totalGross: 5000, totalConcession: 0, totalTax: 0, totalNet: 5000,
        createdBy: 'user-1', postedBy: null, postedAt: null, createdAt: '2026-07-16T00:00:00.000Z',
        lines: [], outcomeSummary: {},
        ...overrides,
      },
    },
  };
}

describe('billRunPollInterval (pure)', () => {
  it('keeps polling every 3s while DRAFT', () => {
    expect(billRunPollInterval('DRAFT')).toBe(3000);
  });
  it('keeps polling every 3s while POSTING', () => {
    expect(billRunPollInterval('POSTING')).toBe(3000);
  });
  it('stops polling once POSTED', () => {
    expect(billRunPollInterval('POSTED')).toBe(false);
  });
  it('stops polling once VOIDED', () => {
    expect(billRunPollInterval('VOIDED')).toBe(false);
  });
  it('keeps polling when status is not yet known (undefined)', () => {
    expect(billRunPollInterval(undefined)).toBe(3000);
  });
});

describe('useBillRun', () => {
  beforeEach(() => {
    mockGet.mockReset();
    useTenantStore.setState({
      slug: 'demo-school', name: null, logoUrl: null, primaryColor: null, primaryForeground: null,
    });
  });

  afterEach(() => cleanup());

  it('never fetches when id is null — fetchStatus stays idle', async () => {
    const { result } = renderHook(() => useBillRun(null), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches when a real id is given', async () => {
    mockGet.mockResolvedValueOnce(runResponse('DRAFT'));
    const { result } = renderHook(() => useBillRun('run-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe('DRAFT');
  });
});
