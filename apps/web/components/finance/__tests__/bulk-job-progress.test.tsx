// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useBulkAssignJob } from '@/lib/hooks/use-bill-assignment';
import { BulkJobProgress } from '../bulk-job-progress';

vi.mock('@/lib/hooks/use-bill-assignment', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hooks/use-bill-assignment')>('@/lib/hooks/use-bill-assignment');
  return { ...actual, useBulkAssignJob: vi.fn() };
});

const mockUseBulkAssignJob = useBulkAssignJob as unknown as ReturnType<typeof vi.fn>;

function job(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 'job-1', feeStructureId: 'bfs-1', academicYearId: 'year-1', scopeType: 'CLASS',
    scopeClassId: 'class-1', scopeSectionId: null, effectiveFrom: '2026-04-14',
    status: 'PENDING', total: 10, processed: 0, failedCount: 0, failures: [],
    createdBy: 'user-1', createdAt: '2026-04-14T00:00:00.000Z', startedAt: null, completedAt: null,
    ...overrides,
  };
}

afterEach(() => cleanup());

// UI-2 §5.2/§7 (Srijan's second review note) — a PENDING job (or a RUNNING
// one that hasn't processed anything yet) must NOT render a static 0% bar,
// since a bulk-assign that appears frozen for up to 10s (the server's own
// drain cadence) reads as broken even though it isn't.
describe('BulkJobProgress — the "queued" reassurance state', () => {
  it('shows "Queued — starting…" for a PENDING job, not a 0% progress bar', () => {
    mockUseBulkAssignJob.mockReturnValue({ data: job({ status: 'PENDING', processed: 0 }), isLoading: false, isError: false });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.getByText('Queued — starting…')).toBeTruthy();
    expect(screen.queryByText('0 / 10')).toBeNull();
  });

  it('also shows the queued state for a RUNNING job that has processed nothing yet', () => {
    mockUseBulkAssignJob.mockReturnValue({ data: job({ status: 'RUNNING', processed: 0 }), isLoading: false, isError: false });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.getByText('Queued — starting…')).toBeTruthy();
  });

  it('switches to the real progress bar once processed > 0', () => {
    mockUseBulkAssignJob.mockReturnValue({ data: job({ status: 'RUNNING', processed: 4 }), isLoading: false, isError: false });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.queryByText('Queued — starting…')).toBeNull();
    expect(screen.getByText('4 / 10')).toBeTruthy();
  });

  it('shows completion with no failures', () => {
    mockUseBulkAssignJob.mockReturnValue({ data: job({ status: 'COMPLETED', processed: 10, total: 10 }), isLoading: false, isError: false });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.getByText(/assigned successfully/)).toBeTruthy();
  });

  it('shows the failures table when failedCount > 0, falling back to the raw id when no resolver is given', () => {
    mockUseBulkAssignJob.mockReturnValue({
      data: job({ status: 'COMPLETED', processed: 10, total: 10, failedCount: 1, failures: [{ studentId: 'stu-9', error: 'Student not found or inactive' }] }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.getByText('1 student skipped')).toBeTruthy();
    expect(screen.getByText('stu-9')).toBeTruthy();
  });

  it('resolves a failed row through resolveStudentName when given', () => {
    mockUseBulkAssignJob.mockReturnValue({
      data: job({ status: 'COMPLETED', processed: 9, total: 10, failedCount: 1, failures: [{ studentId: 'stu-9', error: 'Student not found or inactive' }] }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" resolveStudentName={(id) => (id === 'stu-9' ? 'Ram Shrestha' : id)} />);
    expect(screen.getByText('Ram Shrestha')).toBeTruthy();
    expect(screen.queryByText('stu-9')).toBeNull();
  });
});
