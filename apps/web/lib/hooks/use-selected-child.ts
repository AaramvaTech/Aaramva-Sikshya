import { useEffect } from 'react';
import { useMyChildren } from '@/lib/hooks/use-students';
import { useParentStore } from '@/store/parent.store';

/**
 * WEB-P Phase 5 — the ONE place "which child is currently selected" is
 * resolved. Every per-child screen reads from this, never useMyChildren()
 * directly, so the default-to-first-child logic and the "children haven't
 * loaded yet" async-gate live in exactly one place (see Global Constraints
 * — this phase's single biggest async-gate surface).
 */
export function useSelectedChild() {
  const { data: children, isLoading, isError } = useMyChildren();
  const selectedChildId = useParentStore((s) => s.selectedChildId);
  const setSelectedChildId = useParentStore((s) => s.setSelectedChildId);

  useEffect(() => {
    if (!selectedChildId && children && children.length > 0) {
      setSelectedChildId(children[0].id);
    }
  }, [selectedChildId, children, setSelectedChildId]);

  const selectedChild = children?.find((c) => c.id === selectedChildId);

  return {
    children: children ?? [],
    selectedChildId,
    selectedChild,
    setSelectedChild: setSelectedChildId,
    isLoading,
    isError,
  };
}
