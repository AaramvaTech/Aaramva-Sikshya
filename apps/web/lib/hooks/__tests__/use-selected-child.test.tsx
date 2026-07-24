// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

// WEB-P Phase 5 whole-branch-review fix — pins the self-healing contract of
// useSelectedChild()'s effect (lib/hooks/use-selected-child.ts). Before this
// fix, the effect only auto-picked a default child when selectedChildId was
// falsy — it never re-validated an EXISTING non-empty selectedChildId
// against the current roster. A same-tab logout+login as a different parent
// left the prior parent's id sitting in the (unpersisted, in-memory)
// parent.store, which doesn't belong to the new parent's children — every
// per-child screen showed a permanent loading skeleton with no in-UI
// recovery for single-child parents. These tests prove the effect now
// re-picks a default whenever the current selectedChildId isn't found in
// the fetched children array, not only when it's empty.

vi.mock('@/lib/api/students.api', () => ({
  studentsApi: {
    getMyChildren: vi.fn(),
  },
}));

import { studentsApi } from '@/lib/api/students.api';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { useParentStore } from '@/store/parent.store';
import { useTenantStore } from '@/store/tenant.store';

const mockGetMyChildren = studentsApi.getMyChildren as unknown as ReturnType<typeof vi.fn>;

const CHILD_A = { id: 'child-a', firstName: 'A', lastName: 'One' };
const CHILD_B = { id: 'child-b', firstName: 'B', lastName: 'Two' };

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useSelectedChild — self-heals a stale selectedChildId (WEB-P Phase 5 fix)', () => {
  beforeEach(() => {
    mockGetMyChildren.mockReset();
    useTenantStore.setState({
      slug: 'demo-school',
      name: null,
      logoUrl: null,
      primaryColor: null,
      primaryForeground: null,
    });
    useParentStore.setState({ selectedChildId: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('picks the first child when no child is selected yet (pre-existing behavior)', async () => {
    mockGetMyChildren.mockResolvedValue({
      data: { success: true, data: [CHILD_A, CHILD_B] },
    });

    const { result } = renderHook(() => useSelectedChild(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.selectedChildId).toBe('child-a'));
    expect(result.current.selectedChild?.id).toBe('child-a');
  });

  it('leaves an already-valid selection untouched', async () => {
    mockGetMyChildren.mockResolvedValue({
      data: { success: true, data: [CHILD_A, CHILD_B] },
    });
    useParentStore.setState({ selectedChildId: 'child-b' });

    const { result } = renderHook(() => useSelectedChild(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.children).toHaveLength(2));
    expect(result.current.selectedChildId).toBe('child-b');
    expect(result.current.selectedChild?.id).toBe('child-b');
  });

  it('re-picks a default when the stored selectedChildId is not in the current roster (stale-parent-switch bug)', async () => {
    mockGetMyChildren.mockResolvedValue({
      data: { success: true, data: [CHILD_A] },
    });
    // Simulates Parent A's stale selection surviving a same-tab logout,
    // now being read against Parent B's roster, which doesn't contain it.
    useParentStore.setState({ selectedChildId: 'stale-child-from-parent-a' });

    const { result } = renderHook(() => useSelectedChild(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.selectedChildId).toBe('child-a'));
    expect(result.current.selectedChild?.id).toBe('child-a');
  });
});
