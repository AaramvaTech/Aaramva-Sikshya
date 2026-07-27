import { DEFAULT_DUE_DAYS, buildBillRunIdempotencyKey, addDaysToAdString } from '../bill-run.util';

describe('bill-run.util', () => {
  describe('buildBillRunIdempotencyKey', () => {
    it('builds the literal <tenant>:<yearId>:<bsMonth>:<scope>:<classId?> shape', () => {
      expect(buildBillRunIdempotencyKey('demo', 'year-1', 3, 'CLASS', 'class-1'))
        .toBe('demo:year-1:3:CLASS:class-1');
    });

    it('leaves a trailing empty segment when classId is omitted (WHOLE_SCHOOL)', () => {
      expect(buildBillRunIdempotencyKey('demo', 'year-1', 3, 'WHOLE_SCHOOL'))
        .toBe('demo:year-1:3:WHOLE_SCHOOL:');
    });

    it('produces different keys for different classes in the same month', () => {
      const a = buildBillRunIdempotencyKey('demo', 'year-1', 3, 'CLASS', 'class-1');
      const b = buildBillRunIdempotencyKey('demo', 'year-1', 3, 'CLASS', 'class-2');
      expect(a).not.toBe(b);
    });
  });

  describe('addDaysToAdString', () => {
    it('adds days within the same month', () => {
      expect(addDaysToAdString('2026-07-01', 15)).toBe('2026-07-16');
    });

    it('rolls across a month boundary', () => {
      expect(addDaysToAdString('2026-07-25', 15)).toBe('2026-08-09');
    });

    it('rolls across a year boundary', () => {
      expect(addDaysToAdString('2026-12-25', 15)).toBe('2027-01-09');
    });

    it('0 days is a no-op', () => {
      expect(addDaysToAdString('2026-07-01', 0)).toBe('2026-07-01');
    });
  });

  describe('DEFAULT_DUE_DAYS', () => {
    it('is a positive integer', () => {
      expect(Number.isInteger(DEFAULT_DUE_DAYS)).toBe(true);
      expect(DEFAULT_DUE_DAYS).toBeGreaterThan(0);
    });
  });
});
