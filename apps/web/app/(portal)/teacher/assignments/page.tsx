'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Paperclip, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { BsDate } from '@/components/shared/bs-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useClasses, useClassSubjects } from '@/lib/hooks/use-academic';
import { useAssignments } from '@/lib/hooks/use-assignments';
import { useMySections } from '@/lib/hooks/use-timetable';
import type { AssignmentStatus } from '@/types/api.types';

/**
 * WEB-P Phase 2 Task 4 — teacher-portal assignments list.
 *
 * Reuses useAssignments (Task-supplied hook, unchanged) and useMySections
 * (Task 1) — same data hooks admin's `/assignments` page and the teacher
 * dashboard already use. `GET /assignments` only ever filters by a single
 * classId/sectionId/subjectId/status — there is no "mine" backend filter
 * (ASSIGNMENT_MANAGER_ROLES, which includes TEACHER, is deliberately
 * soft-scoped: any teacher may see/post to any class; accountability lives in
 * createdBy/teacherName, not a query restriction — apps/api/src/modules/
 * assignment/assignment.service.ts + submission.service.ts).
 *
 * Default view ("My classes"): the Class select's options come from
 * useMySections() instead of admin's full school-wide useClasses() cascade,
 * and auto-picks the teacher's first own class (guarded to fire once) so the
 * list opens already narrowed — mirroring the "auto-pick the only one"
 * convention Task 2's attendance picker established, and the same
 * my-scope-first / never-hard-blocked tension Tasks 2 and 3 resolved the
 * same way. An explicit, collapsed-by-default "Browse all classes" link
 * swaps the Class/Section options to the full school-wide cascade
 * (useClasses, admin's exact data source) — soft-scoping is a UX convenience
 * only, so seeing every class is never blocked. The Subject/Status filters
 * are unrestricted in both modes (subjects are a per-class lookup, not an
 * ownership boundary), matching admin exactly.
 */

const STATUS_STYLE: Record<AssignmentStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  PUBLISHED: 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400',
  CLOSED: 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400',
};

export default function TeacherAssignmentsPage() {
  const [scopeAll, setScopeAll] = useState(false);
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  // Guards the "auto-pick my first class" effect so it fires once per scope
  // — reset when the teacher deliberately toggles back from "All classes" to
  // "My classes", so the default re-narrows instead of staying blank.
  const autoSelectedRef = useRef(false);

  const { data: mySections } = useMySections();
  const { data: allClasses } = useClasses();
  const { data: classSubjects } = useClassSubjects(classId);

  const myClasses = useMemo(() => {
    const map = new Map<string, string>();
    (mySections ?? []).forEach((s) => map.set(s.classId, s.className));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [mySections]);

  useEffect(() => {
    if (autoSelectedRef.current || scopeAll || classId) return;
    if (myClasses.length > 0) {
      autoSelectedRef.current = true;
      setClassId(myClasses[0].id);
    }
  }, [scopeAll, classId, myClasses]);

  const classOptions = scopeAll
    ? (allClasses ?? []).map((c) => ({ id: c.id, name: c.name }))
    : myClasses;

  const sectionOptions = scopeAll
    ? (allClasses?.find((c) => c.id === classId)?.sections ?? [])
    : (mySections ?? [])
        .filter((s) => s.classId === classId)
        .map((s) => ({ id: s.sectionId, name: s.sectionName }));

  // Only offer a blank "All classes" item when it wouldn't silently widen the
  // view past what the teacher asked for: always in "Browse all classes"
  // mode, or in "My classes" mode if the teacher has no sections to narrow to.
  const showAllClassesItem = scopeAll || myClasses.length === 0;

  const { data, isLoading, isError, refetch } = useAssignments({
    page,
    limit: 20,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    subjectId: subjectId || undefined,
    status: status || undefined,
  });

  function switchScope(all: boolean) {
    setScopeAll(all);
    setClassId('');
    setSectionId('');
    setSubjectId('');
    setPage(1);
    if (!all) autoSelectedRef.current = false;
  }

  const selectedClassName = classOptions.find((c) => c.id === classId)?.name;
  const selectedSectionName = sectionOptions.find((s) => s.id === sectionId)?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="Homework and assignments — publish, collect and review submissions"
        action={
          // TODO(WEB-P Phase 2 Task 5): wire up assignment creation here.
          // Left visible-but-inert per the Task 4 brief — creation is Task 5's.
          <Button disabled title="Coming soon">
            <Plus className="mr-1.5 h-4 w-4" /> New Assignment
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={classId || 'all'}
          onValueChange={(v) => {
            setClassId(!v || v === 'all' ? '' : v);
            setSectionId('');
            setSubjectId('');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <span>{selectedClassName ?? 'Loading…'}</span>
          </SelectTrigger>
          <SelectContent>
            {showAllClassesItem && <SelectItem value="all">All classes</SelectItem>}
            {classOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sectionId || 'all'}
          onValueChange={(v) => { setSectionId(!v || v === 'all' ? '' : v); setPage(1); }}
        >
          <SelectTrigger className="w-36">
            <span>{selectedSectionName ?? 'All sections'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sectionOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={subjectId || 'all'}
          onValueChange={(v) => { setSubjectId(!v || v === 'all' ? '' : v); setPage(1); }}
        >
          <SelectTrigger className="w-44">
            <span>{classSubjects?.find((cs) => cs.subjectId === subjectId)?.subjectName ?? 'All subjects'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {classSubjects?.map((cs) => (
              <SelectItem key={cs.subjectId} value={cs.subjectId}>{cs.subjectName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status || 'all'}
          onValueChange={(v) => { setStatus(!v || v === 'all' ? '' : v); setPage(1); }}
        >
          <SelectTrigger className="w-36">
            <span>{status || 'All statuses'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(['DRAFT', 'PUBLISHED', 'CLOSED'] as const).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!scopeAll ? (
          <button
            onClick={() => switchScope(true)}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            Browse all classes →
          </button>
        ) : (
          <button
            onClick={() => switchScope(false)}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Back to my classes
          </button>
        )}
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <EmptyState icon={ClipboardList} message="No assignments found for this filter yet." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left dark:bg-gray-800">
              <tr>
                {['Title', 'Class', 'Subject', 'Due', 'Status', 'Submissions', 'Teacher'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.data.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/teacher/assignments/${a.id}`}
                      className="font-medium text-gray-800 hover:text-brand-600 dark:text-white"
                    >
                      {a.title}
                    </Link>
                    {a.attachmentKeys.length > 0 && (
                      <Paperclip className="ml-1.5 inline h-3.5 w-3.5 text-gray-400" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {a.className}{a.sectionName ? ` · ${a.sectionName}` : ' · whole class'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{a.subjectName}</td>
                  <td className="px-4 py-3"><BsDate date={a.dueDate} /></td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_STYLE[a.status]} variant="outline">{a.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{a.submissionCount ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{a.teacherName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.meta.total > data.meta.limit && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {data.meta.page} of {Math.ceil(data.meta.total / data.meta.limit)} — {data.meta.total} assignments
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(data.meta.total / data.meta.limit)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
