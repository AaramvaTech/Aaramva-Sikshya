'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  SelectValue,
} from '@/components/ui/select';
import { useCreateFeeStructure, useFeeCategories } from '@/lib/hooks/use-finance';
import { useClasses, useAcademicYears } from '@/lib/hooks/use-students';

interface FeeStructureFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const itemSchema = z.object({
  feeCategoryId: z.string().min(1, 'Select a category'),
  amount: z.number().min(0.01, 'Must be > 0'),
  finePerDay: z.number().min(0).optional(),
  gracePeriodDays: z.number().min(0).optional(),
});

const schema = z.object({
  classId: z.string().min(1, 'Select a class'),
  academicYearId: z.string().min(1, 'Select academic year'),
  items: z.array(itemSchema).min(1, 'Add at least one fee item'),
});

type FormValues = z.infer<typeof schema>;

export function FeeStructureForm({ open, onOpenChange, onSuccess }: FeeStructureFormProps) {
  const mutation = useCreateFeeStructure();
  const { data: categories } = useFeeCategories();
  const { data: classes } = useClasses();
  const { data: academicYears } = useAcademicYears();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      classId: '',
      academicYearId: '',
      items: [{ feeCategoryId: '', amount: 0, finePerDay: 0, gracePeriodDays: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync({
        classId: values.classId,
        academicYearId: values.academicYearId,
        items: values.items.map((item) => ({
          feeCategoryId: item.feeCategoryId,
          amount: item.amount,
          finePerDay: item.finePerDay,
          gracePeriodDays: item.gracePeriodDays,
        })),
      });
      toast.success('Fee structure created');
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error('Failed to create fee structure');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Fee Structure</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Class *</Label>
              <Select
                value={watch('classId')}
                onValueChange={(v) => setValue('classId', v ?? '', { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.classId && <p className="text-xs text-error-600">{errors.classId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Academic Year *</Label>
              <Select
                value={watch('academicYearId')}
                onValueChange={(v) => setValue('academicYearId', v ?? '', { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears?.map((y) => (
                    <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.academicYearId && (
                <p className="text-xs text-error-600">{errors.academicYearId.message}</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Fee Items *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ feeCategoryId: '', amount: 0, finePerDay: 0, gracePeriodDays: 0 })
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
              </Button>
            </div>

            {errors.items?.root && (
              <p className="text-xs text-error-600 mb-2">{errors.items.root.message}</p>
            )}

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_120px_100px_100px_36px] gap-2 text-xs font-medium text-gray-500 px-1">
                <span>Category</span>
                <span>Amount (Rs.)</span>
                <span>Fine/Day</span>
                <span>Grace Days</span>
                <span />
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-[1fr_120px_100px_100px_36px] gap-2 items-start">
                  <div>
                    <Select
                      value={watch(`items.${index}.feeCategoryId`)}
                      onValueChange={(v) =>
                        setValue(`items.${index}.feeCategoryId`, v ?? '', { shouldValidate: true })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.items?.[index]?.feeCategoryId && (
                      <p className="text-xs text-error-600 mt-0.5">
                        {errors.items[index]?.feeCategoryId?.message}
                      </p>
                    )}
                  </div>

                  <Input
                    type="number"
                    step="0.01"
                    className="h-9"
                    placeholder="0"
                    {...register(`items.${index}.amount`, { valueAsNumber: true })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    className="h-9"
                    placeholder="0"
                    {...register(`items.${index}.finePerDay`, { valueAsNumber: true })}
                  />
                  <Input
                    type="number"
                    className="h-9"
                    placeholder="0"
                    {...register(`items.${index}.gracePeriodDays`, { valueAsNumber: true })}
                  />
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
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
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
              Create Structure
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
