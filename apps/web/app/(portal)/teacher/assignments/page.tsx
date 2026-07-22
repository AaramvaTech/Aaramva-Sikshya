'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Loader2, Paperclip, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { todayBs } from 'bs-calendar';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { BsDate } from '@/components/shared/bs-date';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useClasses, useClassSubjects } from '@/lib/hooks/use-academic';
import { useAssignments, useCreateAssignment } from '@/lib/hooks/use-assignments';
import { useMySections } from '@/lib/hooks/use-timetable';
import { uploadFile } from '@/lib/upload';
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
 *
 * Post-review fix (same bug class as Task 3's marks-page race): `classId`
 * resolves asynchronously via the auto-select effect below, which itself
 * depends on the async useMySections() call. On a fresh load of (or deep
 * link into) /teacher/assignments, useMySections and useAssignments both
 * start cold — without a gate, useAssignments would fire once with
 * classId: undefined before mySections resolves (an unfiltered,
 * whole-school list) and render it for at least one paint before the
 * auto-select effect's setClassId triggers a second, correctly-scoped
 * fetch. `scopeReady` (computed below) keeps the query disabled — and a
 * render-level guard keeps the filter bar/table off-screen — until either
 * the teacher explicitly chose "Browse all classes", or useMySections has
 * resolved AND classId has actually been set, or useMySections resolved
 * with zero owned sections (nothing to narrow to, so the unscoped fallback
 * is legitimate, not a race).
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
  const [createOpen, setCreateOpen] = useState(false);

  // Guards the "auto-pick my first class" effect so it fires once per scope
  // — reset when the teacher deliberately toggles back from "All classes" to
  // "My classes", so the default re-narrows instead of staying blank.
  const autoSelectedRef = useRef(false);

  const { data: mySections, isLoading: mySectionsLoading } = useMySections();
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

  // Closes the race described in the doc comment above: true once it's safe
  // to fetch/show an assignments list — either the teacher opted into
  // unrestricted browsing, or useMySections has settled AND either produced
  // a resolved classId (the auto-select effect ran) or genuinely has nothing
  // to narrow to. False while useMySections is still loading, and false for
  // the one transitional render where it just resolved but classId hasn't
  // been set yet (the effect fires after this render commits).
  const scopeReady = scopeAll || (!mySectionsLoading && (myClasses.length === 0 || !!classId));

  const { data, isLoading, isError, refetch } = useAssignments(
    {
      page,
      limit: 20,
      classId: classId || undefined,
      sectionId: sectionId || undefined,
      subjectId: subjectId || undefined,
      status: status || undefined,
    },
    { enabled: scopeReady },
  );

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

  const pageHeader = (
    <PageHeader
      title="Assignments"
      description="Homework and assignments — publish, collect and review submissions"
      action={
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New Assignment
        </Button>
      }
    />
  );

  // Render-level guard (belt-and-suspenders alongside the query-level
  // `enabled: scopeReady` gate above, mirroring Task 3's
  // `if (schedulesLoading) return skeleton`): never show the filter bar or
  // a table while the teacher's own scope is still resolving, so the race
  // is closed even for the one render where a disabled-and-never-fetched
  // TanStack Query's `isLoading` doesn't yet reflect that state.
  if (!scopeReady) {
    return (
      <div className="space-y-6">
        {pageHeader}
        <Skeleton className="h-10 w-full max-w-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <CreateAssignmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pageHeader}

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

      <CreateAssignmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// ── Create dialog ────────────────────────────────────────────────────────────
//
// WEB-P Phase 2 Task 5 — net-new: mobile is view/review-only for teachers, so
// admin's own `/assignments` create dialog (apps/web/app/(school)/assignments/
// page.tsx ~197-360) is the only existing reference. Same fields, same
// backend contract (POST /assignments always creates a DRAFT — there is no
// "publish immediately" option; publishing is Task 4's separate detail-page
// action), same FILE-1 upload flow (`uploadFile(file, 'assignment-attachment')`,
// no base64 fallback — attachments are a new feature, storage must be
// configured, matching admin's own comment on this exact point).
//
// One deliberate difference: the Class/Section pickers default toward the
// teacher's own sections (`useMySections`, Task 1) instead of admin's
// school-wide `useClasses()` cascade — same reasoning as Tasks 2-4's "my
// scope first, never hard-blocked" resolution. A "Browse all classes" link
// (mirroring the list page one component up) swaps to the full cascade, and
// a teacher with zero owned sections falls into that mode automatically
// (nothing to narrow to).
//
// Race-guard note (the same bug class Tasks 3 and 4 each found and fixed):
// `myClasses` is derived from the async `useMySections()` call, and on a
// fresh mount (or the first render after the teacher opens the dialog before
// that query has resolved) an unguarded `myClasses.length === 0` check would
// be indistinguishable from "the teacher genuinely has no sections" — which
// would flash the FULL school-wide class list into the Class select for one
// render before flipping back to "my classes" once the real data arrives.
// Unlike Task 3/4's bug, this never reaches a network call with a wrong
// filter (there is no query keyed on this dialog's `classId` besides
// `useClassSubjects`, which is already internally gated on `!!classId`) —
// but it is the identical "async lookup feeds a render decision with no gate
// tied to its own loading state" shape, so it's closed the same way:
// `effectiveScopeAll` only falls back to the all-classes list once
// `mySectionsLoading` is false, and the Class select shows a "Loading…"
// placeholder (empty options) rather than any class list at all while it
// settles.
function CreateAssignmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createAssignment = useCreateAssignment();
  const { data: mySections, isLoading: mySectionsLoading } = useMySections();
  const { data: allClasses } = useClasses();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scopeAll, setScopeAll] = useState(false);
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [attachments, setAttachments] = useState<{ key: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoSelectedRef = useRef(false);

  const { data: classSubjects } = useClassSubjects(classId);
  const bsYear = useMemo(() => todayBs().year, []);

  const myClasses = useMemo(() => {
    const map = new Map<string, string>();
    (mySections ?? []).forEach((s) => map.set(s.classId, s.className));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [mySections]);

  // See the race-guard note above the component: only treat "zero owned
  // sections" as real once useMySections has actually settled.
  const effectiveScopeAll = scopeAll || (!mySectionsLoading && myClasses.length === 0);

  const classOptions = effectiveScopeAll
    ? (allClasses ?? []).map((c) => ({ id: c.id, name: c.name }))
    : myClasses;

  const sections = effectiveScopeAll
    ? (allClasses?.find((c) => c.id === classId)?.sections ?? [])
    : (mySections ?? [])
        .filter((s) => s.classId === classId)
        .map((s) => ({ id: s.sectionId, name: s.sectionName }));

  const selectedClassName = classOptions.find((c) => c.id === classId)?.name;
  const showBrowseAllLink = !scopeAll && !mySectionsLoading && myClasses.length > 0;

  // Auto-pick the teacher's first own class — same "auto-pick" convention
  // Task 2's attendance picker and this page's own list-filter established.
  // Guarded to fire once, and only while still in "my classes" mode.
  useEffect(() => {
    if (autoSelectedRef.current || effectiveScopeAll || classId) return;
    if (myClasses.length > 0) {
      autoSelectedRef.current = true;
      setClassId(myClasses[0].id);
    }
  }, [effectiveScopeAll, classId, myClasses]);

  async function handleAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (attachments.length >= 5) return toast.error('Maximum 5 attachments');
    if (file.size > 10 * 1024 * 1024) return toast.error('File must be less than 10 MB');
    setUploading(true);
    try {
      // FILE-1 presign flow (kind assignment-attachment). No base64 fallback
      // here — attachments are a new feature, storage must be configured.
      const uploaded = await uploadFile(file, 'assignment-attachment');
      if (uploaded.mode !== 'key') {
        toast.error('File storage is not configured on the server');
        return;
      }
      setAttachments((prev) => [...prev, { key: uploaded.key, name: file.name }]);
    } catch {
      toast.error('Attachment upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function reset() {
    setTitle(''); setDescription(''); setScopeAll(false); setClassId(''); setSectionId('');
    setSubjectId(''); setDueDate(''); setAttachments([]);
    autoSelectedRef.current = false;
  }

  async function handleCreate() {
    if (!title.trim()) return toast.error('Title is required');
    if (!classId) return toast.error('Select a class');
    if (!subjectId) return toast.error('Select a subject');
    if (!dueDate) return toast.error('Pick a due date');
    try {
      await createAssignment.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        classId,
        sectionId: sectionId || undefined,
        subjectId,
        dueDate,
        attachmentKeys: attachments.map((a) => a.key),
      });
      toast.success('Assignment created as DRAFT — publish it to notify the class');
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to create assignment';
      toast.error(msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Assignment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Essay: Rivers of Nepal" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Instructions for students…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select
                value={classId}
                onValueChange={(v) => { setClassId(v ?? ''); setSectionId(''); setSubjectId(''); }}
              >
                <SelectTrigger>
                  <span>
                    {selectedClassName ?? (mySectionsLoading && !scopeAll ? 'Loading…' : 'Select class')}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {classOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select value={sectionId || 'whole'} onValueChange={(v) => setSectionId(!v || v === 'whole' ? '' : v)}>
                <SelectTrigger>
                  <span>{sections.find((s) => s.id === sectionId)?.name ?? 'Whole class'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whole">Whole class</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showBrowseAllLink ? (
            <button
              type="button"
              onClick={() => setScopeAll(true)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              Browse all classes →
            </button>
          ) : scopeAll && myClasses.length > 0 ? (
            <button
              type="button"
              onClick={() => { setScopeAll(false); setClassId(''); setSectionId(''); setSubjectId(''); autoSelectedRef.current = false; }}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ← Back to my classes
            </button>
          ) : null}

          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={(v) => setSubjectId(v ?? '')}>
              <SelectTrigger>
                <span>{classSubjects?.find((cs) => cs.subjectId === subjectId)?.subjectName ?? (classId ? 'Select subject' : 'Select a class first')}</span>
              </SelectTrigger>
              <SelectContent>
                {classSubjects?.map((cs) => (
                  <SelectItem key={cs.subjectId} value={cs.subjectId}>{cs.subjectName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <BsDateInput label="Due date (BS)" value={dueDate} onChange={setDueDate} minYear={bsYear} maxYear={bsYear + 1} />
          <div className="space-y-1.5">
            <Label>Attachments (optional, max 5 × 10 MB)</Label>
            <div className="flex flex-wrap items-center gap-2">
              {attachments.map((a) => (
                <span key={a.key} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs dark:bg-gray-800">
                  <Paperclip className="h-3 w-3" /> {a.name}
                  <button type="button" onClick={() => setAttachments((prev) => prev.filter((x) => x.key !== a.key))}>
                    <X className="h-3 w-3 text-red-500" />
                  </button>
                </span>
              ))}
              <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={handleAttachment} />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1 h-3.5 w-3.5" />}
                Add file
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createAssignment.isPending || uploading}>
            {createAssignment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
