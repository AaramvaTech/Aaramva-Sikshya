'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useRecordPayment } from '@/lib/hooks/use-finance';
import { formatNPR } from './amount-display';
import type { InvoiceSummary } from '@/types/api.types';

interface PaymentFormProps {
  invoice: InvoiceSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const METHODS = ['CASH', 'ESEWA', 'KHALTI', 'BANK_TRANSFER', 'CHEQUE'] as const;

function buildSchema(maxAmount: number) {
  return z
    .object({
      amount: z
        .number()
        .min(0.01, 'Amount must be greater than 0')
        .max(maxAmount, `Amount cannot exceed balance of ${formatNPR(maxAmount)}`),
      method: z.enum(METHODS),
      reference: z.string().optional(),
      notes: z.string().optional(),
    })
    .refine((data) => data.method === 'CASH' || !!data.reference?.trim(), {
      message: 'Reference number is required for non-cash payments',
      path: ['reference'],
    });
}

type PaymentFormValues = {
  amount: number;
  method: (typeof METHODS)[number];
  reference?: string;
  notes?: string;
};

export function PaymentForm({ invoice, open, onOpenChange, onSuccess }: PaymentFormProps) {
  const schema = buildSchema(invoice.balance);
  const mutation = useRecordPayment();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: invoice.balance,
      method: 'CASH',
    },
  });

  const method = watch('method');

  useEffect(() => {
    if (open) {
      reset({ amount: invoice.balance, method: 'CASH', reference: '', notes: '' });
    }
  }, [open, invoice.balance, reset]);

  async function onSubmit(values: PaymentFormValues) {
    try {
      await mutation.mutateAsync({
        invoiceId: invoice.id,
        amount: values.amount,
        method: values.method,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
      });
      toast.success('Payment recorded successfully');
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error('Failed to record payment');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-gray-500 -mt-1">
          Invoice <span className="font-mono font-medium text-gray-700">{invoice.invoiceNumber}</span>
          {' · '}Balance: <span className="font-semibold text-gray-800">{formatNPR(invoice.balance)}</span>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount *</Label>
            <div className="flex gap-2">
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register('amount', { valueAsNumber: true })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap text-xs"
                onClick={() => setValue('amount', invoice.balance, { shouldValidate: true })}
              >
                Full {formatNPR(invoice.balance)}
              </Button>
            </div>
            {errors.amount && (
              <p className="text-xs text-error-600">{errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Method *</Label>
            <Select
              value={method}
              onValueChange={(v) => {
                if (v) setValue('method', v as (typeof METHODS)[number], { shouldValidate: true });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Reference No.{method !== 'CASH' && ' *'}
            </Label>
            <Input
              id="reference"
              placeholder={method === 'CASH' ? 'Optional' : 'Transaction / cheque number'}
              {...register('reference')}
            />
            {errors.reference && (
              <p className="text-xs text-error-600">{errors.reference.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" placeholder="Optional" {...register('notes')} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-brand-500 hover:bg-brand-600 text-white"
              disabled={mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
