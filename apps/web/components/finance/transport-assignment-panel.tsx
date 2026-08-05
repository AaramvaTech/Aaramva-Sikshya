'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { ConfigSection } from '@/components/shared/config-section';
import { EmptyState } from '@/components/shared/empty-state';
import { BsDate } from '@/components/shared/bs-date';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { Button } from '@/components/ui/button';
import { useTransportRoutes } from '@/lib/hooks/use-bill-catalog';
import {
  useStudentTransportAssignments, useCreateTransportAssignment,
  useUpdateTransportAssignment, useDeleteTransportAssignment,
} from '@/lib/hooks/use-bill-assignment';
import { extractApiErrors } from '@/lib/api-errors';
import { useAuthStore } from '@/store/auth.store';

const nativeSelect =
  'h-9 rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white';

interface Props {
  studentId: string;
  onChanged: () => void;
}

/** UI-2 §5.1.D — year-agnostic by design (no academicYearId field on this
 * resource, confirmed from the DTO), unlike the other three panels. */
export function TransportAssignmentPanel({ studentId, onChanged }: Props) {
  const canDelete = useAuthStore((s) => s.user?.role === 'SCHOOL_OWNER' || s.user?.role === 'PLATFORM_ADMIN');
  const { data: routes } = useTransportRoutes();
  const { data: assignments, isLoading } = useStudentTransportAssignments(studentId);

  const create = useCreateTransportAssignment();
  const update = useUpdateTransportAssignment();
  const remove = useDeleteTransportAssignment();

  const [form, setForm] = useState({ transportRouteId: '', effectiveFrom: '', effectiveTo: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ transportRouteId: '', effectiveFrom: '', effectiveTo: '' });

  const routeName = (id: string) => routes?.find((r) => r.id === id)?.name ?? id;

  async function handleCreate() {
    if (!form.transportRouteId || !form.effectiveFrom) return;
    try {
      await create.mutateAsync({
        studentId, transportRouteId: form.transportRouteId,
        effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || undefined,
      });
      setForm({ transportRouteId: '', effectiveFrom: '', effectiveTo: '' });
      toast.success('Transport assignment added');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to add transport assignment').forEach((m) => toast.error(m));
    }
  }

  async function handleUpdate(id: string) {
    try {
      await update.mutateAsync({
        id,
        data: {
          transportRouteId: editForm.transportRouteId || undefined,
          effectiveFrom: editForm.effectiveFrom || undefined,
          effectiveTo: editForm.effectiveTo || undefined,
        },
      });
      setEditId(null);
      toast.success('Transport assignment updated');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to update transport assignment').forEach((m) => toast.error(m));
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Transport assignment deleted');
      onChanged();
    } catch (err) {
      extractApiErrors(err, 'Failed to delete transport assignment').forEach((m) => toast.error(m));
    }
  }

  return (
    <ConfigSection
      title="Transport"
      description="Which bus route this student is billed for"
      isLoading={isLoading}
      addSlot={
        <div className="flex flex-wrap items-center gap-2">
          <select className={nativeSelect} value={form.transportRouteId} onChange={(e) => setForm((p) => ({ ...p, transportRouteId: e.target.value }))}>
            <option value="">Route…</option>
            {routes?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <BsDateInput value={form.effectiveFrom} onChange={(ad) => setForm((p) => ({ ...p, effectiveFrom: ad }))} label="Effective From" />
          <BsDateInput value={form.effectiveTo} onChange={(ad) => setForm((p) => ({ ...p, effectiveTo: ad }))} label="Effective To (optional)" />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={!form.transportRouteId || !form.effectiveFrom || create.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      }
    >
      {assignments && assignments.length === 0 && <EmptyState message="No transport assignment for this student." />}
      {assignments?.map((a) => (
        <div key={a.id} className="border-b border-gray-100 py-3 last:border-0 dark:border-gray-800">
          {editId === a.id ? (
            <div className="flex flex-wrap items-center gap-2">
              <select className={nativeSelect} value={editForm.transportRouteId} onChange={(e) => setEditForm((p) => ({ ...p, transportRouteId: e.target.value }))}>
                {routes?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <BsDateInput value={editForm.effectiveFrom} onChange={(ad) => setEditForm((p) => ({ ...p, effectiveFrom: ad }))} />
              <BsDateInput value={editForm.effectiveTo} onChange={(ad) => setEditForm((p) => ({ ...p, effectiveTo: ad }))} />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(a.id)} disabled={update.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-gray-800 dark:text-white">{routeName(a.transportRouteId)}</span>
                <span className="text-xs text-gray-500"><BsDate date={a.effectiveFrom} /> — {a.effectiveTo ? <BsDate date={a.effectiveTo} /> : 'ongoing'}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600"
                  onClick={() => { setEditId(a.id); setEditForm({ transportRouteId: a.transportRouteId, effectiveFrom: a.effectiveFrom, effectiveTo: a.effectiveTo ?? '' }); }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                {canDelete && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(a.id)}>
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
