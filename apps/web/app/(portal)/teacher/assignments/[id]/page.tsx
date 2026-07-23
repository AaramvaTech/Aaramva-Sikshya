'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Lock,
  Paperclip,
  Send,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { BsDate } from '@/components/shared/bs-date';
import { FileDownloadLink } from '@/components/shared/file-download-link';
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
  useAssignment,
  useAssignmentSubmissions,
  useCloseAssignment,
  usePublishAssignment,
  useReviewSubmission,
} from '@/lib/hooks/use-assignments';
import type { AssignmentStatus, AssignmentSubmission, SubmissionStatus } from '@/types/api.types';

/**
 * WEB-P Phase 2 Task 4 — teacher-portal assignment detail + review.
 *
 * Mirrors apps/web/app/(school)/assignments/[id]/page.tsx's full behavior
 * (due date/description/attachments, status-gated publish/close, submissions
 * table, missing list, review dialog) with the exact same hooks
 * (useAssignment/useAssignmentSubmissions/usePublishAssignment/
 * useCloseAssignment/useReviewSubmission — all unchanged), restyled for
 * PortalShell's rounded-2xl/gray-800 card conventions instead of admin's
 * DevPro (rounded-sm/border-stroke) layout.
 */

const STATUS_STYLE: Record<AssignmentStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  PUBLISHED: 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400',
  CLOSED: 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400',
};

const SUBMISSION_STYLE: Record<SubmissionStatus, string> = {
  SUBMITTED: 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400',
  LATE: 'bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400',
  REVIEWED: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400',
};

export default function TeacherAssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: assignment, isLoading, isError, refetch } = useAssignment(id);
  const submissionsQuery = useAssignmentSubmissions(id);
  const publish = usePublishAssignment();
  const close = useCloseAssignment();

  const [reviewTarget, setReviewTarget] = useState<AssignmentSubmission | null>(null);

  async function handlePublish() {
    try {
      await publish.mutateAsync(id);
      toast.success('Published — the class has been notified');
    } catch {
      toast.error('Failed to publish');
    }
  }

  async function handleClose() {
    try {
      await close.mutateAsync(id);
      toast.success('Assignment closed — submissions are no longer accepted');
    } catch {
      toast.error('Failed to close');
    }
  }

  if (isError) return <QueryErrorState onRetry={() => refetch()} />;
  if (isLoading || !assignment) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const view = submissionsQuery.data;

  return (
    <div className="space-y-6">
      <Link
        href="/teacher/assignments"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
      >
        <ArrowLeft className="h-4 w-4" /> All assignments
      </Link>

      <PageHeader
        title={assignment.title}
        description={`${assignment.className}${assignment.sectionName ? ` · ${assignment.sectionName}` : ' · whole class'} — ${assignment.subjectName} — by ${assignment.teacherName}`}
        action={
          <div className="flex items-center gap-2">
            <Badge className={STATUS_STYLE[assignment.status]} variant="outline">{assignment.status}</Badge>
            {assignment.status === 'DRAFT' && (
              <Button
                className="bg-brand-500 text-white hover:bg-brand-600"
                onClick={handlePublish}
                disabled={publish.isPending}
              >
                {publish.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                Publish
              </Button>
            )}
            {assignment.status === 'PUBLISHED' && (
              <Button variant="outline" onClick={handleClose} disabled={close.isPending}>
                {close.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="mr-1.5 h-4 w-4" />
                )}
                Close
              </Button>
            )}
          </div>
        }
      />

      {/* Details card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">Due: <BsDate date={assignment.dueDate} /></span>
          {assignment.publishedAt && (
            <span className="text-gray-500 dark:text-gray-400">Published: <BsDate date={assignment.publishedAt} /></span>
          )}
        </div>
        {assignment.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{assignment.description}</p>
        )}
        {assignment.attachmentKeys.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
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

      {/* Submissions */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <ClipboardCheck className="h-4 w-4 text-brand-500" />
          <h3 className="font-semibold text-gray-800 dark:text-white">
            Submissions {view ? `(${view.submissions.length})` : ''}
          </h3>
        </div>

        {submissionsQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : submissionsQuery.isError ? (
          <div className="p-5">
            <QueryErrorState onRetry={() => submissionsQuery.refetch()} />
          </div>
        ) : !view?.submissions.length ? (
          <p className="p-5 text-sm text-gray-400">No submissions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left dark:bg-gray-800">
              <tr>
                {['Roll', 'Student', 'Submitted', 'Status', 'Marks', 'Answer / File', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium text-gray-700 dark:text-gray-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {view.submissions.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 font-mono text-gray-500 dark:text-gray-400">{s.rollNumber ?? '—'}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-white">{s.studentName}</td>
                  <td className="px-4 py-2.5"><BsDate date={s.submittedAt} /></td>
                  <td className="px-4 py-2.5">
                    <Badge className={SUBMISSION_STYLE[s.status]} variant="outline">{s.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono">{s.marks ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {s.textAnswer && (
                        <span className="max-w-52 truncate text-gray-500 dark:text-gray-400" title={s.textAnswer}>
                          {s.textAnswer}
                        </span>
                      )}
                      {s.fileKey && (
                        <FileDownloadLink value={s.fileKey} className="text-xs text-brand-600 hover:underline dark:text-brand-400">
                          <Paperclip className="inline h-3 w-3" /> file
                        </FileDownloadLink>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" onClick={() => setReviewTarget(s)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      {s.status === 'REVIEWED' ? 'Re-review' : 'Review'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Missing list — enrolled minus submitted */}
        {view && (
          <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-white">
              <UserX className="h-4 w-4 text-error-500" />
              Missing ({view.missing.length})
            </div>
            {view.missing.length === 0 ? (
              <p className="text-sm text-gray-400">Everyone targeted has submitted.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {view.missing.map((m) => (
                  <span
                    key={m.studentId}
                    className="rounded-full bg-error-50 px-3 py-1 text-xs text-error-600 dark:bg-error-500/10 dark:text-error-400"
                  >
                    {m.rollNumber != null ? `${m.rollNumber} · ` : ''}{m.studentName}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ReviewDialog assignmentId={id} submission={reviewTarget} onClose={() => setReviewTarget(null)} />
    </div>
  );
}

// ── Review dialog ─────────────────────────────────────────────────────────────

function ReviewDialog({
  assignmentId,
  submission,
  onClose,
}: {
  assignmentId: string;
  submission: AssignmentSubmission | null;
  onClose: () => void;
}) {
  const review = useReviewSubmission(assignmentId);
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');

  // Seed fields whenever a new target opens.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (submission && seededFor !== submission.id) {
    setMarks(submission.marks != null ? String(submission.marks) : '');
    setFeedback(submission.feedback ?? '');
    setSeededFor(submission.id);
  }

  async function handleReview() {
    if (!submission) return;
    const parsedMarks = marks.trim() === '' ? undefined : Number(marks);
    if (parsedMarks !== undefined && (Number.isNaN(parsedMarks) || parsedMarks < 0)) {
      return toast.error('Marks must be a non-negative number');
    }
    if (parsedMarks === undefined && !feedback.trim()) {
      return toast.error('Provide marks, feedback, or both');
    }
    try {
      await review.mutateAsync({
        submissionId: submission.id,
        data: {
          ...(parsedMarks !== undefined ? { marks: parsedMarks } : {}),
          ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
        },
      });
      toast.success('Review saved — the student has been notified');
      onClose();
    } catch {
      toast.error('Failed to save review');
    }
  }

  return (
    <Dialog open={!!submission} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review — {submission?.studentName}</DialogTitle>
        </DialogHeader>
        {submission?.textAnswer && (
          <div className="max-h-40 overflow-y-auto rounded-md bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {submission.textAnswer}
          </div>
        )}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Marks</Label>
            <Input value={marks} onChange={(e) => setMarks(e.target.value)} inputMode="decimal" placeholder="e.g. 8.5" />
          </div>
          <div className="space-y-1.5">
            <Label>Feedback</Label>
            <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Good work, but…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-brand-500 text-white hover:bg-brand-600" onClick={handleReview} disabled={review.isPending}>
            {review.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
