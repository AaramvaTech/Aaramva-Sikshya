'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { FileText, Plus, Pencil, Trash2, Tag, X, Loader2, Check } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FeeStructureForm } from '@/components/finance/fee-structure-form';
import { AmountDisplay } from '@/components/finance/amount-display';
import {
  useFeeStructures,
  useFeeStructure,
  useFeeCategories,
  useCreateFeeCategory,
  useUpdateFeeCategory,
  useDeleteFeeCategory,
  useUpdateFeeStructureItems,
  useDeleteFeeStructure,
} from '@/lib/hooks/use-finance';
import { useAcademicYears, useCurrentAcademicYear, useClasses } from '@/lib/hooks/use-students';
import type { FeeCategory, FeeStructureDetail } from '@/types/api.types';

// ─── Category Manager Modal ────────────────────────────────────────────────

const FEE_TYPES = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'EXAM'] as const;

function CategoryManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: categories, isLoading } = useFeeCategories();
  const createCategory = useCreateFeeCategory();
  const updateCategory = useUpdateFeeCategory();
  const deleteCategory = useDeleteFeeCategory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<FeeCategory['type']>('ONE_TIME');

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FeeCategory['type']>('ONE_TIME');

  function startEdit(cat: FeeCategory) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditType(cat.type);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    try {
      await updateCategory.mutateAsync({ id: editingId, data: { name: editName.trim(), type: editType } });
      toast.success('Category updated');
      setEditingId(null);
    } catch {
      toast.error('Failed to update category');
    }
  }

  async function handleCreate() {
    if (!newName.trim()) { toast.error('Name is required'); return; }
    try {
      await createCategory.mutateAsync({ name: newName.trim(), type: newType });
      toast.success('Category created');
      setNewName('');
      setNewType('ONE_TIME');
    } catch {
      toast.error('Failed to create category');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCategory.mutateAsync(id);
      toast.success('Category deleted');
    } catch {
      toast.error('Failed to delete category — it may be in use');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fee Categories</DialogTitle>
        </DialogHeader>

        <DialogBody className="max-h-[65vh] overflow-y-auto space-y-6">
          {/* Create new */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Add Category</p>
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <Input
                placeholder="Category name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Select value={newType} onValueChange={(v) => setNewType(v as FeeCategory['type'])}>
                <SelectTrigger>
                  <span className="text-xs">{newType.replace(/_/g, ' ')}</span>
                </SelectTrigger>
                <SelectContent>
                  {FEE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleCreate}
              disabled={createCategory.isPending || !newName.trim()}
            >
              {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : (categories?.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No categories yet</p>
            ) : (
              categories?.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800"
                >
                  {editingId === cat.id ? (
                    <>
                      <Input
                        className="h-8 text-sm flex-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                      <Select value={editType} onValueChange={(v) => setEditType(v as FeeCategory['type'])}>
                        <SelectTrigger className="w-32 h-8">
                          <span className="text-xs">{editType.replace(/_/g, ' ')}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {FEE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={saveEdit} className="text-success-600 hover:text-success-700 p-1">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 p-1">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{cat.name}</p>
                        <Badge className="text-xs border-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 mt-0.5">
                          {cat.type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <button
                        onClick={() => startEdit(cat)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <ConfirmDialog
                        title="Delete Category"
                        description={`Delete "${cat.name}"? This will fail if the category is used in any fee structure.`}
                        onConfirm={() => handleDelete(cat.id)}
                        confirmLabel="Delete"
                        variant="destructive"
                        trigger={
                          <button className="text-gray-400 hover:text-error-600 p-1">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        }
                      />
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Structure Items Dialog ───────────────────────────────────────────

const itemSchema = z.object({
  feeCategoryId: z.string().min(1, 'Required'),
  amount: z.number().min(0.01, 'Must be > 0'),
  finePerDay: z.number().min(0).optional(),
  gracePeriodDays: z.number().min(0).optional(),
});
const editSchema = z.object({
  items: z.array(itemSchema).min(1, 'Add at least one item'),
});
type EditForm = z.infer<typeof editSchema>;

function EditStructureDialog({
  structure,
  open,
  onClose,
}: {
  structure: FeeStructureDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { data: categories } = useFeeCategories();
  const updateItems = useUpdateFeeStructureItems();

  const { register, handleSubmit, control, setValue, watch, reset, formState: { errors } } =
    useForm<EditForm>({
      resolver: zodResolver(editSchema),
      defaultValues: {
        items: structure.items.map((i) => ({
          feeCategoryId: i.feeCategoryId,
          amount: i.amount,
          finePerDay: i.finePerDay,
          gracePeriodDays: i.gracePeriodDays,
        })),
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  async function onSubmit(values: EditForm) {
    try {
      await updateItems.mutateAsync({ id: structure.id, items: values.items });
      toast.success('Fee structure updated');
      onClose();
    } catch {
      toast.error('Failed to update fee structure');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Fee Items — {structure.className}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Fee Items *</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ feeCategoryId: '', amount: 0, finePerDay: 0, gracePeriodDays: 0 })}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
            </Button>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_120px_100px_100px_36px] gap-2 text-xs font-medium text-gray-500 px-1">
              <span>Category</span><span>Amount (Rs.)</span><span>Fine/Day</span><span>Grace Days</span><span />
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[1fr_120px_100px_100px_36px] gap-2 items-start">
                <Select
                  value={watch(`items.${index}.feeCategoryId`)}
                  onValueChange={(v) => setValue(`items.${index}.feeCategoryId`, v ?? '', { shouldValidate: true })}
                >
                  <SelectTrigger className="h-9">
                    <span className={watch(`items.${index}.feeCategoryId`) ? '' : 'text-muted-foreground'}>
                      {watch(`items.${index}.feeCategoryId`)
                        ? (categories?.find((c) => c.id === watch(`items.${index}.feeCategoryId`))?.name ?? 'Loading…')
                        : 'Category'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" step="0.01" className="h-9" placeholder="0"
                  {...register(`items.${index}.amount`, { valueAsNumber: true })} />
                <Input type="number" step="0.01" className="h-9" placeholder="0"
                  {...register(`items.${index}.finePerDay`, { valueAsNumber: true })} />
                <Input type="number" className="h-9" placeholder="0"
                  {...register(`items.${index}.gracePeriodDays`, { valueAsNumber: true })} />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-error-600"
                  onClick={() => remove(index)} disabled={fields.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {errors.items?.root && (
              <p className="text-xs text-error-600">{errors.items.root.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white" disabled={updateItems.isPending}>
              {updateItems.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fee Structure Detail + Actions ────────────────────────────────────────

function FeeStructureCard({ s }: { s: import('@/types/api.types').FeeStructureSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { data: detail, isLoading } = useFeeStructure(expanded || editOpen ? s.id : '');
  const deleteStructure = useDeleteFeeStructure();

  async function handleDelete() {
    try {
      await deleteStructure.mutateAsync(s.id);
      toast.success('Fee structure deleted');
    } catch {
      toast.error('Failed to delete — invoices may reference this structure');
    }
  }

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="p-4 sm:p-6">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-semibold text-black dark:text-white">{s.className}</h3>
          <span className="text-xs text-gray-500">{s.academicYearName}</span>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          {s.itemCount} fee item{s.itemCount !== 1 ? 's' : ''}
        </p>
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-500">Total / year</p>
            <AmountDisplay amount={s.totalAmount} className="font-semibold text-black dark:text-white" />
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide' : 'View'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="px-2"
              onClick={() => setEditOpen(true)}
              title="Edit fee items"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <ConfirmDialog
              title="Delete Fee Structure"
              description={`Delete the fee structure for ${s.className}? This cannot be undone.`}
              onConfirm={handleDelete}
              confirmLabel="Delete"
              variant="destructive"
              trigger={
                <Button variant="outline" size="sm" className="px-2 text-error-600 border-red-200 hover:bg-error-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              }
            />
          </div>
        </div>

        {expanded && (
          <div className="mt-3 border-t pt-3 space-y-1.5">
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              detail?.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.feeCategoryName}</span>
                  <AmountDisplay amount={item.amount} className="text-gray-700" />
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {detail && editOpen && (
        <EditStructureDialog
          structure={detail}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function FeeStructuresPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);

  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const [selectedYearId, setSelectedYearId] = useState<string>('');

  const academicYearId = selectedYearId || currentYear?.id || '';
  const { data: structures, isLoading } = useFeeStructures(academicYearId || undefined);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fee Structures"
        description="Define fee items per class and academic year"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCategorySheetOpen(true)}>
              <Tag className="h-4 w-4 mr-1" />
              Categories
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              size="sm"
              onClick={() => setFormOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Structure
            </Button>
          </div>
        }
      />

      <div className="flex gap-3 items-center">
        <Select
          value={academicYearId}
          onValueChange={(v) => setSelectedYearId(v ?? '')}
        >
          <SelectTrigger className="w-48">
            <span className={academicYearId ? '' : 'text-muted-foreground'}>
              {academicYearId
                ? (() => {
                    const y = allYears?.find((y) => y.id === academicYearId);
                    return y ? `${y.name}${y.isCurrent ? ' (Current)' : ''}` : 'Loading…';
                  })()
                : 'Select academic year'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {allYears?.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name} {y.isCurrent && '(Current)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-sm" />
          ))}
        </div>
      ) : !structures || structures.length === 0 ? (
        <EmptyState message="No fee structures found for this academic year." icon={FileText} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {structures.map((s) => (
            <FeeStructureCard key={s.id} s={s} />
          ))}
        </div>
      )}

      <FeeStructureForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => setFormOpen(false)}
      />

      <CategoryManagerModal
        open={categorySheetOpen}
        onClose={() => setCategorySheetOpen(false)}
      />
    </div>
  );
}
