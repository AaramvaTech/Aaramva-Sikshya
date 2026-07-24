'use client';

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';

/**
 * WEB-P Phase 5 — dropdown child switcher, rendered in each per-child
 * screen's header. A single child renders as a plain label (no dropdown
 * needed — the common case for many families). Radix/base-ui Select with
 * async-loaded items: computed <span>, never <SelectValue>, per this
 * codebase's established convention.
 */
export function ChildSwitcher() {
  const { children, selectedChildId, setSelectedChild, isLoading } = useSelectedChild();

  if (isLoading) return <Skeleton className="h-9 w-40" />;
  if (children.length === 0) return null;

  if (children.length === 1) {
    const fullName = `${children[0].firstName} ${children[0].lastName}`;
    return (
      <span
        className="block max-w-[180px] truncate text-sm font-medium text-gray-700 dark:text-gray-200"
        title={fullName}
      >
        {fullName}
      </span>
    );
  }

  const selected = children.find((c) => c.id === selectedChildId);
  const selectedName = selected ? `${selected.firstName} ${selected.lastName}` : 'Select child';

  return (
    <Select value={selectedChildId ?? ''} onValueChange={(v) => v && setSelectedChild(v)}>
      <SelectTrigger className="h-9 w-56 sm:w-64" title={selectedName}>
        <span className="block truncate">{selectedName}</span>
      </SelectTrigger>
      <SelectContent>
        {children.map((c) => {
          const label = c.currentEnrollment
            ? `${c.firstName} ${c.lastName} — ${c.currentEnrollment.className} ${c.currentEnrollment.sectionName}`
            : `${c.firstName} ${c.lastName}`;
          return (
            <SelectItem key={c.id} value={c.id} title={label}>
              <span className="block max-w-[280px] truncate">{label}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
