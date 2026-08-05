'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2 } from 'lucide-react';
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
} from '@/components/ui/select';
import { BsDateInput } from '@/components/shared/bs-date-input';
import {
  billFeeStructureSchema,
  type BillFeeStructureFormValues,
} from '@/lib/schemas/bill-fee-structure.schema';
import {
  useCreateFeeStructure,
  useUpdateFeeStructureItems,
  useFeeHeads,
} from '@/lib/hooks/use-bill-catalog';
import { useClasses, useAcademicYears } from '@/lib/hooks/use-students';
import { extractApiErrors } from '@/lib/api-errors';
import type { BillFeeStructure } from '@/types/api.types';

interface BillFeeStructureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  /** Required when mode === 'edit' — the structure whose items are being edited. */
  structure?: BillFeeStructure;
  onSuccess?: () => void;
}

const emptyItem = { feeHeadId: '', amount: 0, recurrenceOverride: '', effectiveFrom: '', effectiveTo: '' };

/**
 * UI-1 §5.2. Mirrors components/finance/fee-structure-form.tsx (the old
 * rail's own equivalent) closely — Dialog, RHF + zodResolver + useFieldArray
 * for the item rows — rather than inventing a new shape for the one genuinely
 * complex screen this phase ships.
 *
 * Edit mode only ever submits `items` (UpdateBillFeeStructureItemsDto has no
 * other field) — classId/academicYearId/sectionId/name render read-only with
 * a one-line explanation instead of silently vanishing.
 */
export function BillFeeStructureDialog({ open, onOpenChange, mode, structure, onSuccess }: BillFeeStructureDialogProps) {
  const create = useCreateFeeStructure();
  const updateItems = useUpdateFeeStructureItems();
  const mutation = mode === 'create' ? create : updateItems;

  const { data: classes } = useClasses();
  const { data: academicYears } = useAcademicYears();
  const { data: feeHeads } = useFeeHeads();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BillFeeStructureFormValues>({
    resolver: zodResolver(billFeeStructureSchema),
    defaultValues: {
      classId: '', academicYearId: '', sectionId: '', name: '', items: [emptyItem],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // Re-seed the form whenever a different structure opens in edit mode (or
  // create mode resets to blank) — mirrors students/[id]/edit's own
  // load-then-render pattern.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && structure) {
      reset({
        classId: structure.classId,
        academicYearId: structure.academicYearId,
        sectionId: structure.sectionId ?? '',
        name: structure.name,
        items: (structure.items ?? []).map((i) => ({
          feeHeadId: i.feeHeadId,
          amount: i.amount,
          recurrenceOverride: i.recurrenceOverride ?? '',
          effectiveFrom: i.effectiveFrom,
          effectiveTo: i.effectiveTo ?? '',
        })),
      });
    } else if (mode === 'create') {
      reset({ classId: '', academicYearId: '', sectionId: '', name: '', items: [emptyItem] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, structure?.id]);

  const selectedClass = classes?.find((c) => c.id === watch('classId'));

  async function onSubmit(values: BillFeeStructureFormValues) {
    // Boundary conversion: RHF/Zod keep amount as a number for input UX;
    // the wire format is a decimal string (@IsMoneyString() on the backend).
    const items = values.items.map((item) => ({
      feeHeadId: item.feeHeadId,
      amount: item.amount.toFixed(2),
      recurrenceOverride: item.recurrenceOverride || undefined,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo || undefined,
    }));

    try {
      if (mode === 'create') {
        await create.mutateAsync({
          classId: values.classId,
          academicYearId: values.academicYearId,
          sectionId: values.sectionId || undefined,
          name: values.name,
          items,
        });
        toast.success('Fee structure created');
      } else {
        await updateItems.mutateAsync({ id: structure!.id, data: { items } });
        toast.success('Fee structure items updated');
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      extractApiErrors(err, `Failed to ${mode === 'create' ? 'create' : 'update'} fee structure`).forEach((m) => toast.error(m));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Fee Structure' : `Edit Items — ${structure?.name}`}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {mode === 'create' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Class *</Label>
                <Select value={watch('classId')} onValueChange={(v) => setValue('classId', v ?? '', { shouldValidate: true })}>
                  <SelectTrigger>
                    <span className={watch('classId') ? '' : 'text-muted-foreground'}>
                      {watch('classId') ? (classes?.find((c) => c.id === watch('classId'))?.name ?? 'Loading…') : 'Select class'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.classId && <p className="text-xs text-error-600">{errors.classId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Academic Year *</Label>
                <Select value={watch('academicYearId')} onValueChange={(v) => setValue('academicYearId', v ?? '', { shouldValidate: true })}>
                  <SelectTrigger>
                    <span className={watch('academicYearId') ? '' : 'text-muted-foreground'}>
                      {watch('academicYearId') ? (academicYears?.find((y) => y.id === watch('academicYearId'))?.name ?? 'Loading…') : 'Select year'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears?.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.academicYearId && <p className="text-xs text-error-600">{errors.academicYearId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Section (optional)</Label>
                <Select value={watch('sectionId') ?? ''} onValueChange={(v) => setValue('sectionId', v ?? '')}>
                  <SelectTrigger>
                    <span className={watch('sectionId') ? '' : 'text-muted-foreground'}>
                      {watch('sectionId') ? (selectedClass?.sections.find((s) => s.id === watch('sectionId'))?.name ?? 'Loading…') : 'All sections'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All sections</SelectItem>
                    {selectedClass?.sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input {...register('name')} placeholder="e.g. Grade 9 Fees 2083" />
                {errors.name && <p className="text-xs text-error-600">{errors.name.message}</p>}
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-gray-50 dark:bg-gray-800/40 px-4 py-3 text-sm space-y-1">
              <p><span className="text-gray-500">Name:</span> {structure?.name}</p>
              <p><span className="text-gray-500">Class:</span> {classes?.find((c) => c.id === structure?.classId)?.name ?? structure?.classId}</p>
              <p><span className="text-gray-500">Academic Year:</span> {academicYears?.find((y) => y.id === structure?.academicYearId)?.name ?? structure?.academicYearId}</p>
              <p className="text-xs text-gray-400 pt-1">Class, academic year, and name can&apos;t change after a structure is created — only its fee items can. Create a new structure for a different class or year.</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Fee Items *</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => append(emptyItem)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
              </Button>
            </div>

            {errors.items?.root && <p className="text-xs text-error-600 mb-2">{errors.items.root.message}</p>}

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 min-w-[180px] space-y-1.5">
                      <Label className="text-xs text-gray-500">Fee Head</Label>
                      <Select
                        value={watch(`items.${index}.feeHeadId`)}
                        onValueChange={(v) => setValue(`items.${index}.feeHeadId`, v ?? '', { shouldValidate: true })}
                      >
                        <SelectTrigger className="h-9">
                          <span className={watch(`items.${index}.feeHeadId`) ? '' : 'text-muted-foreground'}>
                            {watch(`items.${index}.feeHeadId`)
                              ? (feeHeads?.find((h) => h.id === watch(`items.${index}.feeHeadId`))?.name ?? 'Loading…')
                              : 'Fee head'}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {feeHeads?.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {errors.items?.[index]?.feeHeadId && (
                        <p className="text-xs text-error-600">{errors.items[index]?.feeHeadId?.message}</p>
                      )}
                    </div>

                    <div className="w-28 shrink-0 space-y-1.5">
                      <Label className="text-xs text-gray-500">Amount (Rs.)</Label>
                      <Input type="number" step="0.01" className="h-9" placeholder="0" {...register(`items.${index}.amount`, { valueAsNumber: true })} />
                    </div>

                    <div className="w-36 shrink-0 space-y-1.5">
                      <Label className="text-xs text-gray-500">Recurrence Override</Label>
                      <Input className="h-9" placeholder="—" {...register(`items.${index}.recurrenceOverride`)} />
                    </div>

                    <div className="shrink-0 space-y-1.5">
                      <Label className="text-xs text-gray-500 invisible">Remove</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-gray-400 hover:text-error-600"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <BsDateInput
                        label="Effective From *"
                        value={watch(`items.${index}.effectiveFrom`)}
                        onChange={(ad) => setValue(`items.${index}.effectiveFrom`, ad, { shouldValidate: true })}
                      />
                      {errors.items?.[index]?.effectiveFrom && (
                        <p className="text-xs text-error-600 mt-0.5">{errors.items[index]?.effectiveFrom?.message}</p>
                      )}
                    </div>
                    <BsDateInput
                      label="Effective To (optional)"
                      value={watch(`items.${index}.effectiveTo`)}
                      onChange={(ad) => setValue(`items.${index}.effectiveTo`, ad)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Create Structure' : 'Save Items'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
