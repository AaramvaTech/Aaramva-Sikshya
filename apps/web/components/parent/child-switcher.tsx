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
    return (
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {children[0].firstName} {children[0].lastName}
      </span>
    );
  }

  return (
    <Select value={selectedChildId ?? ''} onValueChange={(v) => v && setSelectedChild(v)}>
      <SelectTrigger className="h-9 w-48">
        <span>
          {children.find((c) => c.id === selectedChildId)
            ? `${children.find((c) => c.id === selectedChildId)!.firstName} ${children.find((c) => c.id === selectedChildId)!.lastName}`
            : 'Select child'}
        </span>
      </SelectTrigger>
      <SelectContent>
        {children.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.firstName} {c.lastName}
            {c.currentEnrollment ? ` — ${c.currentEnrollment.className} ${c.currentEnrollment.sectionName}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
