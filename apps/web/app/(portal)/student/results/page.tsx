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
import { useMyReportCard } from '@/lib/hooks/use-student-me';
import { studentApi } from '@/lib/api/student.api';
import { downloadBlob } from '@/lib/download';
import { getErrorDisplay } from '@/lib/errors';

/**
 * WEB-P Phase 4 Task 7 — student's own results, GET /students/me/report-card.
 *
 * Deliberately reuses `ReportCardView` (components/exams/report-card.tsx) —
 * the exact component already shared with the admin results page — for all
 * on-page rendering (per-exam-type cards, subject breakdown table, annual
 * summary, and its own "Print" button). This page only owns: the
 * loading/error/empty states the shared component has none of, and a
 * SEPARATE "Download report card (PDF)" button. That button is a distinct
 * action from the shared component's browser-print button: it hits
 * GET /students/me/report-card/pdf, a server-generated PDF
 * (studentApi.downloadMyReportCardPdf, a direct authenticated blob fetch —
 * the PDF is built per-request, not a FILE-1 stored object, so there is no
 * presign step), not window.print().
 */
export default function StudentResultsPage() {
  const { data: reportCard, isLoading, isError, refetch } = useMyReportCard();
  const [downloading, setDownloading] = useState(false);

  const isEmpty = !reportCard || reportCard.examResults.length === 0;

  async function handleDownload() {
    if (!reportCard) return;
    setDownloading(true);
    try {
      const res = await studentApi.downloadMyReportCardPdf();
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
        title="My Results"
        description="Your published exam results and annual report card"
        action={
          !isLoading && !isError && !isEmpty ? (
            <Button size="sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download report card (PDF)
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} message="Couldn't load your results." />
      ) : isEmpty ? (
        <EmptyState message="No results published yet." icon={FileX2} />
      ) : (
        <ReportCardView reportCard={reportCard} />
      )}
    </div>
  );
}
