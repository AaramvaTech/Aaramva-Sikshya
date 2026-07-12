'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Loader2, Paperclip, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
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
import { uploadFile } from '@/lib/upload';
import { todayBs } from '@/lib/bs-calendar';
import type { AssignmentStatus } from '@/types/api.types';

const STATUS_STYLE: Record<AssignmentStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-meta-4 dark:text-gray-300',
  PUBLISHED: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  CLOSED: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
};

export default function AssignmentsPage() {
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data: classes } = useClasses();
  const { data: classSubjects } = useClassSubjects(classId);
  const { data, isLoading, isError, refetch } = useAssignments({
    page,
    limit: 20,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    subjectId: subjectId || undefined,
    status: status || undefined,
  });

  const [createOpen, setCreateOpen] = useState(false);

  const selectedClass = classes?.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="Homework and assignments — draft, publish, collect and review"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New Assignment
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={classId || 'all'} onValueChange={(v) => { setClassId(!v || v === 'all' ? '' : v); setSectionId(''); setSubjectId(''); setPage(1); }}>
          <SelectTrigger className="w-40">
            <span>{selectedClass?.name ?? 'All classes'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sectionId || 'all'} onValueChange={(v) => { setSectionId(!v || v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <span>{sections.find((s) => s.id === sectionId)?.name ?? 'All sections'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={subjectId || 'all'} onValueChange={(v) => { setSubjectId(!v || v === 'all' ? '' : v); setPage(1); }}>
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

        <Select value={status || 'all'} onValueChange={(v) => { setStatus(!v || v === 'all' ? '' : v); setPage(1); }}>
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
      </div>

      {/* List */}
      {isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-sm" />)}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          icon={ClipboardList}
          message="No assignments yet — create one and publish it to notify the class."
        />
      ) : (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <table className="w-full text-sm">
            <thead className="bg-gray-2 text-left dark:bg-meta-4">
              <tr>
                {['Title', 'Class', 'Subject', 'Due', 'Status', 'Submissions', 'Teacher'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium text-black dark:text-white">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke dark:divide-strokedark">
              {data.data.map((a) => (
                <tr key={a.id} className="hover:bg-gray-1 dark:hover:bg-meta-4/40">
                  <td className="px-4 py-3">
                    <Link href={`/assignments/${a.id}`} className="font-medium text-black hover:text-brand-500 dark:text-white">
                      {a.title}
                    </Link>
                    {a.attachmentKeys.length > 0 && (
                      <Paperclip className="ml-1.5 inline h-3.5 w-3.5 text-gray-400" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {a.className}{a.sectionName ? ` · ${a.sectionName}` : ' · whole class'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{a.subjectName}</td>
                  <td className="px-4 py-3"><BsDate date={a.dueDate} /></td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_STYLE[a.status]} variant="outline">{a.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{a.submissionCount ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500">{a.teacherName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.meta.total > data.meta.limit && (
            <div className="flex items-center justify-between border-t border-stroke px-4 py-3 dark:border-strokedark">
              <span className="text-xs text-gray-500">
                Page {data.meta.page} of {Math.ceil(data.meta.total / data.meta.limit)} — {data.meta.total} assignments
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.meta.total / data.meta.limit)} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <CreateAssignmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

function CreateAssignmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createAssignment = useCreateAssignment();
  const { data: classes } = useClasses();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [attachments, setAttachments] = useState<{ key: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: classSubjects } = useClassSubjects(classId);
  const selectedClass = classes?.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];
  const bsYear = useMemo(() => todayBs().year, []);

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
    setTitle(''); setDescription(''); setClassId(''); setSectionId('');
    setSubjectId(''); setDueDate(''); setAttachments([]);
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
              <Select value={classId} onValueChange={(v) => { setClassId(v ?? ''); setSectionId(''); setSubjectId(''); }}>
                <SelectTrigger>
                  <span>{selectedClass?.name ?? 'Select class'}</span>
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((c) => (
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
                <span key={a.key} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs dark:bg-meta-4">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createAssignment.isPending || uploading}>
            {createAssignment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
