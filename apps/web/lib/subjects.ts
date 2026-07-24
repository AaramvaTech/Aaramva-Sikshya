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
