/**
 * WEB-P Phase 2 Task 6 — extracted from Task 5's inline `effectiveScopeAll`
 * expression (`app/(portal)/teacher/assignments/page.tsx`, CreateAssignmentDialog).
 *
 * Same race shape Tasks 3 and 4 hit as a query-gate bug: `ownedCount` is
 * derived from an async lookup (`useMySections()`), so on a fresh mount
 * `ownedCount === 0` is indistinguishable from "still loading" unless it's
 * ANDed with the loading flag having actually settled. Here the guarded
 * decision feeds a render choice (which class list to show), not a query's
 * `enabled` option — but it's the identical "async value feeds a dependent
 * decision with no gate tied to its own loading state" shape, so it's
 * extracted as a small pure function to pin the contract directly, the same
 * way the `enabled` gates in useStudents/useAssignments are pinned by
 * hook-level tests.
 */
export function resolveScopeReady(
  explicitBrowseAll: boolean,
  sectionsStillLoading: boolean,
  ownedCount: number,
): boolean {
  return explicitBrowseAll || (!sectionsStillLoading && ownedCount === 0);
}
