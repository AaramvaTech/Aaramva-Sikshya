/**
 * Trigger a browser file-save for an in-memory Blob. The web app's first
 * blob download (report-card PDFs are generated per-request, not a FILE-1
 * stored key — see studentApi.downloadMyReportCardPdf) — a small reusable
 * primitive rather than one-off inline code, matching how exportToCsv is
 * already the shared primitive for CSV downloads.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
