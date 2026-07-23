'use client';

import { ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { BsDate } from '@/components/shared/bs-date';
import { ChildSwitcher } from '@/components/parent/child-switcher';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { useMyChildrenAssignments } from '@/lib/hooks/use-assignments';
import type { MyChildAssignments } from '@/types/api.types';

/**
 * WEB-P Phase 5 Task 8 — parent's per-child assignments, view-only.
 *
 * Unlike every other per-child screen in this phase, this one does NOT
 * re-fetch on child-switcher change: `useMyChildrenAssignments()`
 * (GET /assignments/my-children, Task 1) already returns every child's full
 * assignment list in ONE call, already guardian-scoped server-side. Fetch
 * once here, then derive the displayed list client-side via
 * `data?.find((c) => c.studentId === selectedChildId)?.assignments ?? []`
 * whenever the switcher changes — no second network round trip.
 *
 * Status chip: deliberately NOT `assignmentStatusConfig` from
 * `@/lib/assignment-status` — that helper is typed to Phase 4's
 * `MyAssignment` and reads `a.mySubmission?.status`. This screen's rows are
 * `MyChildAssignments['assignments'][number]`, shaped
 * `Assignment & { submission: {status, marks, feedback} | null }` — the
 * field is named `submission` (no `submittedAt`), a different shape, not an
 * interchangeable one. `parentAssignmentStatusChip` below is a local
 * function scoped to this file that mirrors the same 6-state semantics
 * (Reviewed / Submitted late / Submitted / Closed / Overdue / Open) against
 * this screen's actual field names, so the "already submitted/reviewed"
 * states render correctly instead of always falling through to
 * isPastDue/CLOSED/Open (which is what would happen if this screen's data
 * were passed into the Phase 4 helper unadapted — `a.mySubmission` would
 * always read `undefined`, silently masking every submitted/reviewed row).
 *
 * View-only per the locked spec: no click-through to any detail/submit
 * route (parents have none — submission is the student's job). Marks and
 * feedback are rendered directly inline on the card once
 * `submission?.status === 'REVIEWED'`.
 */

type ChildAssignment = MyChildAssignments['assignments'][number];

interface StatusChip {
  label: string;
  className: string;
}

function parentAssignmentStatusChip(a: ChildAssignment): StatusChip {
  if (a.submission?.status === 'REVIEWED') {
    return { label: 'Reviewed', className: 'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400' };
  }
  if (a.submission?.status === 'LATE') {
    return { label: 'Submitted late', className: 'bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400' };
  }
  if (a.submission?.status === 'SUBMITTED') {
    return { label: 'Submitted', className: 'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400' };
  }
  if (a.status === 'CLOSED') {
    return { label: 'Closed', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  }
  const isPastDue = new Date(a.dueDate).getTime() < Date.now();
  if (isPastDue) {
    return { label: 'Overdue', className: 'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400' };
  }
  return { label: 'Open', className: 'bg-brand-50 text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-400' };
}

function AssignmentCard({ assignment: a }: { assignment: ChildAssignment }) {
  const chip = parentAssignmentStatusChip(a);
  const reviewed = a.submission?.status === 'REVIEWED';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/[0.12]">
          <ClipboardList className="h-5 w-5 text-brand-500 dark:text-brand-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{a.title}</p>
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {a.subjectName ?? 'Subject'}
                {a.className ? ` · ${a.className}` : ''}
              </p>
            </div>
            <Badge variant="outline" className={chip.className}>{chip.label}</Badge>
          </div>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Due <BsDate date={a.dueDate} />
          </p>
          {a.description && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{a.description}</p>
          )}
          {reviewed && (
            <div className="mt-3 rounded-lg border border-success-100 bg-success-50/60 p-3 dark:border-success-500/20 dark:bg-success-500/[0.08]">
              <p className="text-xs font-medium text-success-700 dark:text-success-400">
                Marks: {a.submission?.marks ?? '—'}
              </p>
              {a.submission?.feedback && (
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {a.submission.feedback}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ParentAssignmentsPage() {
  const {
    children,
    selectedChildId,
    selectedChild,
    isLoading: childrenLoading,
    isError: childrenError,
  } = useSelectedChild();

  // Fetched ONCE for every child — no per-switch API call. See the module
  // docblock above.
  const {
    data: assignmentsByChild,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
    refetch: refetchAssignments,
  } = useMyChildrenAssignments();

  const header = <PageHeader title="Assignments" description="Your child's homework and submission status" action={<ChildSwitcher />} />;

  // Guards: never let the assignment list render with an empty/undefined
  // studentId. Children still loading, a real fetch error, a genuinely
  // empty roster, and the one-tick window before useSelectedChild()'s
  // effect picks a default child are each handled explicitly and
  // distinctly — same shape as the other per-child screens in this phase.
  if (childrenLoading) {
    return (
      <div className="space-y-5">
        {header}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (childrenError) {
    return (
      <div className="space-y-5">
        {header}
        <QueryErrorState message="Couldn't load your children." />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="space-y-5">
        {header}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <EmptyState message="No children are linked to your account yet." />
        </div>
      </div>
    );
  }

  if (!selectedChildId || !selectedChild) {
    return (
      <div className="space-y-5">
        {header}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const assignments = assignmentsByChild?.find((c) => c.studentId === selectedChildId)?.assignments ?? [];

  return (
    <div className="space-y-5">
      {header}

      {assignmentsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : assignmentsError ? (
        <QueryErrorState onRetry={() => refetchAssignments()} message="Couldn't load assignments." />
      ) : assignments.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <EmptyState message="No assignments for this child yet." icon={ClipboardList} />
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <AssignmentCard key={a.id} assignment={a} />
          ))}
        </div>
      )}
    </div>
  );
}
