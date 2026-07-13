export interface PeriodLike { periodNumber: number; startTime: string; endTime: string; subject: { name: string }; room: string | null; }

/** minutes since midnight for "HH:MM[:SS]" */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** First period starting at/after nowMinutes; null if the school day is over. */
export function nextPeriod(periods: PeriodLike[], nowMinutes: number): PeriodLike | null {
  const upcoming = periods.filter((p) => toMinutes(p.startTime) >= nowMinutes)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  return upcoming[0] ?? null;
}
