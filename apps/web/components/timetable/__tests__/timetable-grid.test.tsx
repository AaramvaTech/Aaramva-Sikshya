// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TimetableGrid, type NormalizedTimetableSlot } from '../timetable-grid';

// Fixed instant for every test — the weekday is DERIVED from this same
// Date object below, never assumed, so the test doesn't depend on knowing
// what day of the week 2026-07-22 happens to fall on.
const MOCK_NOW = new Date(2026, 6, 22, 10, 30);
const TODAY_KEY = String(MOCK_NOW.getDay());
const OTHER_DAY_KEY = TODAY_KEY === '1' ? '2' : '1';

const CURRENT_SLOT: NormalizedTimetableSlot = {
  slotId: 's1',
  periodNumber: 1,
  startTime: '10:00',
  endTime: '10:45',
  subjectId: 'subj-math',
  subjectName: 'Math',
  subtitle: 'Mr. Sharma',
  room: 'Room 4',
};

const LATER_SLOT: NormalizedTimetableSlot = {
  slotId: 's2',
  periodNumber: 2,
  startTime: '11:00',
  endTime: '11:45',
  subjectId: 'subj-science',
  subjectName: 'Science',
  subtitle: 'Ms. Gurung',
  room: null,
};

const OTHER_DAY_SLOT: NormalizedTimetableSlot = {
  slotId: 's3',
  periodNumber: 1,
  startTime: '10:00',
  endTime: '10:45',
  subjectId: 'subj-math',
  subjectName: 'Math',
  subtitle: 'Mr. Sharma',
  room: 'Room 4',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOCK_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('TimetableGrid', () => {
  it('renders periods and day columns from the normalized schedule', () => {
    render(<TimetableGrid schedule={{ [TODAY_KEY]: [CURRENT_SLOT, LATER_SLOT] }} />);
    expect(screen.getByText('Math')).not.toBeNull();
    expect(screen.getByText('Science')).not.toBeNull();
    expect(screen.getByText('P1')).not.toBeNull();
    expect(screen.getByText('P2')).not.toBeNull();
  });

  it("highlights the slot currently in progress and marks it 'Now'", () => {
    render(<TimetableGrid schedule={{ [TODAY_KEY]: [CURRENT_SLOT, LATER_SLOT] }} />);
    expect(screen.getByText('Now')).not.toBeNull();
    const mathCard = screen.getByText('Math').closest('div');
    expect(mathCard?.className).toContain('ring-2');
  });

  it('does not mark a slot outside the current time range as Now', () => {
    render(<TimetableGrid schedule={{ [TODAY_KEY]: [CURRENT_SLOT, LATER_SLOT] }} />);
    const scienceCard = screen.getByText('Science').closest('div');
    expect(scienceCard?.className).not.toContain('ring-2');
  });

  it('does not mark a same-time slot on a different day as Now', () => {
    render(<TimetableGrid schedule={{ [OTHER_DAY_KEY]: [OTHER_DAY_SLOT] }} />);
    expect(screen.queryByText('Now')).toBeNull();
  });

  it('derives the period time-range subcaption from an actual slot', () => {
    render(<TimetableGrid schedule={{ [TODAY_KEY]: [CURRENT_SLOT] }} />);
    expect(screen.getByText('10:00–10:45')).not.toBeNull();
  });
});
