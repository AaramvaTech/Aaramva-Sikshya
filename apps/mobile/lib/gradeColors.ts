/**
 * Semantic grade-color palette — legible dark ink on a soft tint.
 * Documented exception on par with attendance STATUS_CONFIG / subject hues —
 * NOT brand-coupled; these are semantic-semantic colors (A=green, B=blue, C=amber, D/E/F=red).
 *
 * Used by both the student results screen and the parent results screen.
 */
export function gradeColors(grade: string | null): { fg: string; bg: string } {
  if (!grade) return { fg: '#475569', bg: '#eef2f6' };
  const u = grade.trim().toUpperCase();
  if (u.startsWith('A')) return { fg: '#065f46', bg: '#d1fae5' };
  if (u.startsWith('B')) return { fg: '#1e40af', bg: '#dbeafe' };
  if (u.startsWith('C')) return { fg: '#92400e', bg: '#fef3c7' };
  if (u.startsWith('D') || u.startsWith('E') || u.startsWith('F')) return { fg: '#991b1b', bg: '#fee2e2' };
  return { fg: '#475569', bg: '#eef2f6' };
}
