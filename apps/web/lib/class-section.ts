/** "Grade 9 · B" / "Grade 9" / "—". A student's current class and section come
 * from students.class_id / section_id (no enrolment table exists). */
export function formatClassSection(className?: string | null, sectionName?: string | null): string {
  if (!className) return '—';
  return sectionName ? `${className} · ${sectionName}` : className;
}
