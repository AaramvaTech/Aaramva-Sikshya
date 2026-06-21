// Decorative multi-hue palette for timetable subject cards.
//
// These are intentionally NOT the per-school brand color: a timetable reads best
// when each subject is visually distinguishable, so we cycle a fixed set of
// accessible tints. Documented exception to the "tokens only" rule, on par with
// SATURDAY_HIGHLIGHT — these never encode brand identity, only visual separation.
export const SUBJECT_PALETTE = [
  { bg: '#d1fae5', text: '#065f46', bar: '#059669' },
  { bg: '#dbeafe', text: '#1e40af', bar: '#2563eb' },
  { bg: '#ede9fe', text: '#5b21b6', bar: '#7c3aed' },
  { bg: '#fef3c7', text: '#92400e', bar: '#d97706' },
  { bg: '#fce7f3', text: '#9d174d', bar: '#db2777' },
  { bg: '#cffafe', text: '#155e75', bar: '#0891b2' },
  { bg: '#ffedd5', text: '#9a3412', bar: '#ea580c' },
  { bg: '#f0fdf4', text: '#14532d', bar: '#16a34a' },
] as const;

export type SubjectColor = (typeof SUBJECT_PALETTE)[number];

/** Stable colour for a subject by its position in a list. */
export function subjectColor(index: number): SubjectColor {
  return SUBJECT_PALETTE[index % SUBJECT_PALETTE.length];
}
