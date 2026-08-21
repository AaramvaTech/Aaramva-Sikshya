'use client';

import { toast } from 'sonner';
import { getErrorDisplay } from '@/lib/errors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PrintDocumentButton } from '@/components/finance/print-document-button';
import { canPrintReceipt, receiptPrintLabel } from '@/lib/print-document';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { BsDate } from '@/components/shared/bs-date';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { BillPaymentStatusBadge } from './bill-payment-status-badge';
import { AmountDisplay } from './amount-display';
import { useBillPayment, useUpdateChequeStatus, useVoidPayment } from '@/lib/hooks/use-bill-payment';
import { useAuthStore } from '@/store/auth.store';

interface PaymentDetailModalProps {
  paymentId: string | null;
  onClose: () => void;
}

const OWNER_ROLES = ['SCHOOL_OWNER', 'PLATFORM_ADMIN'];

export function PaymentDetailModal({ paymentId, onClose }: PaymentDetailModalProps) {
  const { data: payment, isLoading } = useBillPayment(paymentId);
  const role = useAuthStore((s) => s.user?.role);
  const updateCheque = useUpdateChequeStatus();
  const voidPayment = useVoidPayment();

  const isOwner = !!role && OWNER_ROLES.includes(role);
  const isPendingCheque = payment?.method === 'CHEQUE' && payment?.status === 'PENDING';
  const canVoid = isOwner && payment && payment.status !== 'VOIDED';

  function handleChequeTransition(status: 'CLEARED' | 'BOUNCED') {
    if (!paymentId) return;
    updateCheque.mutate(
      { id: paymentId, data: { status } },
      {
        onSuccess: () => toast.success(status === 'CLEARED' ? 'Cheque cleared' : 'Cheque bounced'),
        onError: (err) => toast.error(getErrorDisplay(err).message),
      },
    );
  }

  function handleVoid() {
    if (!paymentId) return;
    voidPayment.mutate(
      { id: paymentId, data: {} },
      {
        onSuccess: () => { toast.success('Payment voided'); onClose(); },
        onError: (err) => toast.error(getErrorDisplay(err).message),
      },
    );
  }

  return (
    <Dialog open={!!paymentId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="font-mono text-lg">
              {payment?.receiptNumber ?? 'Payment Detail'}
            </DialogTitle>
            {payment && <BillPaymentStatusBadge status={payment.status} />}
          </div>
          {payment && (
            <p className="text-sm text-gray-500">
              Received: <BsDate date={payment.receivedDate} />
            </p>
          )}
        </DialogHeader>

        <DialogBody className="max-h-[60vh] overflow-y-auto space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : payment ? (
            <>
              <div className="text-sm space-y-1 text-gray-700">
                <p><span className="text-gray-500">Student: </span><span className="font-medium">{payment.studentName ?? payment.studentId}</span></p>
                <p><span className="text-gray-500">Method: </span>{payment.method.replace(/_/g, ' ')}</p>
                <p><span className="text-gray-500">Allocation: </span>{payment.allocationMode.replace(/_/g, ' ')}</p>
                {payment.reference && <p><span className="text-gray-500">Reference: </span><span className="font-mono">{payment.reference}</span></p>}
                {payment.method === 'CHEQUE' && (
                  <>
                    {payment.chequeBank && <p><span className="text-gray-500">Bank: </span>{payment.chequeBank}</p>}
                    {payment.chequeDate && <p><span className="text-gray-500">Cheque Date: </span><BsDate date={payment.chequeDate} /></p>}
                  </>
                )}
                {payment.notes && <p><span className="text-gray-500">Notes: </span>{payment.notes}</p>}
              </div>

              <Separator />

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Allocations</p>
                {!payment.allocations || payment.allocations.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Unallocated — held as advance credit</p>
                ) : (
                  <div className="space-y-2">
                    {payment.allocations.map((a) => (
                      <div key={a.id} className="flex justify-between text-sm">
                        <span className="font-mono text-xs text-gray-500">Invoice …{a.billInvoiceId.slice(-8)}</span>
                        <AmountDisplay amount={a.amount} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex justify-between font-bold text-base">
                <span>Amount</span>
                <AmountDisplay amount={payment.amount} className="text-success-700" />
              </div>

              {payment.status === 'BOUNCED' && payment.bounceReason && (
                <p className="text-xs text-error-600">Bounce reason: {payment.bounceReason}</p>
              )}
              {payment.status === 'VOIDED' && payment.voidReason && (
                <p className="text-xs text-gray-500">Void reason: {payment.voidReason}</p>
              )}
            </>
          ) : null}
        </DialogBody>

        {payment && (
          <DialogFooter>
            {/* BILL-8-UI Phase 1 — reprint from the detail view.
                BILL-RCPT-STATUS: the inline VOIDED test that used to live here
                is now the shared `canPrintReceipt`, which also covers BOUNCED
                and matches the server's `assertReceiptPrintable`. */}
            {canPrintReceipt(payment.status) && (
              <PrintDocumentButton
                doc={{ kind: 'receipt', paymentId: payment.id }}
                label={receiptPrintLabel(payment.status)}
              />
            )}
            {isPendingCheque && (
              <>
                <ConfirmDialog
                  title="Mark Cheque Bounced"
                  description="Mark this cheque as bounced? No ledger entry was ever posted for a PENDING cheque, so nothing needs reversing — this just records the outcome."
                  onConfirm={() => handleChequeTransition('BOUNCED')}
                  confirmLabel="Mark Bounced"
                  variant="destructive"
                  trigger={<Button variant="outline" size="sm" className="text-error-600 border-red-200 hover:bg-error-50">Mark Bounced</Button>}
                />
                <ConfirmDialog
                  title="Mark Cheque Cleared"
                  description="Mark this cheque as cleared? This posts the payment's ledger entry now and updates the invoice balance."
                  onConfirm={() => handleChequeTransition('CLEARED')}
                  confirmLabel="Mark Cleared"
                  trigger={<Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white">Mark Cleared</Button>}
                />
              </>
            )}
            {canVoid && (
              <ConfirmDialog
                title="Void Payment"
                description={`Void payment ${payment.receiptNumber}? This is permanent — if a ledger entry was posted, it will be reversed, never edited or deleted. The receipt number is retained and never reused.`}
                onConfirm={handleVoid}
                confirmLabel="Void Payment"
                variant="destructive"
                trigger={<Button variant="outline" size="sm" className="text-error-600 border-red-200 hover:bg-error-50">Void Payment</Button>}
              />
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
