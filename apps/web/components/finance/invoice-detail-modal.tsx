'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { BsDate } from '@/components/shared/bs-date';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { AmountDisplay } from './amount-display';
import { PaymentForm } from './payment-form';
import { useInvoice, useVoidInvoice, useCancelPayment, useRecalculateFine } from '@/lib/hooks/use-finance';
import type { InvoiceSummary } from '@/types/api.types';

interface InvoiceDetailModalProps {
  invoiceId: string | null;
  onClose: () => void;
}

export function InvoiceDetailModal({ invoiceId, onClose }: InvoiceDetailModalProps) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { data: invoice, isLoading } = useInvoice(invoiceId ?? '');
  const voidMutation = useVoidInvoice();
  const cancelPayment = useCancelPayment();
  const recalcFine = useRecalculateFine();

  async function handleVoid() {
    if (!invoiceId) return;
    try {
      await voidMutation.mutateAsync(invoiceId);
      toast.success('Invoice voided');
      onClose();
    } catch {
      toast.error('Failed to void invoice');
    }
  }

  const canVoid = invoice && invoice.status !== 'PAID' && invoice.status !== 'WAIVED';
  const canRecalc = invoice && (invoice.status === 'OVERDUE' || invoice.status === 'UNPAID');

  return (
    <>
      <Dialog open={!!invoiceId} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="font-mono text-lg">
                {invoice?.invoiceNumber ?? 'Invoice Detail'}
              </DialogTitle>
              {invoice && <InvoiceStatusBadge status={invoice.status} />}
            </div>
            {invoice && (
              <p className="text-sm text-gray-500">
                Due: <BsDate date={invoice.dueDate} />
              </p>
            )}
          </DialogHeader>

          <DialogBody className="max-h-[60vh] overflow-y-auto space-y-5">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : invoice ? (
              <>
                <div className="text-sm space-y-1 text-gray-700">
                  <p>
                    <span className="text-gray-500">Student: </span>
                    <span className="font-medium">{invoice.studentName}</span>
                    <span className="font-mono text-xs text-gray-400 ml-1">({invoice.admissionNumber})</span>
                  </p>
                  <p>
                    <span className="text-gray-500">Class: </span>
                    {invoice.className}
                  </p>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Fee Breakdown
                  </p>
                  <div className="space-y-2">
                    {invoice.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.feeCategoryName}</span>
                        <AmountDisplay amount={item.originalAmount} />
                      </div>
                    ))}
                    {invoice.discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-error-600">
                        <span>Discount</span>
                        <AmountDisplay amount={invoice.discountAmount} negative />
                      </div>
                    )}
                    {invoice.fineAmount > 0 && (
                      <div className="flex justify-between text-sm text-orange-600">
                        <span>Late Fine</span>
                        <AmountDisplay amount={invoice.fineAmount} />
                      </div>
                    )}
                  </div>
                  <Separator className="my-3" />
                  <div className="flex justify-between font-semibold text-sm">
                    <span>Total</span>
                    <AmountDisplay amount={invoice.totalAmount} />
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Payments Received
                  </p>
                  {invoice.payments.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No payments yet</p>
                  ) : (
                    <div className="space-y-2">
                      {invoice.payments.map((payment) => (
                        <div key={payment.id} className="flex items-start justify-between text-sm gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-xs text-gray-500">{payment.paymentNumber}</span>
                            <span className="text-gray-400 mx-1">·</span>
                            <span className="text-gray-700">{payment.method.replace(/_/g, ' ')}</span>
                            <span className="text-gray-400 mx-1">·</span>
                            <span className="text-gray-500">by {payment.receivedBy}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <AmountDisplay amount={payment.amount} className="text-success-700" />
                            <ConfirmDialog
                              title="Cancel Payment"
                              description={`Cancel payment ${payment.paymentNumber}? This will reverse the payment and update the invoice balance.`}
                              onConfirm={() =>
                                cancelPayment.mutate(payment.id, {
                                  onSuccess: () => toast.success('Payment cancelled'),
                                  onError: () => toast.error('Failed to cancel payment'),
                                })
                              }
                              confirmLabel="Cancel Payment"
                              variant="destructive"
                              trigger={
                                <button className="text-xs text-error-500 hover:text-error-700">
                                  Cancel
                                </button>
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between font-bold text-base">
                  <span>Balance Due</span>
                  <AmountDisplay
                    amount={invoice.balance}
                    className={invoice.balance > 0 ? 'text-error-600' : 'text-success-600'}
                  />
                </div>
              </>
            ) : null}
          </DialogBody>

          {invoice && (
            <DialogFooter>
              {canVoid && (
                <ConfirmDialog
                  title="Void Invoice"
                  description={`Are you sure you want to void invoice ${invoice.invoiceNumber}? This action cannot be undone.`}
                  onConfirm={handleVoid}
                  confirmLabel="Void Invoice"
                  variant="destructive"
                  trigger={
                    <Button variant="outline" size="sm" className="text-error-600 border-red-200 hover:bg-error-50">
                      Void Invoice
                    </Button>
                  }
                />
              )}
              {canRecalc && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={recalcFine.isPending}
                  onClick={() =>
                    recalcFine.mutate(invoiceId!, {
                      onSuccess: () => toast.success('Fine recalculated'),
                      onError: () => toast.error('Failed to recalculate fine'),
                    })
                  }
                >
                  Recalculate Fine
                </Button>
              )}
              {invoice.balance > 0 && (
                <Button
                  size="sm"
                  className="bg-brand-500 hover:bg-brand-600 text-white"
                  onClick={() => setPaymentOpen(true)}
                >
                  + Record Payment
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {invoice && (
        <PaymentForm
          invoice={invoice as InvoiceSummary}
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
        />
      )}
    </>
  );
}
