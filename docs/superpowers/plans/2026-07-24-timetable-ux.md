# Timetable UX + Student Attendance Calendar Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the student attendance calendar's same oversized-grid bug the parent page had, and replace the three near-duplicate per-role timetable tables (student/parent/teacher) with one shared `TimetableGrid` component that adds subject color-coding, a today-column highlight, and a "happening right now" indicator.

**Architecture:** New `apps/web/lib/subjects.ts` (stable per-subject color palette) and new `apps/web/components/timetable/timetable-grid.tsx` (shared, presentation-only grid taking a normalized slot shape). Each of the three timetable pages gains a small `useMemo` that maps its own API response shape into that common shape, then renders `<TimetableGrid />` instead of its own inline `<table>`. The teacher-only `components/timetable/my-timetable-grid.tsx` is retired (its one importer is being rewired). The student attendance page gets the same width-cap + two-column layout the parent page already received.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Vitest + `@testing-library/react` (jsdom).

## Global Constraints

- No backend changes. No change to any data-fetching hook, API client, or existing IDOR scoping (`getSectionTimetable`'s STUDENT/PARENT ownership checks, `GET /timetable/my`'s self-scoping) — this is rendering only. Each page's `sectionId`/timetable-source resolution is untouched; only what happens with the response once fetched changes.
- `TimetableGrid` must not import or depend on any backend API type (`TimetableSlot`, `TeacherSlotItem`) — it only knows `NormalizedTimetableSlot`. Each page owns its own normalization.
- Every existing loading/error/empty-state guard branch on all three timetable pages (including parent's four-way children-loading/error/empty/no-selection chain) must survive byte-identical except for the final "render the real timetable" branch.
- Saturday (`"6"`) is never rendered as a timetable column, matching all three pages' existing convention.
- This project has no `@testing-library/jest-dom` installed — tests use plain vitest matchers (`.not.toBeNull()`, `.toContain()`), never `.toBeInTheDocument()`.
- Baseline confirmed 2026-07-24 in this worktree, before any change in this plan: **334 web tests passing (21 test files)**, `npx tsc --noEmit` clean.
- Full spec: `docs/superpowers/specs/2026-07-24-timetable-ux-design.md`.

---

### Task 1: `lib/subjects.ts` — stable per-subject color palette

**Files:**
- Create: `apps/web/lib/subjects.ts`
- Create: `apps/web/lib/__tests__/subjects.test.ts`

**Interfaces:**
- Produces: `export interface SubjectStyle { bg: string; text: string; border: string }`, `export const SUBJECT_PALETTE: SubjectStyle[]`, `export function subjectColor(subjectId: string): SubjectStyle`. Consumed by Task 2's `TimetableGrid`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/__tests__/subjects.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { subjectColor, SUBJECT_PALETTE } from '../subjects';

describe('subjectColor', () => {
  it('is stable for the same subject id across calls', () => {
    const first = subjectColor('subject-math-101');
    const second = subjectColor('subject-math-101');
    expect(first).toBe(second);
  });

  it('returns a real palette entry, not a fabricated value', () => {
    const style = subjectColor('subject-science-202');
    expect(SUBJECT_PALETTE).toContain(style);
  });

  it('distributes different ids across more than one palette entry', () => {
    const colors = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) => subjectColor(id)),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run lib/__tests__/subjects.test.ts`
Expected: FAIL — `Failed to resolve import "../subjects"` (file doesn't exist yet).

- [ ] **Step 3: Create `subjects.ts`**

Create `apps/web/lib/subjects.ts`:

```ts
/**
 * Decorative multi-hue palette for timetable subject cards (WEB-P timetable
 * UX pass — docs/superpowers/specs/2026-07-24-timetable-ux-design.md).
 *
 * Mirrors the IDEA behind apps/mobile/lib/subjects.ts's SUBJECT_PALETTE/
 * subjectColor() (a documented, reviewed "decorative, not brand-coupled"
 * exception on that platform) — not the code itself (web never imports from
 * mobile). Expressed as Tailwind classes, matching every other color table
 * in this codebase (e.g. the attendance calendars' STATUS_CELL_STYLES)
 * rather than mobile's raw hex objects.
 */
export interface SubjectStyle {
  bg: string;
  text: string;
  border: string;
}

export const SUBJECT_PALETTE: SubjectStyle[] = [
  { bg: 'bg-blue-50 dark:bg-blue-500/[0.12]', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-500' },
  { bg: 'bg-emerald-50 dark:bg-emerald-500/[0.12]', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-500' },
  { bg: 'bg-violet-50 dark:bg-violet-500/[0.12]', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-500' },
  { bg: 'bg-amber-50 dark:bg-amber-500/[0.12]', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-500' },
  { bg: 'bg-pink-50 dark:bg-pink-500/[0.12]', text: 'text-pink-700 dark:text-pink-400', border: 'border-pink-500' },
  { bg: 'bg-cyan-50 dark:bg-cyan-500/[0.12]', text: 'text-cyan-700 dark:text-cyan-400', border: 'border-cyan-500' },
  { bg: 'bg-orange-50 dark:bg-orange-500/[0.12]', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-500' },
  { bg: 'bg-teal-50 dark:bg-teal-500/[0.12]', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-500' },
];

/** Simple, stable string hash (djb2-style) — not cryptographic, just needs
 *  to be deterministic and reasonably well-distributed across the handful
 *  of subjects a school actually has. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Stable color for a subject by id — the SAME subject always gets the SAME
 *  color everywhere it appears on a timetable, regardless of its position
 *  in any particular day's slot list (hashing the id, not a list index). */
export function subjectColor(subjectId: string): SubjectStyle {
  return SUBJECT_PALETTE[hashString(subjectId) % SUBJECT_PALETTE.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run lib/__tests__/subjects.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/subjects.ts apps/web/lib/__tests__/subjects.test.ts
git commit -m "feat(web): add stable per-subject color palette for timetables

New lib/subjects.ts — an 8-color categorical palette keyed by a stable
hash of subject id, mirroring the idea (not the code) behind
apps/mobile/lib/subjects.ts. Not yet consumed anywhere."
```

---

### Task 2: Shared `TimetableGrid` component

**Files:**
- Create: `apps/web/components/timetable/timetable-grid.tsx`
- Create: `apps/web/components/timetable/__tests__/timetable-grid.test.tsx`

**Interfaces:**
- Consumes: `subjectColor` from `@/lib/subjects` (Task 1), `cn` from `@/lib/utils`.
- Produces: `export interface NormalizedTimetableSlot { slotId: string; periodNumber: number; startTime: string; endTime: string; subjectId: string; subjectName: string; subtitle: string; room: string | null }`, `export interface TimetableGridProps { schedule: Record<string, NormalizedTimetableSlot[]> }`, `export function TimetableGrid(props: TimetableGridProps): JSX.Element`. Consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/timetable/__tests__/timetable-grid.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/timetable/__tests__/timetable-grid.test.tsx`
Expected: FAIL — `Failed to resolve import "../timetable-grid"`.

- [ ] **Step 3: Implement `TimetableGrid`**

Create `apps/web/components/timetable/timetable-grid.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { subjectColor } from '@/lib/subjects';

/**
 * Shared weekly timetable grid for the student/parent/teacher portal
 * (WEB-P timetable UX pass — see docs/superpowers/specs/2026-07-24-
 * timetable-ux-design.md). Deliberately knows nothing about the backend's
 * TimetableSlot/TeacherSlotItem shapes — each page normalizes its own data
 * into NormalizedTimetableSlot before rendering, so this component is the
 * ONE place subject-color/today/now logic lives instead of three
 * near-duplicate copies (retiring my-timetable-grid.tsx and the inline
 * tables on the student/parent pages).
 */

export interface NormalizedTimetableSlot {
  slotId: string;
  periodNumber: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  subjectId: string;
  subjectName: string;
  subtitle: string;
  room: string | null;
}

export interface TimetableGridProps {
  schedule: Record<string, NormalizedTimetableSlot[]>;
}

// Sunday-Friday only, matching every existing timetable page's convention —
// Saturday ("6") is never rendered, since it's never a school day here.
const DAYS = [
  { key: '0', label: 'SUN' },
  { key: '1', label: 'MON' },
  { key: '2', label: 'TUE' },
  { key: '3', label: 'WED' },
  { key: '4', label: 'THU' },
  { key: '5', label: 'FRI' },
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function TimetableGrid({ schedule }: TimetableGridProps) {
  // Refreshed every 60s so the "now" ring doesn't go stale on a page left
  // open across a period change — no need for finer precision than that.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayKey = String(now.getDay());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Distinct period numbers actually present across Sun-Fri — no fixed
  // period count, only rows that exist in the data render.
  const periodSet = new Set<number>();
  DAYS.forEach(({ key }) => {
    (schedule[key] ?? []).forEach((slot) => periodSet.add(slot.periodNumber));
  });
  const periods = Array.from(periodSet).sort((a, b) => a - b);

  const slotMap = new Map<string, NormalizedTimetableSlot>();
  DAYS.forEach(({ key }) => {
    (schedule[key] ?? []).forEach((slot) => {
      slotMap.set(`${slot.periodNumber}-${key}`, slot);
    });
  });

  // Each period's canonical time range, derived from the first slot found
  // for that period number on any day — periods only ever appear in
  // `periods` when at least one real slot references them.
  function periodTimeRange(period: number): string {
    for (const day of DAYS) {
      const match = (schedule[day.key] ?? []).find((s) => s.periodNumber === period);
      if (match) return `${match.startTime}–${match.endTime}`;
    }
    return '';
  }

  function isNowSlot(dayKey: string, slot: NormalizedTimetableSlot): boolean {
    return (
      dayKey === todayKey &&
      nowMinutes >= toMinutes(slot.startTime) &&
      nowMinutes < toMinutes(slot.endTime)
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="w-24 border-r border-gray-200 px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                Period
              </th>
              {DAYS.map((day) => {
                const isToday = day.key === todayKey;
                return (
                  <th
                    key={day.key}
                    className={cn(
                      'min-w-[150px] px-3 py-2.5 text-center text-xs font-medium',
                      isToday
                        ? 'font-semibold text-brand-600 dark:text-brand-400'
                        : 'text-gray-500 dark:text-gray-400',
                    )}
                  >
                    {day.label}
                    {isToday && (
                      <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle" />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {periods.map((period) => (
              <tr key={period} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                <td className="border-r border-gray-200 px-3 py-2.5 text-center align-top dark:border-gray-800">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">P{period}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{periodTimeRange(period)}</p>
                </td>
                {DAYS.map((day) => {
                  const slot = slotMap.get(`${period}-${day.key}`);
                  const isToday = day.key === todayKey;
                  if (!slot) {
                    return (
                      <td key={day.key} className="px-2 py-2 text-center align-top">
                        <div
                          className={cn(
                            'h-12 w-full rounded-md border border-dashed border-gray-200 dark:border-gray-800',
                            isToday && 'bg-brand-50/40 dark:bg-brand-500/[0.04]',
                          )}
                        />
                      </td>
                    );
                  }
                  const style = subjectColor(slot.subjectId);
                  const isNow = isNowSlot(day.key, slot);
                  return (
                    <td key={day.key} className="px-2 py-2 text-center align-top">
                      <div
                        className={cn(
                          'relative w-full rounded-md border-l-4 px-2 py-1.5 text-left',
                          style.bg,
                          style.border,
                          isNow && 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-gray-900',
                        )}
                      >
                        {isNow && (
                          <span className="absolute -top-2 right-1 rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                            Now
                          </span>
                        )}
                        <p className={cn('truncate text-xs font-semibold', style.text)}>{slot.subjectName}</p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {slot.subtitle}
                          {slot.room ? ` · ${slot.room}` : ''}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                          <Clock className="h-3 w-3" />
                          {slot.startTime} – {slot.endTime}
                        </p>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Today&apos;s column is highlighted · a ring marks the period happening right now
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/timetable/__tests__/timetable-grid.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/timetable/timetable-grid.tsx apps/web/components/timetable/__tests__/timetable-grid.test.tsx
git commit -m "feat(web): add shared TimetableGrid (subject colors, today/now highlight)

New presentation-only grid taking a normalized slot shape — subject
color-coding, today's column highlighted, the currently-running slot
gets a ring + 'Now' badge (refreshed every 60s), and each period row
shows its canonical time range. Not yet wired into any page."
```

---

### Task 3: Wire teacher's timetable page to `TimetableGrid`, retire `MyTimetableGrid`

**Files:**
- Modify: `apps/web/app/(portal)/teacher/timetable/page.tsx`
- Delete: `apps/web/components/timetable/my-timetable-grid.tsx` (confirmed at plan-writing time: this page is its only importer)

**Interfaces:**
- Consumes: `TimetableGrid`, `NormalizedTimetableSlot` (Task 2). `useMyTimetable()` (unchanged, `@/lib/hooks/use-timetable`).
- No exported interface changes — this is a page component, not a module other files import.

This task has no new automated test — the normalization logic is a straight field-rename map with no branching, and `TimetableGrid` itself is already tested (Task 2). Verified via `tsc --noEmit` + the full suite, consistent with how page-level swaps were verified in the earlier sidebar UI/UX pass.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `apps/web/app/(portal)/teacher/timetable/page.tsx` with:

```tsx
'use client';

import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TimetableGrid, type NormalizedTimetableSlot } from '@/components/timetable/timetable-grid';
import { useMyTimetable } from '@/lib/hooks/use-timetable';

/**
 * WEB-P Phase 3 Task 3 — teacher's own weekly timetable, VIEW-ONLY.
 *
 * Desktop-optimized weekly grid built around `TeacherTimetable` (one
 * teacher, many sections). WEB-P timetable UX pass (2026-07-24): now
 * renders via the shared `TimetableGrid` (subject colors, today/now
 * highlighting) instead of the retired per-role `MyTimetableGrid` — the
 * only page-specific work left here is normalizing `TeacherSlotItem` into
 * the grid's common slot shape (subtitle = "{className} {section}").
 * Data still comes entirely from the already-existing `useMyTimetable()`
 * hook (Phase 2 Task 1) — no new API method or hook needed.
 */
export default function TeacherTimetablePage() {
  const {
    data: timetable,
    isLoading,
    isError,
    refetch,
  } = useMyTimetable();

  // "Any period at all, Sun–Fri" — Saturday ("6") never counts since it's
  // never rendered by the grid either.
  const hasAnySlots = timetable
    ? Object.entries(timetable.schedule).some(
        ([key, slots]) => key !== '6' && slots.length > 0,
      )
    : false;

  const normalizedSchedule = useMemo<Record<string, NormalizedTimetableSlot[]>>(() => {
    if (!timetable) return {};
    const result: Record<string, NormalizedTimetableSlot[]> = {};
    for (const [dayKey, slots] of Object.entries(timetable.schedule)) {
      result[dayKey] = slots.map((slot) => ({
        slotId: slot.slotId,
        periodNumber: slot.periodNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        subjectId: slot.subject.id,
        subjectName: slot.subject.name,
        subtitle: `${slot.className} ${slot.section}`,
        room: slot.room,
      }));
    }
    return result;
  }, [timetable]);

  return (
    <div>
      <PageHeader
        title="My Timetable"
        description="Your weekly teaching schedule across all assigned sections"
      />

      {isLoading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : !timetable || !hasAnySlots ? (
        <EmptyState
          message="No timetable slots have been assigned to you yet."
          icon={CalendarClock}
        />
      ) : (
        <TimetableGrid schedule={normalizedSchedule} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete the retired component**

```bash
rm apps/web/components/timetable/my-timetable-grid.tsx
```

- [ ] **Step 3: Run tsc to confirm no dangling imports**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 4: Run the full suite to confirm no regressions**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 342 tests (334 baseline + 3 subjects.ts + 5 TimetableGrid), 23 test files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(portal\)/teacher/timetable/page.tsx apps/web/components/timetable/my-timetable-grid.tsx
git commit -m "refactor(web): teacher timetable uses shared TimetableGrid

Normalizes TeacherSlotItem into the grid's common shape and retires
MyTimetableGrid (its only importer). Loading/error/empty states unchanged."
```

---

### Task 4: Wire student's timetable page to `TimetableGrid`

**Files:**
- Modify: `apps/web/app/(portal)/student/timetable/page.tsx`

**Interfaces:**
- Consumes: `TimetableGrid`, `NormalizedTimetableSlot` (Task 2). `useStudentMeProfile()`, `useSectionTimetable()` (both unchanged).

No new automated test — same reasoning as Task 3. Verified via `tsc --noEmit` + full suite.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `apps/web/app/(portal)/student/timetable/page.tsx` with:

```tsx
'use client';

import { useMemo } from 'react';
import { CalendarClock, GraduationCap } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TimetableGrid, type NormalizedTimetableSlot } from '@/components/timetable/timetable-grid';
import { useStudentMeProfile } from '@/lib/hooks/use-student-me';
import { useSectionTimetable } from '@/lib/hooks/use-academic';

/**
 * WEB-P Phase 4 Task 4 — student's own weekly timetable, VIEW-ONLY.
 *
 * `sectionId` comes exclusively from the student's own enrollment
 * (`GET /students/me` via Task 2's `useStudentMeProfile`) — never a route
 * param or user-suppliable value — and feeds `GET /timetable/section/:id`
 * (Task 1 hardened that route's STUDENT-role scoping: a student may only
 * ever resolve their own section's timetable; any other section's id now
 * 403s FORBIDDEN_SCOPE instead of leaking that section's real schedule).
 *
 * WEB-P timetable UX pass (2026-07-24): renders via the shared
 * `TimetableGrid` (subject colors, today/now highlighting) instead of an
 * inline `<table>` — the only page-specific work left here is normalizing
 * `TimetableSlot` into the grid's common slot shape (subtitle =
 * teacher.fullName).
 */

// Sunday–Friday only. Saturday ("6") is never rendered as a column — no
// school that day, so an always-empty column would be pure noise.
const DAY_KEYS = ['0', '1', '2', '3', '4', '5'];

export default function StudentTimetablePage() {
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useStudentMeProfile();
  const sectionId = profile?.currentEnrollment?.sectionId;
  const {
    data: timetable,
    isLoading,
    isError,
    refetch,
  } = useSectionTimetable(sectionId ?? '');

  // sectionId only exists once the profile query resolves — the timetable
  // query correctly sits disabled (isLoading: false) until then, so without
  // folding profileLoading in here this screen would flash "no timetable"
  // for one frame before the real, gated fetch even starts.
  const loading = profileLoading || (!!sectionId && isLoading);

  const hasAnySlots = timetable
    ? DAY_KEYS.some((key) => (timetable.schedule[key] ?? []).length > 0)
    : false;

  const normalizedSchedule = useMemo<Record<string, NormalizedTimetableSlot[]>>(() => {
    if (!timetable) return {};
    const result: Record<string, NormalizedTimetableSlot[]> = {};
    for (const [dayKey, slots] of Object.entries(timetable.schedule)) {
      result[dayKey] = slots.map((slot) => ({
        slotId: slot.slotId,
        periodNumber: slot.periodNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        subjectId: slot.subject.id,
        subjectName: slot.subject.name,
        subtitle: slot.teacher.fullName,
        room: slot.room,
      }));
    }
    return result;
  }, [timetable]);

  const notEnrolled = !profile?.currentEnrollment;

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Timetable"
        description={
          timetable ? `${timetable.className} · ${timetable.sectionName}` : 'Your weekly class schedule'
        }
      />

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : profileError ? (
        <QueryErrorState onRetry={() => refetchProfile()} message="Couldn't load your profile." />
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} message="Couldn't load your timetable." />
      ) : notEnrolled || !hasAnySlots ? (
        <EmptyState
          message={
            notEnrolled
              ? "You're not enrolled in a section yet."
              : 'No timetable slots have been assigned to your section yet.'
          }
          icon={notEnrolled ? GraduationCap : CalendarClock}
        />
      ) : (
        <TimetableGrid schedule={normalizedSchedule} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 3: Run the full suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 342 tests, 23 test files (unchanged from Task 3).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(portal\)/student/timetable/page.tsx
git commit -m "refactor(web): student timetable uses shared TimetableGrid

Normalizes TimetableSlot into the grid's common shape. Every guard
branch (loading/profile-error/timetable-error/not-enrolled/no-slots)
unchanged; sectionId still resolves exclusively from the student's own
enrollment."
```

---

### Task 5: Wire parent's timetable page to `TimetableGrid`

**Files:**
- Modify: `apps/web/app/(portal)/parent/timetable/page.tsx`

**Interfaces:**
- Consumes: `TimetableGrid`, `NormalizedTimetableSlot` (Task 2). `useSelectedChild()`, `useSectionTimetable()` (both unchanged).

No new automated test — same reasoning as Task 3.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `apps/web/app/(portal)/parent/timetable/page.tsx` with:

```tsx
'use client';

import { useMemo } from 'react';
import { CalendarClock, GraduationCap, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TimetableGrid, type NormalizedTimetableSlot } from '@/components/timetable/timetable-grid';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { useSectionTimetable } from '@/lib/hooks/use-academic';

/**
 * WEB-P Phase 5 Task 5 — parent's per-child weekly timetable, VIEW-ONLY.
 * HIGHEST SCRUTINY screen this phase: calls `GET /timetable/section/:sectionId`,
 * the exact route Phase 4 found and fixed a STUDENT-branch IDOR gap in.
 *
 * Independent re-verification (done before writing this file, by reading
 * `apps/api/src/modules/academic/timetable.service.ts` directly — not by
 * trusting `docs/web/phase-5-idor-audit.md` §3, which was only read
 * afterward to cross-check): `getSectionTimetable`'s `Role.PARENT` branch
 * (lines 57-66) runs a real ownership check —
 *
 *   SELECT s.id FROM students s
 *   JOIN guardians g ON g.student_id = s.id
 *   WHERE g.user_id = $1::uuid AND s.section_id = $2::uuid AND s.deleted_at IS NULL
 *
 * — and throws ForbiddenException(errorBody('FORBIDDEN_SCOPE')) when no row
 * matches. This check sits at the very top of the method, before the single
 * unconditional `timetable_slots` SELECT that produces the response for
 * every caller (PARENT, STUDENT, and staff roles alike) — there is no
 * PARENT-reachable path through this function that returns slot data
 * without first passing that guard. The audit doc matched exactly; no
 * gap found, nothing to block on.
 *
 * `sectionId` comes EXCLUSIVELY from the selected child's own enrollment
 * (`GET /students/my-children` via `useSelectedChild()` → `useMyChildren()`)
 * — never a route param, never user-typed, never any other source. The
 * server re-verifies guardianship of that exact sectionId regardless, but
 * the UI must not undermine that by offering any way to request a
 * different one.
 *
 * WEB-P timetable UX pass (2026-07-24): renders via the shared
 * `TimetableGrid` (subject colors, today/now highlighting) instead of an
 * inline `<table>` — the only page-specific work left here is normalizing
 * `TimetableSlot` into the grid's common slot shape (subtitle =
 * teacher.fullName), identical to the student page's normalization.
 */

// Sunday-Friday only. Saturday ("6") is never rendered as a column — no
// school that day, so an always-empty column would be pure noise. Matches
// the student timetable page's convention exactly.
const DAY_KEYS = ['0', '1', '2', '3', '4', '5'];

export default function ParentTimetablePage() {
  const {
    children,
    selectedChildId,
    selectedChild,
    isLoading: childrenLoading,
    isError: childrenError,
  } = useSelectedChild();

  // The ONLY source for sectionId — never a route param, never user input.
  const sectionId = selectedChild?.currentEnrollment?.sectionId ?? '';

  const {
    data: timetable,
    isLoading: timetableLoading,
    isError: timetableError,
    refetch: refetchTimetable,
  } = useSectionTimetable(sectionId);

  const normalizedSchedule = useMemo<Record<string, NormalizedTimetableSlot[]>>(() => {
    if (!timetable) return {};
    const result: Record<string, NormalizedTimetableSlot[]> = {};
    for (const [dayKey, slots] of Object.entries(timetable.schedule)) {
      result[dayKey] = slots.map((slot) => ({
        slotId: slot.slotId,
        periodNumber: slot.periodNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        subjectId: slot.subject.id,
        subjectName: slot.subject.name,
        subtitle: slot.teacher.fullName,
        room: slot.room,
      }));
    }
    return result;
  }, [timetable]);

  const header = (
    <PageHeader
      title="Timetable"
      description={
        timetable ? `${timetable.className} · ${timetable.sectionName}` : "Your child's weekly class schedule"
      }
    />
  );

  // ── State (a): children still loading ─────────────────────────────────
  if (childrenLoading) {
    return (
      <div className="space-y-5">
        {header}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (childrenError) {
    return (
      <div className="space-y-5">
        {header}
        <QueryErrorState message="Couldn't load your children." />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="space-y-5">
        {header}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <EmptyState message="No children are linked to your account yet." icon={Users} />
        </div>
      </div>
    );
  }

  if (!selectedChildId || !selectedChild) {
    // Children have loaded but useSelectedChild()'s effect hasn't picked a
    // default child yet (one-render window) — show a skeleton, never fire
    // the timetable query with an empty-string sectionId.
    return (
      <div className="space-y-5">
        {header}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── State (b): selected child has no currentEnrollment at all ─────────
  const notEnrolled = !selectedChild.currentEnrollment;

  // ── State (d): the timetable query's own error state, surfaced (not
  //    swallowed — the exact bug Phase 4's review caught on the student
  //    screen). Checked before the "loading" / "no slots" branches below so
  //    a genuine backend outage can never misrender as either empty state.
  if (!notEnrolled && timetableError) {
    return (
      <div className="space-y-5">
        {header}
        <QueryErrorState onRetry={() => refetchTimetable()} message="Couldn't load this child's timetable." />
      </div>
    );
  }

  const loading = !notEnrolled && timetableLoading;
  const hasAnySlots = timetable ? DAY_KEYS.some((key) => (timetable.schedule[key] ?? []).length > 0) : false;

  return (
    <div className="space-y-5">
      {header}

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 * 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : notEnrolled ? (
        // ── State (b): not enrolled in a section ──────────────────────
        <EmptyState
          message={`${selectedChild.firstName} is not enrolled in a section yet.`}
          icon={GraduationCap}
        />
      ) : !hasAnySlots ? (
        // ── State (c): enrolled, but zero timetable slots — a DIFFERENT
        //    empty state from (b), never the same copy. ────────────────
        <EmptyState
          message="No timetable has been published for this section yet."
          icon={CalendarClock}
        />
      ) : (
        <TimetableGrid schedule={normalizedSchedule} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 3: Run the full suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 342 tests, 23 test files (unchanged from Task 4).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(portal\)/parent/timetable/page.tsx
git commit -m "refactor(web): parent timetable uses shared TimetableGrid

Normalizes TimetableSlot into the grid's common shape. Every guard
branch (children-loading/error/empty/no-selection/not-enrolled/
timetable-error/no-slots) unchanged; the re-verified PARENT ownership
check on GET /timetable/section/:sectionId is untouched — this is a
rendering-only change."
```

---

### Task 6: Cap the student attendance calendar width + two-column layout

**Files:**
- Modify: `apps/web/app/(portal)/student/attendance/page.tsx` (JSX structure only — no hook, prop, or handler changes)

**Interfaces:**
- No interface changes — every hook call and the `CountTile` sub-component are unchanged. Only the wrapping JSX inside the final `return` statement changes.

Same reasoning as the parent attendance calendar fix shipped earlier today: Tailwind layout classes only, no new conditional logic. Verified via `tsc --noEmit` + full suite, not a new component test.

- [ ] **Step 1: Replace the final `return` block**

In `apps/web/app/(portal)/student/attendance/page.tsx`, everything before the final `return (` (the `today`/`view` state, `useMyAttendanceSummary`/`useMyAttendanceHistory` calls, `monthInfo`/`historyMap`/`monthCounts`/`cells` memos, `goToMonth`/`goToToday`, `isCurrentMonth`/`monthLabel`) is unchanged. Replace the `return (...)` statement (currently starting at `return (` and running to the end of the file) with:

```tsx
  return (
    <div className="space-y-5">
      <PageHeader title="My Attendance" description="Your attendance record, by Bikram Sambat month" />

      {/* Year-to-date stat card — sourced directly from the backend's official
          figure, never client-recomputed. Stays full-width and first: the
          headline number deserves top billing regardless of viewport. */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        {summaryError ? (
          <QueryErrorState onRetry={() => refetchSummary()} message="Couldn't load your attendance summary." />
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/[0.12]">
                <CalendarCheck2 className="h-7 w-7 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                  Year-to-date attendance
                  {summary?.academicYearName ? ` · ${summary.academicYearName}` : ''}
                </p>
                {summaryLoading ? (
                  <Skeleton className="mt-1 h-9 w-24" />
                ) : (
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {summary ? `${summary.attendancePercent}%` : '—'}
                  </p>
                )}
              </div>
            </div>
            {!summaryLoading && summary && (
              <div className="grid grid-cols-4 gap-3">
                <CountTile
                  label="Present"
                  value={summary.present}
                  textClass="text-success-700 dark:text-success-400"
                  isLoading={false}
                />
                <CountTile
                  label="Absent"
                  value={summary.absent}
                  textClass="text-error-700 dark:text-error-400"
                  isLoading={false}
                />
                <CountTile
                  label="Late"
                  value={summary.late}
                  textClass="text-warning-700 dark:text-warning-400"
                  isLoading={false}
                />
                <CountTile
                  label="Leave"
                  value={summary.leave}
                  textClass="text-brand-700 dark:text-brand-400"
                  isLoading={false}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* WEB-P timetable UX pass (2026-07-24, see docs/superpowers/specs/
          2026-07-24-timetable-ux-design.md §3): calendar + its month nav
          live in a width-capped left column so day cells never scale with
          the full page width; the freed space on wide screens holds the
          monthly summary strip instead of sitting empty. Stacks to one
          column below xl:. Mirrors the parent attendance page's identical
          fix (docs/superpowers/specs/2026-07-24-portal-shell-sidebar-
          design.md §5.1) — student has no leave-request form to pair with
          the calendar, so the summary strip fills that role instead. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,560px)_1fr] xl:items-start">
        <div className="mx-auto w-full max-w-[560px] space-y-5 xl:mx-0">
          {/* Month nav */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" onClick={() => goToMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="w-40 text-center text-base font-semibold text-gray-900 dark:text-white sm:w-48 sm:text-lg">
                {monthLabel}
              </p>
              <Button variant="outline" size="icon-sm" onClick={() => goToMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={goToToday} disabled={isCurrentMonth}>
              Today
            </Button>
          </div>

          {/* Calendar grid */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
            {historyError ? (
              <QueryErrorState onRetry={() => refetchHistory()} message="Couldn't load this month's attendance." />
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {DAY_HEADERS.map((label, i) => (
                    <div
                      key={label}
                      className={cn(
                        'py-1 text-center text-xs font-semibold uppercase tracking-wide',
                        i === 6 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500',
                      )}
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
                  {historyLoading
                    ? Array.from({ length: 35 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-square w-full rounded-lg" />
                      ))
                    : cells.map((cell, idx) => {
                        if (!cell) return <div key={`blank-${idx}`} aria-hidden />;
                        const status = historyMap.get(cell.dateAd);
                        const style = status && status in STATUS_CELL_STYLES ? STATUS_CELL_STYLES[status as StatusKey] : undefined;
                        return (
                          <div
                            key={cell.dateAd}
                            title={cell.dateAd}
                            className={cn(
                              'flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg text-sm font-semibold',
                              // A real recorded status always wins. Saturday's amber/muted
                              // background is only the fallback for a Saturday cell with no
                              // recorded status (the common case, since Saturday is normally
                              // a non-school day) — mirrors mobile's AttendanceCalendar
                              // precedence (`cfg ? cfg.bg : isSat ? SATURDAY_HIGHLIGHT.bg : ...`).
                              style
                                ? cn(style.bg, style.text)
                                : cell.isSaturday
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/[0.08] dark:text-amber-400'
                                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
                              cell.isToday && 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-gray-900',
                            )}
                          >
                            <span>{cell.day}</span>
                            {style && <span className={cn('h-1 w-1 rounded-full', style.dot)} />}
                          </div>
                        );
                      })}
                </div>

                {/* Legend */}
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                  {LEGEND_ITEMS.map(({ status, label }) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_CELL_STYLES[status].dot)} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 dark:bg-amber-500/70" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Saturday (non-school day)</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {/* Raw-counts summary strip for the visible month — plain tallies from
              the fetched day rows, no percentage claim here (see design-decision
              note above). */}
          {!historyError && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="mb-3 text-theme-sm font-medium text-gray-700 dark:text-gray-300">{monthLabel} summary</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountTile
                  label="Present"
                  value={monthCounts.PRESENT}
                  textClass="text-success-700 dark:text-success-400"
                  isLoading={historyLoading}
                />
                <CountTile
                  label="Absent"
                  value={monthCounts.ABSENT}
                  textClass="text-error-700 dark:text-error-400"
                  isLoading={historyLoading}
                />
                <CountTile
                  label="Late"
                  value={monthCounts.LATE}
                  textClass="text-warning-700 dark:text-warning-400"
                  isLoading={historyLoading}
                />
                <CountTile
                  label="Leave"
                  value={monthCounts.LEAVE}
                  textClass="text-brand-700 dark:text-brand-400"
                  isLoading={historyLoading}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 3: Run the full suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 342 tests, 23 test files (unchanged from Task 5).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(portal\)/student/attendance/page.tsx
git commit -m "fix(web): cap student attendance calendar width, stop wasting space

Same fix as the parent attendance page shipped earlier today: calendar
+ month nav move into a max-w-[560px] column. At xl: breakpoints the
freed space holds the monthly summary strip instead of sitting empty
below a full-bleed calendar (no leave-request form exists on this page
to pair with, unlike parent's)."
```

---

### Task 7: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 2: Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 342 tests, 23 test files (334 baseline + 8 new: 3 subjects.ts + 5 TimetableGrid).

- [ ] **Step 3: Confirm no dangling references to the retired component**

Run: `grep -rn "MyTimetableGrid\|my-timetable-grid" apps/web --include="*.tsx" --include="*.ts"`
Expected: no matches.

- [ ] **Step 4: Confirm every timetable page's guard branches are unchanged**

Read the final `student/timetable/page.tsx` and `parent/timetable/page.tsx` and confirm every loading/error/empty-state branch (including parent's four-way children-loading/error/empty/no-selection chain and the `notEnrolled`/`timetableError` states) matches the pre-change versions exactly — only the final "real timetable" branch should differ (swapped for `<TimetableGrid />`, plus the new `normalizedSchedule` memo). This is the same discipline Task 7 Step 4 used in the sidebar UI/UX pass plan: confirm by direct comparison, not by re-trusting the diff summary.

- [ ] **Step 5: Confirm scope boundaries held**

Run: `git diff --stat 1a35c77..HEAD` (the design-spec-only commit made before Task 1 began)
Expected: only these files (plus their new `__tests__` files) appear: `apps/web/lib/subjects.ts`, `apps/web/components/timetable/timetable-grid.tsx`, `apps/web/components/timetable/my-timetable-grid.tsx` (deleted), `apps/web/app/(portal)/teacher/timetable/page.tsx`, `apps/web/app/(portal)/student/timetable/page.tsx`, `apps/web/app/(portal)/parent/timetable/page.tsx`, `apps/web/app/(portal)/student/attendance/page.tsx`. No file under `apps/api/`, no other portal screen.

---

## Self-Review Notes

**Spec coverage:** §3 (student calendar fix) → Task 6. §4.2 (normalized slot shape) → Task 2. §4.3 (subject colors) → Task 1. §4.4 (today/now highlighting) → Task 2. §4.5 (period-time subcaption) → Task 2. §4.6 (legend caption) → Task 2. §5 (page wiring + `MyTimetableGrid` retirement) → Tasks 3, 4, 5. §6 (preserved invariants) → Task 7 Steps 3–4. §7 (testing approach) → Tasks 1, 2 (new tests), Tasks 3–6 (no new tests, documented why). §8 (non-goals) → Global Constraints.

**Placeholder scan:** no TBD/TODO markers; every step has complete code.

**Type consistency:** `NormalizedTimetableSlot` (Task 2) is defined once in `timetable-grid.tsx` and imported identically by Tasks 3, 4, 5 — same field names (`subjectId`, `subjectName`, `subtitle`, `room`) used in every normalization `useMemo`. `SubjectStyle`/`subjectColor` (Task 1) consumed only by `TimetableGrid` (Task 2), never re-implemented per page. `TimetableGridProps.schedule`'s key type (`Record<string, NormalizedTimetableSlot[]>`) matches what every page's `useMemo` produces.
