'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { ArrowLeft, Loader2, Lock, Paperclip, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { BsDate } from '@/components/shared/bs-date';
import { FileDownloadLink } from '@/components/shared/file-download-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useMyAssignments, useMySubmission, useSubmitAssignment } from '@/lib/hooks/use-assignments';
import { assignmentStatusConfig } from '@/lib/assignment-status';
import { uploadSubmissionFile, validateSubmissionFile } from '@/lib/submissionUpload';
import { getErrorDisplay } from '@/lib/errors';
import type { AssignmentSubmission, MyAssignment, SubmissionStatus } from '@/types/api.types';

/**
 * WEB-P Phase 4 Task 8 — student assignment detail + submission.
 *
 * There is no student-scoped `GET /assignments/:id` (that route is
 * ASSIGNMENT_MANAGER_ROLES-only and 403s STUDENT) — the assignment is
 * derived from the SAME `useMyAssignments({ page: 1, limit: 100 })` cache
 * the list page reads, looked up by id (mirrors mobile's
 * `assignment-detail.tsx`: `assignments.data?.find((a) => a.id === id)`).
 * A foreign id, or a cache that hasn't loaded yet, renders a "not found"
 * state — this page NEVER attempts a fallback single-assignment fetch.
 */
export default function StudentAssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const assignmentsQuery = useMyAssignments({ page: 1, limit: 100 });
  const submissionQuery = useMySubmission(id);
  const submitAssignment = useSubmitAssignment(id);

  const assignment = assignmentsQuery.data?.data.find((a) => a.id === id);

  if (assignmentsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (assignmentsQuery.isError) {
    return (
      <QueryErrorState onRetry={() => assignmentsQuery.refetch()} message="Couldn't load your assignments." />
    );
  }

  if (!assignment) {
    return (
      <div className="space-y-5">
        <BackLink />
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Assignment not found</p>
          <p className="mt-1 text-sm text-gray-400">It may not be assigned to you, or no longer exists.</p>
        </div>
      </div>
    );
  }

  const chip = assignmentStatusConfig(assignment);

  return (
    <div className="space-y-6">
      <BackLink />

      <PageHeader
        title={assignment.title}
        description={`${assignment.subjectName ?? 'Subject'} · ${assignment.className ?? 'Class'}${assignment.sectionName ? ` · ${assignment.sectionName}` : ''}`}
        action={<Badge variant="outline" className={chip.className}>{chip.label}</Badge>}
      />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Due <BsDate date={assignment.dueDate} />
        </p>
        {assignment.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
            {assignment.description}
          </p>
        )}
        {assignment.attachmentKeys.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {assignment.attachmentKeys.map((key, i) => (
              <FileDownloadLink
                key={key}
                value={key}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-brand-600 hover:underline dark:bg-gray-800 dark:text-brand-400"
              >
                <Paperclip className="h-3 w-3" /> Attachment {i + 1}
              </FileDownloadLink>
            ))}
          </div>
        )}
      </div>

      <SubmissionSection
        assignment={assignment}
        submissionQuery={submissionQuery}
        submitAssignment={submitAssignment}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/student/assignments"
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
    >
      <ArrowLeft className="h-4 w-4" /> All assignments
    </Link>
  );
}

// ── Submission section ──────────────────────────────────────────────────────

function SubmissionSection({
  assignment,
  submissionQuery,
  submitAssignment,
}: {
  assignment: MyAssignment;
  submissionQuery: ReturnType<typeof useMySubmission>;
  submitAssignment: ReturnType<typeof useSubmitAssignment>;
}) {
  const { data: submission, isLoading, isError, refetch } = submissionQuery;

  if (isLoading) {
    return <Skeleton className="h-40 rounded-2xl" />;
  }
  if (isError) {
    return <QueryErrorState onRetry={() => refetch()} message="Couldn't load your submission." />;
  }

  // REVIEWED is a hard stop — genuinely read-only, no form rendered. CLOSED
  // (with no review) blocks new submissions too (the server 409s either
  // way), surfaced as an honest locked note instead of a dead form. Anything
  // short of that — not yet submitted, or SUBMITTED/LATE — is resubmittable.
  const reviewed = submission?.status === 'REVIEWED';
  const closed = assignment.status === 'CLOSED';

  return (
    <div className="space-y-5">
      {submission && <MySubmissionCard submission={submission} />}

      {reviewed ? null : closed ? (
        <LockedNote
          title="Assignment closed"
          message="This assignment is closed and no longer accepts submissions."
        />
      ) : (
        <SubmitForm
          assignmentId={assignment.id}
          hasExisting={!!submission}
          submitAssignment={submitAssignment}
          onSettled={() => refetch()}
        />
      )}
    </div>
  );
}

const SUBMISSION_STYLE: Record<SubmissionStatus, string> = {
  SUBMITTED: 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400',
  LATE: 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400',
  REVIEWED: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400',
};

function MySubmissionCard({ submission }: { submission: AssignmentSubmission }) {
  const reviewed = submission.status === 'REVIEWED';
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white">My submission</h3>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={SUBMISSION_STYLE[submission.status]}>
            {submission.status}
          </Badge>
          {submission.marks != null && (
            <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{submission.marks} marks</span>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Submitted <BsDate date={submission.submittedAt} />
      </p>
      {submission.textAnswer && (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {submission.textAnswer}
        </p>
      )}
      {submission.fileKey && (
        <FileDownloadLink
          value={submission.fileKey}
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-brand-600 hover:underline dark:bg-gray-800 dark:text-brand-400"
        >
          <Paperclip className="h-3 w-3" /> Your file
        </FileDownloadLink>
      )}
      {reviewed && submission.feedback && (
        <div className="mt-4 rounded-lg bg-brand-50 p-3 dark:bg-brand-500/[0.08]">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            Teacher feedback
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
            {submission.feedback}
          </p>
        </div>
      )}
    </div>
  );
}

function LockedNote({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl bg-warning-50 p-4 dark:bg-warning-500/10">
      <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-700 dark:text-warning-400" />
      <div>
        <p className="text-sm font-semibold text-warning-700 dark:text-warning-400">{title}</p>
        <p className="mt-0.5 text-sm text-warning-700 dark:text-warning-400">{message}</p>
      </div>
    </div>
  );
}

// ── Submit / resubmit form ──────────────────────────────────────────────────

function SubmitForm({
  assignmentId,
  hasExisting,
  submitAssignment,
  onSettled,
}: {
  assignmentId: string;
  hasExisting: boolean;
  submitAssignment: ReturnType<typeof useSubmitAssignment>;
  onSettled: () => void;
}) {
  const [textAnswer, setTextAnswer] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'submitting'>('idle');
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = phase !== 'idle' || submitAssignment.isPending;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    const err = validateSubmissionFile(picked);
    if (err) {
      toast.error(err);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setLockedMessage(null);
    setFile(picked);
  }

  function clearFile() {
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit() {
    // Client-side "at least one of text/file" check, mirroring the server's
    // exact rule in submission.service.ts: `!dto.textAnswer?.trim() && !dto.fileKey`.
    if (!textAnswer.trim() && !file) {
      toast.error('Provide a text answer, a file, or both.');
      return;
    }
    setLockedMessage(null);
    try {
      let fileKey: string | undefined;
      if (file) {
        setPhase('uploading');
        fileKey = await uploadSubmissionFile(assignmentId, file);
      }
      setPhase('submitting');
      await submitAssignment.mutateAsync({
        textAnswer: textAnswer.trim() || undefined,
        fileKey,
      });
      toast.success(hasExisting ? 'Resubmitted' : 'Submitted');
      setTextAnswer('');
      clearFile();
      onSettled();
    } catch (err) {
      // A 409 here means the assignment/submission became locked (closed, or
      // already reviewed) between page load and this submit attempt — a
      // distinct "locked" state, not a generic error toast. Mirrors mobile's
      // exact branching in assignment-detail.tsx.
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setLockedMessage(getErrorDisplay(err).message);
        onSettled(); // refetch — pulls the now-authoritative submission/status
      } else {
        toast.error(getErrorDisplay(err).message);
      }
    } finally {
      setPhase('idle');
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white">
        {hasExisting ? 'Resubmit your work' : 'Submit your work'}
      </h3>

      {lockedMessage && (
        <div className="mb-4">
          <LockedNote title="Submission locked" message={lockedMessage} />
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Answer (optional)</Label>
          <Textarea
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            rows={4}
            placeholder="Write your answer…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Attach a file (optional)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="mr-1.5 h-3.5 w-3.5" />
              {file ? 'Change file' : 'Choose file'}
            </Button>
            {file && (
              <span className="inline-flex max-w-52 items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {file.name}
                <button type="button" onClick={clearFile} aria-label="Remove file">
                  <X className="h-3.5 w-3.5 text-red-500" />
                </button>
              </span>
            )}
          </div>
        </div>
        <Button
          className="bg-brand-500 text-white hover:bg-brand-600"
          onClick={handleSubmit}
          disabled={busy}
        >
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          {phase === 'uploading' ? 'Uploading…' : phase === 'submitting' ? 'Submitting…' : hasExisting ? 'Resubmit' : 'Submit'}
        </Button>
      </div>
    </div>
  );
}
