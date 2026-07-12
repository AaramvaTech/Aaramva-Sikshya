import { computeSubmissionStatus, endOfDayInNepal } from '../assignment.util';

/**
 * The late-boundary rule: LATE strictly after the due date's end of day in
 * Asia/Kathmandu (UTC+05:45). 2026-07-12 Nepal ends at 2026-07-12T18:14:59.999Z.
 */
describe('assignment.util — Kathmandu end-of-day boundary', () => {
  const DUE = '2026-07-12';
  const BOUNDARY_MS = Date.parse('2026-07-12T18:14:59.999Z');

  it('computes the boundary instant exactly (23:59:59.999 +05:45)', () => {
    expect(endOfDayInNepal(DUE).getTime()).toBe(BOUNDARY_MS);
  });

  it('the last millisecond of the Nepal day is SUBMITTED', () => {
    expect(computeSubmissionStatus(DUE, BOUNDARY_MS)).toBe('SUBMITTED');
  });

  it('one millisecond later is LATE', () => {
    expect(computeSubmissionStatus(DUE, BOUNDARY_MS + 1)).toBe('LATE');
  });

  it('is NOT fooled by the UTC date still matching (20:00Z = next Nepal day)', () => {
    // 2026-07-12T20:00:00Z is 2026-07-13 01:45 in Kathmandu — LATE, even
    // though a naive toISOString().slice(0,10) comparison would call it on time.
    expect(computeSubmissionStatus(DUE, Date.parse('2026-07-12T20:00:00Z'))).toBe('LATE');
  });

  it('early on the due date (Nepal morning) is SUBMITTED', () => {
    // 2026-07-11T20:00:00Z = 2026-07-12 01:45 Nepal — the due day has begun.
    expect(computeSubmissionStatus(DUE, Date.parse('2026-07-11T20:00:00Z'))).toBe('SUBMITTED');
  });

  it('days before / after are unambiguous', () => {
    expect(computeSubmissionStatus(DUE, Date.parse('2026-07-10T12:00:00Z'))).toBe('SUBMITTED');
    expect(computeSubmissionStatus(DUE, Date.parse('2026-07-14T12:00:00Z'))).toBe('LATE');
  });
});
