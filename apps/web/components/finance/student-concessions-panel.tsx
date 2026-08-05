'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { ConfigSection } from '@/components/shared/config-section';
import { EmptyState } from '@/components/shared/empty-state';
import { BsDate } from '@/components/shared/bs-date';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useFeeHeads, useDiscountReasons } from '@/lib/hooks/use-bill-catalog';
import {
  useStudentConcessions, useCreateConcession, useUpdateConcession, useDeleteConcession,
} from '@/lib/hooks/use-bill-assignment';
import { extractApiErrors } from '@/lib/api-errors';
import { useAuthStore } from '@/store/auth.store';
import type { ConcessionType } from '@/types/api.types';

const nativeSelect =
  'h-9 rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white';

const WHOLE_BILL = '__WHOLE_BILL__';

function emptyForm() {
  return {
    feeHeadId: WHOLE_BILL, type: 'PERCENT' as ConcessionType, value: '', capAmount: '',
    discountReasonId: '', effectiveFrom: '', effectiveTo: '', notes: '',
  };
}

interface Props {
  studentId: string;
  academicYearId: string;
  onChanged: () => void;
}

/** UI-2 §5.1.C — `value` is money-formatted regardless of type (PERCENT
 * concessions store e.g. "10.00" meaning 10%, per @IsMoneyString() on the
 * backend DTO) — the label switches with `type` so this doesn't read as a
 * bug. `feeHeadId` "Whole bill" maps to `undefined` on submit. */
export function StudentConcessionsPanel({ studentId, academicYearId, onChanged }: Props) {
  const canDelete = useAuthStore((s) => s.user?.role === 'SCHOOL_OWNER' || s.user?.role === 'PLATFORM_ADMIN');
  const { data: feeHeads } = useFeeHeads();
  const { data: discountReasons } = useDiscountReasons();
  const { data: concessions, isLoading } = useStudentConcessions({ studentId, academicYearId });

  const create = useCreateConcession();
  const update = useUpdateConcession();
  const remove = useDeleteConcession();

  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ type: 'PERCENT' as ConcessionType, value: '', capAmount: '', discountReasonId: '', effectiveFrom: '', effectiveTo: '', notes: '' });

  const feeHeadName = (id: string) => feeHeads?.find((h) => h.id === id)?.name ?? id;
  const reasonName = (id: string) => discountReasons?.find((r) => r.id === id)?.name ?? id;

  async function handleCreate() {
    const value = Number(form.value);
    if (!form.discountReasonId || !form.effectiveFrom || Number.isNaN(value)) return;
    try {
      await create.mutateAsync({
        studentId, academicYearId,
        feeHeadId: form.feeHeadId === WHOLE_BILL ? undefined : form.feeHeadId,
        type: form.type, value: value.toFixed(2),
        capAmount: form.capAmount ? Number(form.capAmount).toFixed(2) : undefined,
        discountReasonId: form.discountReasonId,
        effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || undefined,
        notes: form.notes.trim() || undefined,
      });
      setForm(emptyForm());
      toast.success('Concession added');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to add concession').forEach((m) => toast.error(m));
    }
  }

  async function handleUpdate(id: string) {
    const value = Number(editForm.value);
    if (Number.isNaN(value)) return;
    try {
      await update.mutateAsync({
        id,
        data: {
          type: editForm.type, value: value.toFixed(2),
          capAmount: editForm.capAmount ? Number(editForm.capAmount).toFixed(2) : undefined,
          discountReasonId: editForm.discountReasonId || undefined,
          effectiveFrom: editForm.effectiveFrom || undefined, effectiveTo: editForm.effectiveTo || undefined,
          notes: editForm.notes.trim() || undefined,
        },
      });
      setEditId(null);
      toast.success('Concession updated');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to update concession').forEach((m) => toast.error(m));
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Concession deleted');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to delete concession').forEach((m) => toast.error(m));
    }
  }

  return (
    <ConfigSection
      title="Concessions"
      description="Percent or flat-amount discounts, on one fee head or the whole bill"
      isLoading={isLoading}
      addSlot={
        <div className="flex flex-wrap items-center gap-2">
          <select className={nativeSelect} value={form.feeHeadId} onChange={(e) => setForm((p) => ({ ...p, feeHeadId: e.target.value }))}>
            <option value={WHOLE_BILL}>Whole bill</option>
            {feeHeads?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select className={nativeSelect} value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as ConcessionType }))}>
            <option value="PERCENT">Percent</option>
            <option value="AMOUNT">Amount</option>
          </select>
          <Input type="number" step="0.01" placeholder={form.type === 'PERCENT' ? 'Percent' : 'Amount'} value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} className="w-24" />
          <Input type="number" step="0.01" placeholder="Cap Rs. (optional)" value={form.capAmount} onChange={(e) => setForm((p) => ({ ...p, capAmount: e.target.value }))} className="w-32" />
          <select className={nativeSelect} value={form.discountReasonId} onChange={(e) => setForm((p) => ({ ...p, discountReasonId: e.target.value }))}>
            <option value="">Reason…</option>
            {discountReasons?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <BsDateInput value={form.effectiveFrom} onChange={(ad) => setForm((p) => ({ ...p, effectiveFrom: ad }))} label="Effective From" />
          <BsDateInput value={form.effectiveTo} onChange={(ad) => setForm((p) => ({ ...p, effectiveTo: ad }))} label="Effective To (optional)" />
          <Input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-44" />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={!form.discountReasonId || !form.value || !form.effectiveFrom || create.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      }
    >
      {concessions && concessions.length === 0 && <EmptyState message="No concessions for this student/year." />}
      {concessions?.map((c) => (
        <div key={c.id} className="border-b border-gray-100 py-3 last:border-0 dark:border-gray-800">
          {editId === c.id ? (
            <div className="flex flex-wrap items-center gap-2">
              <select className={nativeSelect} value={editForm.type} onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value as ConcessionType }))}>
                <option value="PERCENT">Percent</option>
                <option value="AMOUNT">Amount</option>
              </select>
              <Input type="number" step="0.01" value={editForm.value} onChange={(e) => setEditForm((p) => ({ ...p, value: e.target.value }))} className="h-8 w-24 text-sm" autoFocus />
              <Input type="number" step="0.01" placeholder="Cap" value={editForm.capAmount} onChange={(e) => setEditForm((p) => ({ ...p, capAmount: e.target.value }))} className="h-8 w-24 text-sm" />
              <select className={nativeSelect} value={editForm.discountReasonId} onChange={(e) => setEditForm((p) => ({ ...p, discountReasonId: e.target.value }))}>
                {discountReasons?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <BsDateInput value={editForm.effectiveFrom} onChange={(ad) => setEditForm((p) => ({ ...p, effectiveFrom: ad }))} />
              <BsDateInput value={editForm.effectiveTo} onChange={(ad) => setEditForm((p) => ({ ...p, effectiveTo: ad }))} />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(c.id)} disabled={update.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {c.feeHeadId ? (c.feeHeadName ?? feeHeadName(c.feeHeadId)) : 'Whole bill'}
                </span>
                <Badge variant="outline" className="text-xs">
                  {c.type === 'PERCENT' ? `${c.value}%` : `Rs. ${c.value.toLocaleString('en-IN')}`}
                </Badge>
                {c.capAmount != null && <span className="text-xs text-gray-400">cap Rs. {c.capAmount.toLocaleString('en-IN')}</span>}
                <span className="text-xs text-gray-500">{c.discountReasonName ?? reasonName(c.discountReasonId)}</span>
                <span className="text-xs text-gray-500"><BsDate date={c.effectiveFrom} /> — {c.effectiveTo ? <BsDate date={c.effectiveTo} /> : 'ongoing'}</span>
                {c.notes && <span className="text-xs text-gray-400">{c.notes}</span>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600"
                  onClick={() => { setEditId(c.id); setEditForm({ type: c.type, value: String(c.value), capAmount: c.capAmount != null ? String(c.capAmount) : '', discountReasonId: c.discountReasonId, effectiveFrom: c.effectiveFrom, effectiveTo: c.effectiveTo ?? '', notes: c.notes ?? '' }); }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                {canDelete && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </ConfigSection>
  );
}
