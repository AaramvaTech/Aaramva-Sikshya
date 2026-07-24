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
    // Re-picks a default whenever there's no selection yet, OR the current
    // selection no longer belongs to this roster — the latter case being a
    // same-tab logout+login as a different parent, whose stale
    // selectedChildId otherwise survives in the (unpersisted, in-memory)
    // parent.store untouched, since it doesn't match any child.id here.
    if (children && children.length > 0 && !children.some((c) => c.id === selectedChildId)) {
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
