import { describe, it, expect } from '@jest/globals';
import { nextPeriod } from '../nextPeriod';
const P = (n: number, start: string) => ({ periodNumber: n, startTime: start, endTime: start, subject: { name: `S${n}` }, room: null });

it('returns the next upcoming period', () => {
  const periods = [P(1, '08:00'), P(2, '10:45'), P(3, '13:00')];
  expect(nextPeriod(periods, 9 * 60)?.startTime).toBe('10:45');
});
it('returns null after the last period', () => {
  expect(nextPeriod([P(1, '08:00')], 20 * 60)).toBeNull();
});
it('includes a period starting exactly now', () => {
  expect(nextPeriod([P(2, '10:45')], toMin('10:45'))?.periodNumber).toBe(2);
});
function toMin(s: string) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
