'use client';

import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Download } from 'lucide-react';
import { useBulkAssignJob } from '@/lib/hooks/use-bill-assignment';
import { useJobDownloadUrl } from '@/lib/hooks/use-bill-print';
import {
  normalizeJobFailures, skippedLabel, successLabel, type JobNoun,
} from '@/lib/job-progress';
import { openPresignedUrl, printErrorMessage, POPUP_BLOCKED_MESSAGE } from '@/lib/print-document';

interface BulkJobProgressProps {
  jobId: string;
  /** Resolves a failed row's id to a display name. Falls back to the raw id
   * when the caller doesn't have the roster on hand (e.g. a CLASS-scoped job
   * never separately fetches the class roster client-side — see
   * UI-2-SPEC.md §5.2's known gap). */
  resolveStudentName?: (id: string) => string;
  /**
   * BILL-8-UI Phase 2: what the failing rows ARE. Defaults to 'student' so
   * every pre-existing bulk-assign call site keeps its exact wording without
   * being touched.
   */
  noun?: JobNoun;
  /**
   * Rendered when a completed job carries a `downloadUrl` (bill-print only —
   * bulk-assign jobs produce no artifact). Not auto-opened: the merged PDF can
   * be large, and a surprise tab on job completion is worse than a button.
   */
  downloadLabel?: string;
}

/**
 * Shared job-progress UI (UI-2-SPEC.md §5.2) — deliberately generic over
 * `jobId` so a future BILL-8 bulk-print screen can reuse it verbatim, since
 * the backend's own `GET /finance/jobs/:id` is already shared between the
 * two job types.
 *
 * The server drains PENDING/RUNNING jobs every 10s (bulk-assign.poller.ts)
 * and — for a typical class-sized job — processes every chunk to COMPLETED
 * within that single drain tick, so `processed` can jump straight from 0 to
 * `total` with no visible partial-progress frame at all. A static "0%" bar
 * during the PENDING wait reads as frozen/broken, so PENDING (and RUNNING
 * with nothing processed yet) get their own reassuring "queued" state
 * instead of the progress bar.
 */
export function BulkJobProgress({
  jobId, resolveStudentName, noun = 'student', downloadLabel = 'Download merged PDF',
}: BulkJobProgressProps) {
  const { data: job, isLoading, isError } = useBulkAssignJob(jobId);
  const downloadMutation = useJobDownloadUrl();

  /** Re-presign at click time (A4), then open. Never a stored href. */
  async function handleDownload() {
    try {
      const url = await downloadMutation.mutateAsync(jobId);
      if (!url) {
        toast.error('The merged PDF is no longer available. Try printing again.');
        return;
      }
      if (!openPresignedUrl(url)) toast.error(POPUP_BLOCKED_MESSAGE);
    } catch (err) {
      toast.error(printErrorMessage(err, 'Failed to open the merged PDF'));
    }
  }

  if (isLoading || !job) {
    return (
      <div className="flex items-center justify-center gap-3 py-6 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading job status…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-6 text-center text-sm text-red-500">
        Couldn&apos;t check the job&apos;s status. It may still be running — refresh to check again.
      </div>
    );
  }

  const isQueued = job.status === 'PENDING' || (job.status === 'RUNNING' && job.processed === 0);
  const isDone = job.status === 'COMPLETED';
  const isFailed = job.status === 'FAILED';
  const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <div className="space-y-3 py-2">
      {isQueued && (
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-500" />
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-white">Queued — starting…</p>
            <p className="text-xs text-gray-400">This can take up to 10 seconds before work begins.</p>
          </div>
        </div>
      )}

      {!isQueued && !isFailed && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-800 dark:text-white">
              {isDone ? 'Complete' : 'Assigning…'}
            </span>
            <span className="text-gray-500">{job.processed} / {job.total}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isDone ? 'bg-success-500' : 'bg-brand-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}

      {isFailed && (
        <div className="flex items-center gap-2 text-red-500">
          <XCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">The job failed to run. Try again.</span>
        </div>
      )}

      {isDone && job.failedCount === 0 && (
        <div className="flex items-center gap-2 text-success-600">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="text-xs">{successLabel(job.total, noun)}</span>
        </div>
      )}

      {/* BILL-8-UI Phase 2 — a bill-print job's artifact. Absent on every
          bulk-assign job, so this renders for print only, without a flag.

          A BUTTON, not an <a href>: addendum A4. The presigned URL polled with
          the job is already ageing against its 300s TTL, and polling stops at a
          terminal status — so a dialog left open five minutes would hold a dead
          link. The URL is re-fetched at click time instead, and never rendered
          into the DOM. */}
      {isDone && job.downloadUrl && (
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloadMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-sm bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {downloadMutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />}
          {downloadLabel}
        </button>
      )}

      {isDone && job.failedCount > 0 && (
        <div className="mt-2 overflow-hidden rounded-sm border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            {skippedLabel(job.failedCount, noun)}
          </div>
          <table className="w-full text-xs">
            <tbody>
              {normalizeJobFailures(job.failures).map((f, i) => (
                <tr key={f.id || i} className="border-t border-amber-100 dark:border-amber-900">
                  <td className="px-3 py-1.5 font-mono text-gray-600 dark:text-gray-300">
                    {resolveStudentName?.(f.id) ?? f.id}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">
                    {/* FEE-CLASS-GUARD: `reason` is absent on every failure row
                        written before the guard existed (jsonb, never migrated),
                        and on every bill-print row, so the label is additive and
                        `error` always renders. */}
                    {f.reason === 'CLASS_MISMATCH' && (
                      <span className="mr-1.5 inline-flex items-center rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                        Class mismatch
                      </span>
                    )}
                    {f.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
