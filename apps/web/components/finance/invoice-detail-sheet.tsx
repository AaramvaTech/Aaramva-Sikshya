'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { BsDate } from '@/components/shared/bs-date';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { AmountDisplay } from './amount-display';
import { PaymentForm } from './payment-form';
import { useInvoice, useVoidInvoice } from '@/lib/hooks/use-finance';
import type { InvoiceSummary } from '@/types/api.types';

interface InvoiceDetailSheetProps {
  invoiceId: string | null;
  onClose: () => void;
}

export function InvoiceDetailSheet({ invoiceId, onClose }: InvoiceDetailSheetProps) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { data: invoice, isLoading } = useInvoice(invoiceId ?? '');
  const voidMutation = useVoidInvoice();

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

  return (
    <>
      <Sheet open={!!invoiceId} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Invoice Detail</SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="space-y-3 px-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : invoice ? (
            <div className="px-4 pb-8 space-y-5">
              {/* Header info */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-lg font-semibold text-gray-900">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Due: <BsDate date={invoice.dueDate} />
                  </p>
                </div>
                <InvoiceStatusBadge status={invoice.status} />
              </div>

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

              {/* Fee breakdown */}
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

              {/* Payments */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Payments Received
                </p>
                {invoice.payments.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No payments yet</p>
                ) : (
                  <div className="space-y-2">
                    {invoice.payments.map((payment) => (
                      <div key={payment.id} className="flex justify-between text-sm">
                        <div>
                          <span className="font-mono text-xs text-gray-500">{payment.paymentNumber}</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span className="text-gray-700">{payment.method.replace(/_/g, ' ')}</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span className="text-gray-500">by {payment.receivedBy}</span>
                        </div>
                        <AmountDisplay amount={payment.amount} className="text-success-700" />
                      </div>
                    ))}
                  </div>
                )}

                {invoice.balance > 0 && (
                  <Button
                    size="sm"
                    className="mt-3 bg-brand-500 hover:bg-brand-600 text-white"
                    onClick={() => setPaymentOpen(true)}
                  >
                    + Record Payment
                  </Button>
                )}
              </div>

              <Separator />

              {/* Balance */}
              <div className="flex justify-between font-bold text-base">
                <span>Balance Due</span>
                <AmountDisplay
                  amount={invoice.balance}
                  className={invoice.balance > 0 ? 'text-error-600' : 'text-success-600'}
                />
              </div>

              {/* Void action */}
              {canVoid && (
                <div className="pt-2">
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
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

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
