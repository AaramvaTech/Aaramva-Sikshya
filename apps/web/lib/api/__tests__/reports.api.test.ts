import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression: the Daybook tab sent BsDateInput's AD string as `bsDate`, which the
// API read as a BS date (2026-09-30 -> "Invalid BS date" 500, 2026-09-29 -> empty).
// The contract is now `date` (AD); `bsDate` must never be sent again.

vi.mock('@/lib/api', () => ({ default: { get: vi.fn().mockResolvedValue({}) } }));

import api from '@/lib/api';
import { reportsApi } from '@/lib/api/reports.api';

const get = api.get as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => get.mockClear());

describe('reportsApi.daybook', () => {
  it('sends the picked AD date as `date`', async () => {
    await reportsApi.daybook({ date: '2026-09-30' });
    expect(get).toHaveBeenCalledWith('/reports/finance/daybook', { params: { date: '2026-09-30' } });
  });

  it('sends no date param for the default (today) view, and never `bsDate`', async () => {
    await reportsApi.daybook({});
    const params = get.mock.calls[0][1].params;
    expect(params.date).toBeUndefined();
    expect('bsDate' in params).toBe(false);
  });
});
