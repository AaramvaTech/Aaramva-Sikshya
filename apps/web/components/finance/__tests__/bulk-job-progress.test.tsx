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

// FEE-CLASS-GUARD — `reason` is OPTIONAL: every failure row written before the
// guard existed has only {studentId, error} (jsonb, never migrated). The label
// is purely additive and `error` must render either way.
describe('BulkJobProgress — failures[].reason', () => {
  it('renders a "Class mismatch" label alongside the error when reason is CLASS_MISMATCH', () => {
    mockUseBulkAssignJob.mockReturnValue({
      data: job({
        status: 'COMPLETED', processed: 3, total: 3, failedCount: 1,
        failures: [{
          studentId: 'stu-5',
          error: 'Class mismatch. Fee structure is for Grade 1, but this student is in Grade 5 — A.',
          reason: 'CLASS_MISMATCH',
        }],
      }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.getByText('Class mismatch')).toBeTruthy();
    expect(screen.getByText(/Fee structure is for Grade 1/)).toBeTruthy();
  });

  it('renders a historical failure row with NO reason without crashing, and shows no label', () => {
    mockUseBulkAssignJob.mockReturnValue({
      data: job({
        status: 'COMPLETED', processed: 3, total: 3, failedCount: 1,
        failures: [{ studentId: 'stu-9', error: 'Student not found or inactive' }],
      }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.getByText('Student not found or inactive')).toBeTruthy();
    expect(screen.queryByText('Class mismatch')).toBeNull();
  });

  it('still labels CLASS_MISMATCH after the Phase 2 generalisation', () => {
    // Guards the exact regression the shared-component change could cause:
    // FEE-CLASS-GUARD's label surviving the studentId/invoiceId normalisation.
    mockUseBulkAssignJob.mockReturnValue({
      data: job({
        status: 'COMPLETED', processed: 2, total: 2, failedCount: 1,
        failures: [{ studentId: 'stu-5', error: 'Class mismatch. Grade 1 vs Grade 5.', reason: 'CLASS_MISMATCH' }],
      }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.getByText('Class mismatch')).toBeTruthy();
    expect(screen.getByText('1 student skipped')).toBeTruthy();
  });

  it('renders a mixed list — one historical row, one guarded row', () => {
    mockUseBulkAssignJob.mockReturnValue({
      data: job({
        status: 'COMPLETED', processed: 4, total: 4, failedCount: 2,
        failures: [
          { studentId: 'stu-9', error: 'Student not found or inactive' },
          { studentId: 'stu-5', error: 'Class mismatch. Fee structure is for Grade 1, but this student is in Grade 5 — A.', reason: 'CLASS_MISMATCH' },
        ],
      }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.getByText('2 students skipped')).toBeTruthy();
    expect(screen.getByText('Student not found or inactive')).toBeTruthy();
    expect(screen.getAllByText('Class mismatch')).toHaveLength(1);
  });
});

// BILL-8-UI Phase 2 — the same component now serves bill-print jobs, which
// key failures by invoiceId, carry no `reason`, and produce a downloadUrl.
describe('BulkJobProgress — bill-print jobs (noun="invoice")', () => {
  it('says "printed", not "assigned", and counts invoices', () => {
    mockUseBulkAssignJob.mockReturnValue({
      data: job({ status: 'COMPLETED', processed: 40, total: 40 }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" noun="invoice" />);
    expect(screen.getByText('All 40 invoices printed successfully.')).toBeTruthy();
  });

  it('renders an invoiceId-keyed failure row', () => {
    mockUseBulkAssignJob.mockReturnValue({
      data: job({
        status: 'COMPLETED', processed: 3, total: 3, failedCount: 1,
        failures: [{ invoiceId: 'inv-7', error: 'Render failed' }],
      }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" noun="invoice" />);
    expect(screen.getByText('1 invoice skipped')).toBeTruthy();
    expect(screen.getByText('inv-7')).toBeTruthy();
    expect(screen.getByText('Render failed')).toBeTruthy();
    expect(screen.queryByText('Class mismatch')).toBeNull();
  });

  it('offers the merged PDF once the job carries a downloadUrl', () => {
    mockUseBulkAssignJob.mockReturnValue({
      data: job({
        status: 'COMPLETED', processed: 40, total: 40,
        downloadUrl: 'https://storage.example/merged.pdf?sig=abc',
      }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" noun="invoice" />);
    const link = screen.getByRole('link', { name: /Download merged PDF/i }) as HTMLAnchorElement;
    expect(link.href).toContain('merged.pdf');
    // Signed storage URL — never hand the opened tab a window.opener handle.
    expect(link.rel).toContain('noopener');
  });

  // Bulk-assign jobs never carry one; the button must not appear for them.
  it('shows no download for a completed bulk-assign job', () => {
    mockUseBulkAssignJob.mockReturnValue({
      data: job({ status: 'COMPLETED', processed: 10, total: 10 }),
      isLoading: false, isError: false,
    });
    render(<BulkJobProgress jobId="job-1" />);
    expect(screen.queryByRole('link', { name: /Download/i })).toBeNull();
  });
});
