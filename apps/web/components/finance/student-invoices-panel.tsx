'use client';

import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { BillInvoiceStatusBadge } from '@/components/finance/bill-invoice-status-badge';
import { PrintDocumentButton } from '@/components/finance/print-document-button';
import { useStudentBillInvoices } from '@/lib/hooks/use-bill-payment';

interface Props {
  studentId: string;
  academicYearId: string;
}

/**
 * BILL-8-UI Phase 1 — the student Billing tab had every *setup* panel
 * (assignment, overrides, concessions, transport, preview) but never showed
 * the invoices those settings actually produced, so there was nowhere to put
 * a print action. This is that list: read-only, one row per invoice, print on
 * each.
 *
 * Reuses `useStudentBillInvoices` verbatim (BILLING-CUTOVER Phase 1) — it is
 * already year-scoped, bounded at 100, and hits the PARENT-safe
 * `findByStudent` route. No new hook, no API change.
 */
export function StudentInvoicesPanel({ studentId, academicYearId }: Props) {
  const { data: invoices, isLoading } = useStudentBillInvoices(studentId, academicYearId);

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
        <h4 className="font-semibold text-black dark:text-white">Invoices</h4>
        <p className="mt-0.5 text-xs text-gray-500">Posted bills for this academic year — print any of them</p>
      </div>

      <div className="px-6 py-4">
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {!isLoading && (!invoices || invoices.length === 0) && (
          <p className="text-sm text-gray-400">No invoices posted for this year yet.</p>
        )}

        {invoices && invoices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 dark:border-gray-800">
                  <th className="py-2 pr-3 font-medium">Invoice</th>
                  <th className="py-2 pr-3 font-medium">Issued</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 pr-3 text-right font-medium">Balance</th>
                  <th className="py-2 pl-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-50 dark:border-gray-900">
                    <td className="py-2 pr-3 font-mono text-xs text-gray-800 dark:text-white">
                      {inv.invoiceNumber ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-gray-500"><BsDate date={inv.issueDate} /></td>
                    <td className="py-2 pr-3"><BillInvoiceStatusBadge status={inv.status} /></td>
                    <td className="py-2 pr-3 text-right text-gray-800 dark:text-white">
                      <AmountDisplay amount={inv.totalReceivable} />
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-500">
                      <AmountDisplay amount={inv.balance} />
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {/* A VOIDED invoice is not a bill — nothing to hand a
                          parent, so no print action (addendum A6's
                          immutability makes an already-printed one permanent
                          regardless, which is the point). */}
                      {inv.status !== 'VOIDED' && (
                        <PrintDocumentButton doc={{ kind: 'invoice', invoiceId: inv.id }} label="Print" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
