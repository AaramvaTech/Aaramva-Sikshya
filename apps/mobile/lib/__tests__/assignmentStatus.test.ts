import { describe, it, expect } from '@jest/globals';
import { chipFor, isPastDue, SUBMISSION_CHIPS } from '../assignmentStatus';

const NOW = new Date(2026, 6, 12); // 2026-07-12 local

describe('isPastDue (display-only nudge — server owns the real LATE rule)', () => {
  it('is false on the due day itself', () => {
    expect(isPastDue('2026-07-12', NOW)).toBe(false);
  });
  it('is false before the due day', () => {
    expect(isPastDue('2026-07-13', NOW)).toBe(false);
  });
  it('is true once the calendar day has passed', () => {
    expect(isPastDue('2026-07-11', NOW)).toBe(true);
  });
});

describe('chipFor (the list/detail status chip state machine)', () => {
  it('OPEN when not submitted and not yet due', () => {
    expect(chipFor({ dueDate: '2026-07-13', mySubmission: null }, NOW)).toBe(SUBMISSION_CHIPS.OPEN);
  });

  it('OVERDUE when not submitted and past due', () => {
    expect(chipFor({ dueDate: '2026-07-10', mySubmission: null }, NOW)).toBe(SUBMISSION_CHIPS.OVERDUE);
  });

  it('submission status always wins over overdue emphasis', () => {
    for (const status of ['SUBMITTED', 'LATE', 'REVIEWED'] as const) {
      expect(
        chipFor(
          { dueDate: '2026-07-01', mySubmission: { status, submittedAt: null, marks: null } },
          NOW,
        ),
      ).toBe(SUBMISSION_CHIPS[status]);
    }
  });
});
