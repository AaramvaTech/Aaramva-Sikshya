'use client';

import type { ClassWithSections } from '@/types/api.types';

const nativeSelect =
  'h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-white';

interface Props {
  classes: ClassWithSections[] | undefined;
  classId: string;
  sectionId: string;
  /** Called with the full next pair; picking a class clears the section. */
  onChange: (next: { classId: string; sectionId: string }) => void;
  /** Run scoped to one class: only the section select is shown, listing that class's sections. */
  fixedClassId?: string | null;
}

/** Class + Section filter pair shared by the payments list, bill-run review and
 * Record Payment student search. Section options follow the chosen class. */
export function ClassSectionFilter({ classes, classId, sectionId, onChange, fixedClassId }: Props) {
  const effectiveClassId = fixedClassId ?? classId;
  const sections = classes?.find((c) => c.id === effectiveClassId)?.sections ?? [];

  return (
    <>
      {!fixedClassId && (
        <select
          aria-label="Class"
          className={nativeSelect}
          value={classId}
          onChange={(e) => onChange({ classId: e.target.value, sectionId: '' })}
        >
          <option value="">All Classes</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <select
        aria-label="Section"
        className={nativeSelect}
        value={sectionId}
        disabled={!effectiveClassId}
        title={effectiveClassId ? undefined : 'Pick a class first'}
        onChange={(e) => onChange({ classId, sectionId: e.target.value })}
      >
        <option value="">All Sections</option>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </>
  );
}
