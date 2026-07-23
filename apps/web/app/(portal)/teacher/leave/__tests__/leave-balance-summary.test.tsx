// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// WEB-P Phase 3 — pins the fix in 061661d ("guard My Leave's balance section
// on userId hydration"). `useLeaveBalance` is `enabled: !!userId`, and
// TanStack Query keeps `isLoading` false while a query is merely disabled —
// so before `userId` hydrates from the auth store, `isLoading: false` with
// `balances: undefined` is indistinguishable, by isLoading alone, from a
// real "this teacher has zero leave types" response. The fix (and this
// test) is the render branch that tells those two apart: not-yet-hydrated
// must show the loading skeleton, never the empty-state copy. This is the
// same async-gate bug class as WEB-P Phase 2 Task 6's useStudents/
// useAssignments regression tests, but the shape here is a render branch,
// not a query `enabled` gate — so the proof is a DOM assertion (which
// branch rendered) rather than a call-count assertion on a mocked fetch.
//
// No @testing-library/jest-dom in this project (not installed) — assertions
// use plain vitest matchers against queryByText/querySelectorAll results
// instead of `.toBeInTheDocument()`.

import { LeaveBalanceSummary } from '../page';

afterEach(() => {
  cleanup();
});

describe('LeaveBalanceSummary — userId-hydration guard (WEB-P Phase 3 fix, 061661d)', () => {
  it('shows the loading skeleton, not the empty state, when userId has not hydrated yet', () => {
    // isLoading: false mirrors real TanStack Query behavior for a
    // `enabled: !!userId`-gated query while userId is still undefined —
    // the query never ran, so it isn't "loading", it's disabled.
    const onRetry = vi.fn();
    render(
      <LeaveBalanceSummary
        userId={undefined}
        isLoading={false}
        isError={false}
        balances={undefined}
        onRetry={onRetry}
      />,
    );

    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4);
    expect(screen.queryByText('No leave types configured yet.')).toBeNull();
  });

  it('shows the loading skeleton while the query is genuinely in flight (userId present)', () => {
    render(
      <LeaveBalanceSummary
        userId="teacher-1"
        isLoading={true}
        isError={false}
        balances={undefined}
        onRetry={vi.fn()}
      />,
    );

    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4);
  });

  it('shows the empty state once userId is hydrated and the balance list is genuinely empty', () => {
    render(
      <LeaveBalanceSummary
        userId="teacher-1"
        isLoading={false}
        isError={false}
        balances={[]}
        onRetry={vi.fn()}
      />,
    );

    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
    expect(screen.queryByText('No leave types configured yet.')).not.toBeNull();
  });

  it('shows the error state with retry when the (hydrated) query fails', () => {
    const onRetry = vi.fn();
    render(
      <LeaveBalanceSummary
        userId="teacher-1"
        isLoading={false}
        isError={true}
        balances={undefined}
        onRetry={onRetry}
      />,
    );

    expect(screen.queryByText("Couldn't load your leave balance.")).not.toBeNull();
    screen.getByRole('button', { name: /try again/i }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders balance cards once userId is hydrated and data has arrived', () => {
    render(
      <LeaveBalanceSummary
        userId="teacher-1"
        isLoading={false}
        isError={false}
        balances={[
          { leaveTypeId: 'lt-1', leaveTypeName: 'Sick Leave', entitlement: 12, used: 3, balance: 9 },
        ]}
        onRetry={vi.fn()}
      />,
    );

    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
    expect(screen.queryByText('Sick Leave')).not.toBeNull();
    expect(screen.queryByText('9')).not.toBeNull();
    expect(screen.queryByText('/ 12 days left')).not.toBeNull();
  });
});
