'use client';

import Link from 'next/link';
import { ClipboardList, Paperclip } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { BsDate } from '@/components/shared/bs-date';
import { useMyAssignments } from '@/lib/hooks/use-assignments';
import { assignmentStatusConfig } from '@/lib/assignment-status';
import type { MyAssignment } from '@/types/api.types';

/**
 * WEB-P Phase 4 Task 8 — student's own assignments, GET /assignments/me.
 *
 * A BS-year's worth of assignments comfortably fits in one page — no
 * paginator here (limit: 100, per the task brief). Split into "To submit"
 * (mySubmission === null) and "Submitted" (mySubmission !== null), each a
 * card list. This same query ({ page: 1, limit: 100 }) is reused by the
 * detail screen's cache-lookup-only design — keep the params identical so
 * TanStack Query's cache key matches and the detail page doesn't trigger a
 * second network round trip.
 */
export default function StudentAssignmentsPage() {
  const { data, isLoading, isError, refetch } = useMyAssignments({ page: 1, limit: 100 });

  const assignments = data?.data ?? [];
  const toSubmit = assignments.filter((a) => a.mySubmission === null);
  const submitted = assignments.filter((a) => a.mySubmission !== null);

  return (
    <div className="space-y-6">
      <PageHeader title="Assignments" description="Homework assigned to your class" />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} message="Couldn't load your assignments." />
      ) : assignments.length === 0 ? (
        <EmptyState icon={ClipboardList} message="No assignments yet." />
      ) : (
        <div className="space-y-8">
          <Section title="To submit" items={toSubmit} emptyMessage="Nothing outstanding — you're all caught up." />
          <Section title="Submitted" items={submitted} emptyMessage="Nothing submitted yet." />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: MyAssignment[];
  emptyMessage: string;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {title} <span className="text-gray-400">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <AssignmentRow key={a.id} assignment={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentRow({ assignment: a }: { assignment: MyAssignment }) {
  const chip = assignmentStatusConfig(a);
  return (
    <Link
      href={`/student/assignments/${a.id}`}
      className="block rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm transition-colors hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-700"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-gray-800 dark:text-white">
            {a.title}
            {a.attachmentKeys.length > 0 && <Paperclip className="ml-1.5 inline h-3.5 w-3.5 text-gray-400" />}
          </h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {a.subjectName ?? 'Subject'} · {a.className ?? 'Class'}
            {a.sectionName ? ` · ${a.sectionName}` : ''}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <Badge variant="outline" className={chip.className}>{chip.label}</Badge>
          <span className="text-xs text-gray-400">
            Due <BsDate date={a.dueDate} />
          </span>
        </div>
      </div>
    </Link>
  );
}
