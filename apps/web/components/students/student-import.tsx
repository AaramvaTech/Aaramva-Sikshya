'use client';

import { useRef, useState } from 'react';
import { Upload, Download, CheckCircle2, XCircle, Copy, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { studentsApi } from '@/lib/api/students.api';
import { useImportPreview, useImportCommit } from '@/lib/hooks/use-students';
import type { ImportPreviewResult, ImportCommitResult } from '@/types/api.types';

// Display columns map to the backend's normalized header keys.
const COLS: [string, string][] = [
  ['firstname', 'First'],
  ['lastname', 'Last'],
  ['dobbs', 'DOB (BS)'],
  ['gender', 'Gender'],
  ['class', 'Class'],
  ['section', 'Section'],
  ['guardianphone', 'Guardian Ph.'],
  ['guardianemail', 'Guardian Email'],
];

const STATUS_STYLE: Record<string, string> = {
  valid: 'bg-success-50 text-success-700 ring-green-200',
  invalid: 'bg-error-50 text-error-700 ring-red-200',
  duplicate: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
};

export function StudentImport({ onCommitted }: { onCommitted?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const previewMut = useImportPreview();
  const commitMut = useImportCommit();

  async function downloadTemplate() {
    try {
      const res = await studentsApi.importTemplate();
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student-import-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download the template');
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    setResult(null);
    setPreview(null);
    try {
      const p = await previewMut.mutateAsync(text);
      setPreview(p);
    } catch {
      toast.error('Could not read that CSV. Check the format against the template.');
    }
  }

  async function commit() {
    if (!csv) return;
    try {
      const r = await commitMut.mutateAsync(csv);
      setResult(r);
      toast.success(`Imported ${r.summary.created} student(s)`);
      onCommitted?.();
    } catch {
      toast.error('Import failed');
    }
  }

  const valid = preview?.summary.valid ?? 0;

  return (
    <div className="space-y-5">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" /> {fileName ? 'Choose another CSV' : 'Upload CSV'}
        </Button>
        <Button variant="ghost" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" /> Download template
        </Button>
        {fileName && (
          <span className="flex items-center gap-1.5 text-sm text-gray-500">
            <FileSpreadsheet className="h-4 w-4" /> {fileName}
          </span>
        )}
        {previewMut.isPending && <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
      </div>

      {!fileName && (
        <p className="text-sm text-gray-500">
          Upload a CSV of students and their primary guardian. Download the template for the exact columns
          (Class &amp; Section must match the grades/sections you created in setup). Nothing is saved until you confirm.
        </p>
      )}

      {/* Preview */}
      {preview && !result && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Chip className="bg-gray-100 text-gray-700">{preview.summary.total} rows</Chip>
            <Chip className="bg-success-50 text-success-700">{preview.summary.valid} will import</Chip>
            {preview.summary.duplicate > 0 && (
              <Chip className="bg-yellow-50 text-yellow-700">{preview.summary.duplicate} duplicate</Chip>
            )}
            {preview.summary.invalid > 0 && (
              <Chip className="bg-error-50 text-error-700">{preview.summary.invalid} invalid</Chip>
            )}
            {preview.context.academicYearName && (
              <Chip className="bg-brand-50 text-brand-700">Year: {preview.context.academicYearName}</Chip>
            )}
          </div>

          <div className="overflow-x-auto rounded-sm border border-stroke dark:border-strokedark">
            <table className="w-full text-sm">
              <thead className="bg-gray-2 text-left dark:bg-meta-4">
                <tr>
                  <th className="px-3 py-2 font-medium text-black dark:text-white">#</th>
                  {COLS.map(([, label]) => (
                    <th key={label} className="px-3 py-2 font-medium text-black dark:text-white">{label}</th>
                  ))}
                  <th className="px-3 py-2 font-medium text-black dark:text-white">Status / Issue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke dark:divide-strokedark">
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} className={row.status !== 'valid' ? 'bg-gray-50/60 dark:bg-meta-4/30' : ''}>
                    <td className="px-3 py-2 text-gray-400">{row.rowNumber}</td>
                    {COLS.map(([key]) => (
                      <td key={key} className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.data[key] || '—'}</td>
                    ))}
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLE[row.status]}`}>
                        {row.status}
                      </span>
                      {row.errors.length > 0 && (
                        <div className="mt-1 text-xs text-error-600">{row.errors.join('; ')}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {valid > 0 ? `${valid} valid row(s) will be imported; the rest are skipped.` : 'No valid rows to import — fix the issues above and re-upload.'}
            </span>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={commit}
              disabled={valid === 0 || commitMut.isPending}
            >
              {commitMut.isPending ? 'Importing…' : `Import ${valid} student${valid === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 px-4 py-3 dark:border-success-500/30 dark:bg-success-500/10">
            <CheckCircle2 className="h-5 w-5 text-success-600" />
            <span className="text-sm font-medium text-success-700 dark:text-success-400">
              Imported {result.summary.created} student(s); skipped {result.summary.skipped}.
            </span>
          </div>

          {result.created.length > 0 && (
            <div className="rounded-sm border border-stroke dark:border-strokedark">
              <div className="border-b border-stroke px-3 py-2 text-xs font-semibold text-gray-500 dark:border-strokedark">
                Created students &amp; parent logins — share these temporary passwords with parents (no SMS is sent).
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-2 text-left dark:bg-meta-4">
                  <tr>
                    <th className="px-3 py-2 font-medium">Admission No.</th>
                    <th className="px-3 py-2 font-medium">Parent Email</th>
                    <th className="px-3 py-2 font-medium">Temp Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-strokedark">
                  {result.created.map((c) => (
                    <tr key={c.studentId}>
                      <td className="px-3 py-2 font-mono">{c.admissionNumber}</td>
                      <td className="px-3 py-2">{c.parentEmail}</td>
                      <td className="px-3 py-2">
                        {c.parentTempPassword ? (
                          <button
                            className="inline-flex items-center gap-1 font-mono text-brand-600 hover:underline"
                            onClick={() => {
                              navigator.clipboard?.writeText(c.parentTempPassword!);
                              toast.success('Password copied');
                            }}
                          >
                            {c.parentTempPassword} <Copy className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-gray-400">existing account</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="rounded-sm border border-stroke dark:border-strokedark">
              <div className="border-b border-stroke px-3 py-2 text-xs font-semibold text-gray-500 dark:border-strokedark">
                Skipped rows
              </div>
              <ul className="divide-y divide-stroke text-sm dark:divide-strokedark">
                {result.skipped.map((s) => (
                  <li key={s.rowNumber} className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300">
                    <XCircle className="h-4 w-4 shrink-0 text-error-500" /> Row {s.rowNumber}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button variant="outline" onClick={() => { setResult(null); setPreview(null); setFileName(null); setCsv(null); }}>
            Import another file
          </Button>
        </div>
      )}
    </div>
  );
}

function Chip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${className}`}>{children}</span>;
}
