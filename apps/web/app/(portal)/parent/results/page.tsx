'use client';

import { useState } from 'react';
import { Download, Loader2, FileX2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ReportCardView } from '@/components/exams/report-card';
import { ChildSwitcher } from '@/components/parent/child-switcher';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { useReportCard } from '@/lib/hooks/use-examination';
import { examinationApi } from '@/lib/api/examination.api';
import { downloadBlob } from '@/lib/download';
import { getErrorDisplay } from '@/lib/errors';

/**
 * WEB-P Phase 5 Task 7 — parent's per-child results, GET /exams/results/
 * report-card/:studentId (hard-scoped server-side via assertGuardianOwnsStudent).
 *
 * Reuses `ReportCardView` (components/exams/report-card.tsx) — the exact
 * component already shared with the admin results page and Phase 4's
 * student results screen — for all on-page rendering, with no
 * filterExamTypeId (render everything). This page only owns: the
 * ChildSwitcher header, the loading/error/empty states for the selected
 * child (same pattern as Tasks 4/5's per-child screens), and a "Download
 * report card (PDF)" button.
 *
 * PDF download hits GET /exams/results/report-card/:studentId/pdf —
 * confirmed (examination.controller.ts) to be a DIFFERENT route from
 * Phase 4's /me-family route, but the same direct on-the-fly authenticated
 * blob fetch (application/pdf, @Header + res.setHeader Content-Disposition
 * in buildReportCardPdf), NOT a FILE-1 stored/presigned object — same
 * responseType: 'blob' pattern as studentApi.downloadMyReportCardPdf.
 * Shown only once examResults.length > 0, so the backend's "not published
 * yet" 409 can never be reached from this UI.
 */
export default function ParentResultsPage() {
  const {
    children,
    selectedChildId,
    selectedChild,
    isLoading: childrenLoading,
    isError: childrenError,
  } = useSelectedChild();

  const {
    data: reportCard,
    isLoading: reportLoading,
    isError: reportError,
    refetch: refetchReport,
  } = useReportCard(selectedChildId ?? '');

  const [downloading, setDownloading] = useState(false);

  const header = <PageHeader title="Results" description="Your child's published exam results and annual report card" action={<ChildSwitcher />} />;

  // Guards: never let the report card render or the download fire with an
  // empty/undefined studentId. Children still loading, a real fetch error,
  // a genuinely empty roster, and the one-tick window before
  // useSelectedChild()'s effect picks a default child are each handled
  // explicitly and distinctly — same shape as Tasks 4/5.
  if (childrenLoading) {
    return (
      <div className="space-y-5">
        {header}
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
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
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  const isEmpty = !reportCard || reportCard.examResults.length === 0;

  async function handleDownload() {
    if (!reportCard || !selectedChildId) return;
    setDownloading(true);
    try {
      const res = await examinationApi.downloadReportCardPdf(selectedChildId);
      downloadBlob(res.data as Blob, `report-card-${reportCard.student.admissionNumber}.pdf`);
    } catch (err) {
      toast.error(getErrorDisplay(err).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Results"
        description="Your child's published exam results and annual report card"
        action={
          <div className="flex items-center gap-3">
            <ChildSwitcher />
            {!reportLoading && !reportError && !isEmpty && (
              <Button size="sm" onClick={handleDownload} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download report card (PDF)
              </Button>
            )}
          </div>
        }
      />

      {reportLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : reportError ? (
        <QueryErrorState onRetry={() => refetchReport()} message="Couldn't load this child's results." />
      ) : isEmpty ? (
        <EmptyState message="No results published yet." icon={FileX2} />
      ) : (
        <ReportCardView reportCard={reportCard} />
      )}
    </div>
  );
}
