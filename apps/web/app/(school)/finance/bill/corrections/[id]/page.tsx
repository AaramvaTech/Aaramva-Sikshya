'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CorrectionTypeBadge } from '@/components/finance/correction-type-badge';
import { DecideCorrectionDialog } from '@/components/finance/decide-correction-dialog';
import { AmountDisplay } from '@/components/finance/amount-display';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  useBillCorrection, useApproveCorrection, useRejectCorrection, useReverseCorrection,
} from '@/lib/hooks/use-bill-correction';
import { extractApiErrors } from '@/lib/api-errors';
import { useAuthStore } from '@/store/auth.store';

const OWNER_ROLES = ['SCHOOL_OWNER', 'PLATFORM_ADMIN'];

/** UI-5-SPEC.md §3.3 — the ledger-entry-pair audit trail: `ledgerEntries`
 * already carries both the original entry and its reversal (if any) in one
 * array, so "both entries visible" needs no extra logic here, just a table. */
export default function CorrectionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = !!role && OWNER_ROLES.includes(role);

  const { data: correction, isLoading } = useBillCorrection(id);
  const approve = useApproveCorrection();
  const reject = useRejectCorrection();
  const reverse = useReverseCorrection();

  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);

  async function handleDecision(note: string) {
    if (!decision) return;
    try {
      if (decision === 'approve') {
        await approve.mutateAsync({ id, data: { note: note || undefined } });
        toast.success('Correction approved');
      } else {
        await reject.mutateAsync({ id, data: { note } });
        toast.success('Correction rejected');
      }
    } catch (err) {
      extractApiErrors(err, `Failed to ${decision} correction`).forEach((m) => toast.error(m));
    }
  }

  async function handleReverse() {
    try {
      await reverse.mutateAsync(id);
      toast.success('Correction reversed');
    } catch (err) {
      extractApiErrors(err, 'Failed to reverse correction').forEach((m) => toast.error(m));
    }
  }

  const alreadyReversed = !!correction?.ledgerEntryId
    && correction.ledgerEntries.some((e) => e.reversesEntryId === correction.ledgerEntryId);
  const canReverse = isOwner && correction?.status === 'APPROVED' && !!correction?.ledgerEntryId && !alreadyReversed;
  const canDecide = isOwner && correction?.status === 'REQUESTED';

  return (
    <div className="space-y-5">
      <Link href="/finance/bill/corrections" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Corrections
      </Link>

      <PageHeader
        title={correction?.correctionNumber ?? 'Correction'}
        description={correction ? `${correction.studentName ?? correction.studentId} — ${correction.type.replace('_', ' ').toLowerCase()}` : undefined}
      />

      {isLoading ? (
        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : !correction ? (
        <p className="text-sm text-gray-500">Correction not found.</p>
      ) : (
        <>
          <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark space-y-4 max-w-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CorrectionTypeBadge type={correction.type} />
                <StatusBadge status={correction.status} />
              </div>
              <AmountDisplay amount={correction.amount} className="text-lg font-bold" />
            </div>

            <Separator />

            <div className="text-sm space-y-1.5 text-gray-700 dark:text-gray-300">
              <p><span className="text-gray-500">Student: </span><span className="font-medium">{correction.studentName ?? correction.studentId}</span>{correction.admissionNumber && <span className="text-xs text-gray-400 font-mono ml-1">({correction.admissionNumber})</span>}</p>
              <p><span className="text-gray-500">Reason: </span>{correction.reasonName ?? '—'}</p>

              {correction.type === 'REFUND' ? (
                <>
                  <p><span className="text-gray-500">Method: </span>{correction.refundMethod?.replace('_', ' ')}</p>
                  {correction.refundReference && <p><span className="text-gray-500">Reference: </span><span className="font-mono">{correction.refundReference}</span></p>}
                </>
              ) : correction.targetInvoiceId && (
                <p>
                  <span className="text-gray-500">Invoice: </span>
                  <span className="font-mono text-xs">…{correction.targetInvoiceId.slice(-8)}</span>
                  {correction.targetInvoiceItemId && <span className="text-xs text-gray-400"> (one line only)</span>}
                </p>
              )}

              <p><span className="text-gray-500">Requested: </span><BsDate date={correction.requestedAt} showAd /></p>
              {correction.decidedAt && (
                <p><span className="text-gray-500">Decided: </span><BsDate date={correction.decidedAt} showAd /></p>
              )}
              {correction.decisionNote && (
                <p><span className="text-gray-500">Decision note: </span>{correction.decisionNote}</p>
              )}
            </div>
          </div>

          <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark max-w-2xl">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ledger Entries</p>
            {correction.ledgerEntries.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Not posted yet — still pending approval.</p>
            ) : (
              <div className="space-y-2">
                {correction.ledgerEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium">{entry.entryType.replace(/_/g, ' ')}{entry.reversesEntryId && <span className="ml-2 text-xs text-gray-400">(reversal)</span>}</p>
                      <BsDate date={entry.entryDate} />
                    </div>
                    <div className="text-right">
                      {entry.debit > 0 && <AmountDisplay amount={entry.debit} className="text-error-600" />}
                      {entry.credit > 0 && <AmountDisplay amount={entry.credit} className="text-success-600" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(canDecide || canReverse) && (
            <div className="flex gap-3 max-w-2xl">
              {canDecide && (
                <>
                  <Button className="bg-success-500 hover:bg-success-600 text-white" onClick={() => setDecision('approve')}>Approve</Button>
                  <Button variant="outline" className="text-error-600 border-error-200 hover:bg-error-50" onClick={() => setDecision('reject')}>Reject</Button>
                </>
              )}
              {canReverse && (
                <ConfirmDialog
                  title="Reverse Correction"
                  description={`Reverse this ${correction.type.replace('_', ' ').toLowerCase()}? This posts an offsetting ledger entry; the original stays on record.`}
                  onConfirm={handleReverse}
                  confirmLabel="Reverse"
                  variant="destructive"
                  trigger={<Button variant="outline" className="text-error-600 border-error-200 hover:bg-error-50">Reverse</Button>}
                />
              )}
            </div>
          )}

          {decision && (
            <DecideCorrectionDialog
              action={decision}
              correctionNumber={correction.correctionNumber}
              open={!!decision}
              onOpenChange={(open) => { if (!open) setDecision(null); }}
              onConfirm={handleDecision}
            />
          )}
        </>
      )}
    </div>
  );
}
