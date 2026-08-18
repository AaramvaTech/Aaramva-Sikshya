'use client';

import { RefreshCw } from 'lucide-react';
import { useFeePreview } from '@/lib/hooks/use-bill-assignment';
import { CrossClassBadge } from './class-mismatch-warning';

interface Props {
  studentId: string;
  academicYearId: string;
}

/**
 * UI-2 §5.1.E — read-only, recomputed live. 404 (no active assignment) is an
 * expected, common state, not an error — rendered as its own empty prompt.
 * Cross-panel invalidation happens in student-billing-tab.tsx (§5.1's
 * "onChanged" callback threaded into every write panel), not here — this
 * component just reads whatever the cache currently holds.
 */
export function FeePreviewPanel({ studentId, academicYearId }: Props) {
  const { data: preview, isLoading, isError, isFetching, error } = useFeePreview(studentId, academicYearId);

  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  const notAssigned = isError && status === 404;

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
        <div>
          <h4 className="font-semibold text-black dark:text-white">Fee Preview</h4>
          <p className="mt-0.5 text-xs text-gray-500">What this student would be charged, resolved live — nothing here is saved</p>
        </div>
        {isFetching && !isLoading && <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      <div className="px-6 py-4">
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}

        {notAssigned && (
          <p className="text-sm text-gray-400">No fee structure assigned for this year — assign one above.</p>
        )}
        {isError && !notAssigned && (
          <p className="text-sm text-red-500">Couldn&apos;t load the preview.</p>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-gray-500">{preview.feeStructureName}</p>
              {/* FEE-CLASS-GUARD §3: this is the panel an admin reviews a
                  student from later — the override has to be visible here or
                  a deliberate cross-class assignment reads as a bug. */}
              {preview.classMismatchOverridden && <CrossClassBadge />}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-400 dark:border-gray-800">
                    <th className="py-2 pr-3 font-medium">Fee Head</th>
                    <th className="py-2 pr-3 font-medium">Gross</th>
                    <th className="py-2 pr-3 font-medium">Override</th>
                    <th className="py-2 pr-3 font-medium">Concessions</th>
                    <th className="py-2 pr-3 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.heads.map((h) => (
                    <tr key={h.feeHeadId} className="border-b border-gray-50 dark:border-gray-900">
                      <td className="py-2 pr-3 text-gray-800 dark:text-white">{h.feeHeadName}</td>
                      <td className="py-2 pr-3 text-gray-500">Rs. {h.grossAmount.toLocaleString('en-IN')}</td>
                      <td className="py-2 pr-3 text-gray-500">{h.overrideAmount != null ? `Rs. ${h.overrideAmount.toLocaleString('en-IN')}` : '—'}</td>
                      <td className="py-2 pr-3 text-gray-500">
                        {h.concessions.length === 0
                          ? '—'
                          : h.concessions.map((c) => `Rs. ${c.amount.toLocaleString('en-IN')}`).join(', ')}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium text-gray-800 dark:text-white">Rs. {h.netAmount.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {preview.transport && (
                    <tr className="border-b border-gray-50 dark:border-gray-900">
                      <td className="py-2 pr-3 text-gray-800 dark:text-white">{preview.transport.transportRouteName} (Transport)</td>
                      <td className="py-2 pr-3 text-gray-500">Rs. {preview.transport.amount.toLocaleString('en-IN')}</td>
                      <td className="py-2 pr-3 text-gray-500">—</td>
                      <td className="py-2 pr-3 text-gray-500">—</td>
                      <td className="py-2 pr-3 text-right font-medium text-gray-800 dark:text-white">Rs. {preview.transport.amount.toLocaleString('en-IN')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {preview.wholeBillConcessions.length > 0 && (
              <p className="text-xs text-gray-500">
                Whole-bill concessions: {preview.wholeBillConcessions.map((c) => `Rs. ${c.amount.toLocaleString('en-IN')}`).join(', ')}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-6 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
              <span className="text-gray-500">Gross: <span className="font-medium text-gray-800 dark:text-white">Rs. {preview.grossTotal.toLocaleString('en-IN')}</span></span>
              <span className="text-gray-500">Concessions: <span className="font-medium text-gray-800 dark:text-white">Rs. {preview.concessionTotal.toLocaleString('en-IN')}</span></span>
              <span className="text-gray-500">Net: <span className="font-semibold text-brand-600 dark:text-brand-400">Rs. {preview.netTotal.toLocaleString('en-IN')}</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
