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
import { useFeeHeads } from '@/lib/hooks/use-bill-catalog';
import {
  useFeeOverrides, useCreateFeeOverride, useUpdateFeeOverride, useDeleteFeeOverride,
} from '@/lib/hooks/use-bill-assignment';
import { extractApiErrors } from '@/lib/api-errors';
import { useAuthStore } from '@/store/auth.store';

const nativeSelect =
  'h-9 rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white';

function emptyForm() {
  return { feeHeadId: '', overrideAmount: '', reason: '', effectiveFrom: '', effectiveTo: '' };
}

interface Props {
  studentId: string;
  academicYearId: string;
  onChanged: () => void;
}

export function FeeOverridesPanel({ studentId, academicYearId, onChanged }: Props) {
  const canDelete = useAuthStore((s) => s.user?.role === 'SCHOOL_OWNER' || s.user?.role === 'PLATFORM_ADMIN');
  const { data: feeHeads } = useFeeHeads();
  const { data: overrides, isLoading } = useFeeOverrides({ studentId, academicYearId });

  const create = useCreateFeeOverride();
  const update = useUpdateFeeOverride();
  const remove = useDeleteFeeOverride();

  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ overrideAmount: '', reason: '', effectiveFrom: '', effectiveTo: '' });

  const feeHeadName = (id: string) => feeHeads?.find((h) => h.id === id)?.name ?? id;

  async function handleCreate() {
    const amount = Number(form.overrideAmount);
    if (!form.feeHeadId || !form.effectiveFrom || Number.isNaN(amount)) return;
    try {
      await create.mutateAsync({
        studentId, feeHeadId: form.feeHeadId, academicYearId,
        overrideAmount: amount.toFixed(2), reason: form.reason.trim() || undefined,
        effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || undefined,
      });
      setForm(emptyForm());
      toast.success('Override added');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to add override').forEach((m) => toast.error(m));
    }
  }

  async function handleUpdate(id: string) {
    const amount = Number(editForm.overrideAmount);
    if (Number.isNaN(amount)) return;
    try {
      await update.mutateAsync({
        id,
        data: {
          overrideAmount: amount.toFixed(2), reason: editForm.reason.trim() || undefined,
          effectiveFrom: editForm.effectiveFrom || undefined, effectiveTo: editForm.effectiveTo || undefined,
        },
      });
      setEditId(null);
      toast.success('Override updated');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to update override').forEach((m) => toast.error(m));
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Override deleted');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to delete override').forEach((m) => toast.error(m));
    }
  }

  return (
    <ConfigSection
      title="Fee Overrides"
      description="Replace a fee head's structure amount for this student"
      isLoading={isLoading}
      addSlot={
        <div className="flex flex-wrap items-center gap-2">
          <select className={nativeSelect} value={form.feeHeadId} onChange={(e) => setForm((p) => ({ ...p, feeHeadId: e.target.value }))}>
            <option value="">Fee head…</option>
            {feeHeads?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <Input type="number" step="0.01" placeholder="Amount" value={form.overrideAmount} onChange={(e) => setForm((p) => ({ ...p, overrideAmount: e.target.value }))} className="w-28" />
          <Input placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} className="w-44" />
          <BsDateInput value={form.effectiveFrom} onChange={(ad) => setForm((p) => ({ ...p, effectiveFrom: ad }))} label="Effective From" />
          <BsDateInput value={form.effectiveTo} onChange={(ad) => setForm((p) => ({ ...p, effectiveTo: ad }))} label="Effective To (optional)" />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={!form.feeHeadId || !form.overrideAmount || !form.effectiveFrom || create.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      }
    >
      {overrides && overrides.length === 0 && <EmptyState message="No overrides for this student/year." />}
      {overrides?.map((o) => (
        <div key={o.id} className="border-b border-gray-100 py-3 last:border-0 dark:border-gray-800">
          {editId === o.id ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" step="0.01" value={editForm.overrideAmount} onChange={(e) => setEditForm((p) => ({ ...p, overrideAmount: e.target.value }))} className="h-8 w-28 text-sm" autoFocus />
              <Input placeholder="Reason" value={editForm.reason} onChange={(e) => setEditForm((p) => ({ ...p, reason: e.target.value }))} className="h-8 w-44 text-sm" />
              <BsDateInput value={editForm.effectiveFrom} onChange={(ad) => setEditForm((p) => ({ ...p, effectiveFrom: ad }))} />
              <BsDateInput value={editForm.effectiveTo} onChange={(ad) => setEditForm((p) => ({ ...p, effectiveTo: ad }))} />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(o.id)} disabled={update.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-gray-800 dark:text-white">{o.feeHeadName ?? feeHeadName(o.feeHeadId)}</span>
                <span className="text-xs text-gray-500">Rs. {o.overrideAmount.toLocaleString('en-IN')}</span>
                {o.reason && <span className="text-xs text-gray-400">{o.reason}</span>}
                <span className="text-xs text-gray-500"><BsDate date={o.effectiveFrom} /> — {o.effectiveTo ? <BsDate date={o.effectiveTo} /> : 'ongoing'}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600"
                  onClick={() => { setEditId(o.id); setEditForm({ overrideAmount: String(o.overrideAmount), reason: o.reason ?? '', effectiveFrom: o.effectiveFrom, effectiveTo: o.effectiveTo ?? '' }); }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                {canDelete && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(o.id)}>
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
