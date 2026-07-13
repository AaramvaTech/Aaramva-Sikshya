import { describe, it, expect } from '@jest/globals';
import { todayAttendanceStatus } from '../todayStatus';
it('finds today status', () => {
  expect(todayAttendanceStatus([{ dateAd: '2026-07-13', status: 'PRESENT' }], '2026-07-13')).toBe('PRESENT');
});
it('null when unmarked', () => {
  expect(todayAttendanceStatus([{ dateAd: '2026-07-12', status: 'PRESENT' }], '2026-07-13')).toBeNull();
});
