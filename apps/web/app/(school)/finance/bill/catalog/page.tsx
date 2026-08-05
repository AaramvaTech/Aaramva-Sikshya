'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Edit2, Trash2, Check, X, Plus,
  Tag, Layers, Percent, PercentCircle, Bus, Receipt, AlarmClockOff,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ConfigSection, ConfigRow } from '@/components/shared/config-section';
import { EmptyState } from '@/components/shared/empty-state';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { ColumnDef } from '@tanstack/react-table';
import {
  useFeeHeads, useCreateFeeHead, useUpdateFeeHead, useDeleteFeeHead,
  useDiscountReasons, useCreateDiscountReason, useUpdateDiscountReason, useDeleteDiscountReason,
  useCorrectionReasons, useCreateCorrectionReason, useUpdateCorrectionReason, useDeleteCorrectionReason,
  useTransportRoutes, useCreateTransportRoute, useUpdateTransportRoute, useDeleteTransportRoute,
  useTaxRates, useCreateTaxRate, useUpdateTaxRate, useDeleteTaxRate,
  useLateFeeRules, useCreateLateFeeRule, useUpdateLateFeeRule, useDeleteLateFeeRule,
  useFeeStructures, useDeleteFeeStructure,
} from '@/lib/hooks/use-bill-catalog';
import { useClasses, useAcademicYears } from '@/lib/hooks/use-students';
import { extractApiErrors } from '@/lib/api-errors';
import { BillFeeStructureDialog } from '@/components/finance/bill-fee-structure-dialog';
import type {
  FeeHead, FeeHeadRecurrence, ProrationPolicy,
  DiscountReason, CorrectionReason, TransportRoute,
  TaxRate, TaxAppliesTo,
  LateFeeRule, LateFeeRuleScope, LateFeeRuleType,
  BillFeeStructure,
} from '@/types/api.types';

type Tab = 'fee-heads' | 'fee-structures' | 'discount-reasons' | 'correction-reasons' | 'transport-routes' | 'tax-rates' | 'late-fee-rules';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'fee-heads', label: 'Fee Heads', icon: <Tag className="h-4 w-4" /> },
  { key: 'fee-structures', label: 'Fee Structures', icon: <Layers className="h-4 w-4" /> },
  { key: 'discount-reasons', label: 'Discount Reasons', icon: <Percent className="h-4 w-4" /> },
  { key: 'correction-reasons', label: 'Correction Reasons', icon: <PercentCircle className="h-4 w-4" /> },
  { key: 'transport-routes', label: 'Transport Routes', icon: <Bus className="h-4 w-4" /> },
  { key: 'tax-rates', label: 'Tax Rates', icon: <Receipt className="h-4 w-4" /> },
  { key: 'late-fee-rules', label: 'Late Fee Rules', icon: <AlarmClockOff className="h-4 w-4" /> },
];

export default function FeeCatalogPage() {
  const [activeTab, setActiveTab] = useState<Tab>('fee-heads');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Catalog"
        description="Fee heads, structures, and the rules billing runs are built from"
      />

      <div className="flex flex-wrap border-b border-stroke dark:border-strokedark">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ' +
              (activeTab === tab.key
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700')
            }
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'fee-heads' && <FeeHeadsTab />}
      {activeTab === 'fee-structures' && <FeeStructuresTab />}
      {activeTab === 'discount-reasons' && <DiscountReasonsTab />}
      {activeTab === 'correction-reasons' && <CorrectionReasonsTab />}
      {activeTab === 'transport-routes' && <TransportRoutesTab />}
      {activeTab === 'tax-rates' && <TaxRatesTab />}
      {activeTab === 'late-fee-rules' && <LateFeeRulesTab />}
    </div>
  );
}

// ── Fee Heads ──────────────────────────────────────────────────────────────

const RECURRENCE_OPTIONS: FeeHeadRecurrence[] = ['MONTHLY', 'QUARTERLY', 'TERM', 'ANNUAL', 'ONE_TIME', 'ON_DEMAND'];
const PRORATION_OPTIONS: ProrationPolicy[] = ['NONE', 'MONTHLY'];

const nativeSelect = 'h-9 rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white';

function emptyFeeHeadForm() {
  return { name: '', code: '', recurrence: 'MONTHLY' as FeeHeadRecurrence, isTaxable: false, isRefundable: false, prorationPolicy: 'NONE' as ProrationPolicy, glAccountCode: '' };
}

function FeeHeadsTab() {
  const { data: feeHeads, isLoading } = useFeeHeads();
  const create = useCreateFeeHead();
  const update = useUpdateFeeHead();
  const remove = useDeleteFeeHead();

  const [form, setForm] = useState(emptyFeeHeadForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyFeeHeadForm());

  async function handleCreate() {
    if (!form.name.trim() || !form.code.trim()) return;
    try {
      await create.mutateAsync({
        name: form.name.trim(), code: form.code.trim(), recurrence: form.recurrence,
        isTaxable: form.isTaxable, isRefundable: form.isRefundable, prorationPolicy: form.prorationPolicy,
        glAccountCode: form.glAccountCode.trim() || undefined,
      });
      setForm(emptyFeeHeadForm());
      toast.success('Fee head created');
    } catch (err) {
      extractApiErrors(err, 'Failed to create fee head').forEach((m) => toast.error(m));
    }
  }

  async function handleUpdate(id: string) {
    if (!editForm.name.trim() || !editForm.code.trim()) return;
    try {
      await update.mutateAsync({
        id,
        data: {
          name: editForm.name.trim(), code: editForm.code.trim(), recurrence: editForm.recurrence,
          isTaxable: editForm.isTaxable, isRefundable: editForm.isRefundable, prorationPolicy: editForm.prorationPolicy,
          glAccountCode: editForm.glAccountCode.trim() || undefined,
        },
      });
      setEditId(null);
      toast.success('Fee head updated');
    } catch (err) {
      extractApiErrors(err, 'Failed to update fee head').forEach((m) => toast.error(m));
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Fee head deleted');
    } catch (err) {
      extractApiErrors(err, 'Failed to delete fee head').forEach((m) => toast.error(m));
    }
  }

  return (
    <ConfigSection
      title="Fee Heads"
      description="What a school actually charges for — Tuition, Transport, Exam Fee, etc. Every fee structure and late-fee rule references these."
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2 flex-wrap items-center">
          <Input placeholder="Name (e.g. Tuition)" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="max-w-48" />
          <Input placeholder="Code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} className="w-28" />
          <select className={nativeSelect} value={form.recurrence} onChange={(e) => setForm((p) => ({ ...p, recurrence: e.target.value as FeeHeadRecurrence }))}>
            {RECURRENCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className={nativeSelect} value={form.prorationPolicy} onChange={(e) => setForm((p) => ({ ...p, prorationPolicy: e.target.value as ProrationPolicy }))}>
            {PRORATION_OPTIONS.map((p) => <option key={p} value={p}>Proration: {p}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={form.isTaxable} onChange={(e) => setForm((p) => ({ ...p, isTaxable: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-brand-500" />
            Taxable
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={form.isRefundable} onChange={(e) => setForm((p) => ({ ...p, isRefundable: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-brand-500" />
            Refundable
          </label>
          <Input placeholder="GL code (optional)" value={form.glAccountCode} onChange={(e) => setForm((p) => ({ ...p, glAccountCode: e.target.value }))} className="w-32" />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={!form.name.trim() || !form.code.trim() || create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      }
    >
      {feeHeads && feeHeads.length === 0 && <EmptyState message="No fee heads yet. Add one above." />}
      {feeHeads?.map((h: FeeHead) => (
        <div key={h.id} className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
          {editId === h.id ? (
            <div className="flex gap-2 flex-wrap items-center">
              <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="max-w-48 h-8 text-sm" autoFocus />
              <Input value={editForm.code} onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))} className="w-28 h-8 text-sm" />
              <select className={nativeSelect} value={editForm.recurrence} onChange={(e) => setEditForm((p) => ({ ...p, recurrence: e.target.value as FeeHeadRecurrence }))}>
                {RECURRENCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={editForm.isTaxable} onChange={(e) => setEditForm((p) => ({ ...p, isTaxable: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-brand-500" />
                Taxable
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={editForm.isRefundable} onChange={(e) => setEditForm((p) => ({ ...p, isRefundable: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-brand-500" />
                Refundable
              </label>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(h.id)} disabled={update.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-gray-800 dark:text-white">{h.name}</span>
                <span className="text-xs text-gray-400 font-mono">{h.code}</span>
                <Badge variant="outline" className="text-xs">{h.recurrence}</Badge>
                {h.isTaxable && <Badge variant="outline" className="text-xs">Taxable</Badge>}
                {!h.isActive && <Badge variant="outline" className="text-xs text-gray-400">Inactive</Badge>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600"
                  onClick={() => {
                    setEditId(h.id);
                    setEditForm({ name: h.name, code: h.code, recurrence: h.recurrence, isTaxable: h.isTaxable, isRefundable: h.isRefundable, prorationPolicy: h.prorationPolicy, glAccountCode: h.glAccountCode ?? '' });
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(h.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </ConfigSection>
  );
}

// ── Fee Structures ─────────────────────────────────────────────────────────

function FeeStructuresTab() {
  const { data: response, isLoading } = useFeeStructures();
  const { data: classes } = useClasses();
  const { data: academicYears } = useAcademicYears();
  const remove = useDeleteFeeStructure();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingStructure, setEditingStructure] = useState<BillFeeStructure | undefined>(undefined);

  const structures = response?.data ?? [];

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Fee structure deleted');
    } catch (err) {
      extractApiErrors(err, 'Failed to delete fee structure').forEach((m) => toast.error(m));
    }
  }

  const columns: ColumnDef<BillFeeStructure>[] = [
    { id: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium text-sm">{row.original.name}</span> },
    { id: 'class', header: 'Class', cell: ({ row }) => classes?.find((c) => c.id === row.original.classId)?.name ?? '—' },
    { id: 'year', header: 'Academic Year', cell: ({ row }) => academicYears?.find((y) => y.id === row.original.academicYearId)?.name ?? '—' },
    {
      id: 'section',
      header: 'Section',
      cell: ({ row }) => {
        const cls = classes?.find((c) => c.id === row.original.classId);
        return row.original.sectionId ? (cls?.sections.find((s) => s.id === row.original.sectionId)?.name ?? '—') : 'All';
      },
    },
    { id: 'items', header: 'Items', cell: ({ row }) => row.original.items?.length ?? '—' },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            size="sm" variant="ghost"
            onClick={() => { setEditingStructure(row.original); setDialogMode('edit'); setDialogOpen(true); }}
          >
            Edit items
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(row.original.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm" className="bg-brand-500 hover:bg-brand-600 text-white"
          onClick={() => { setEditingStructure(undefined); setDialogMode('create'); setDialogOpen(true); }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Fee Structure
        </Button>
      </div>
      <DataTable columns={columns} data={structures} isLoading={isLoading} />
      <BillFeeStructureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        structure={editingStructure}
      />
    </div>
  );
}

// ── Discount Reasons ────────────────────────────────────────────────────────

function DiscountReasonsTab() {
  const { data: reasons, isLoading } = useDiscountReasons();
  const create = useCreateDiscountReason();
  const update = useUpdateDiscountReason();
  const remove = useDeleteDiscountReason();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function handleCreate() {
    if (!name.trim() || !code.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), code: code.trim() });
      setName(''); setCode('');
      toast.success('Discount reason created');
    } catch (err) {
      extractApiErrors(err, 'Failed to create discount reason').forEach((m) => toast.error(m));
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    try {
      await update.mutateAsync({ id, data: { name: editName.trim() } });
      setEditId(null);
      toast.success('Discount reason updated');
    } catch (err) {
      extractApiErrors(err, 'Failed to update discount reason').forEach((m) => toast.error(m));
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Discount reason deleted');
    } catch (err) {
      extractApiErrors(err, 'Failed to delete discount reason').forEach((m) => toast.error(m));
    }
  }

  return (
    <ConfigSection
      title="Discount Reasons"
      description="Why a concession was given (e.g. Sibling Discount, Staff Ward, Merit Scholarship) — shown on every concession granted to a student."
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2">
          <Input placeholder="Reason name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className="w-28" />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={!name.trim() || !code.trim() || create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      }
    >
      {reasons && reasons.length === 0 && <EmptyState message="No discount reasons yet. Add one above." />}
      {reasons?.map((r: DiscountReason) => (
        <ConfigRow
          key={r.id}
          isEditing={editId === r.id}
          editValue={editName}
          onEditChange={setEditName}
          onStartEdit={() => { setEditId(r.id); setEditName(r.name); }}
          onSave={() => handleUpdate(r.id)}
          onCancel={() => setEditId(null)}
          onDelete={() => handleDelete(r.id)}
          isSaving={update.isPending}
        >
          <div>
            <span className="font-medium text-sm text-gray-800 dark:text-white">{r.name}</span>
            <span className="ml-2 text-xs text-gray-400 font-mono">{r.code}</span>
          </div>
        </ConfigRow>
      ))}
    </ConfigSection>
  );
}

// ── Correction Reasons ──────────────────────────────────────────────────────

function CorrectionReasonsTab() {
  const { data: reasons, isLoading } = useCorrectionReasons();
  const create = useCreateCorrectionReason();
  const update = useUpdateCorrectionReason();
  const remove = useDeleteCorrectionReason();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function handleCreate() {
    if (!name.trim() || !code.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), code: code.trim() });
      setName(''); setCode('');
      toast.success('Correction reason created');
    } catch (err) {
      extractApiErrors(err, 'Failed to create correction reason').forEach((m) => toast.error(m));
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    try {
      await update.mutateAsync({ id, data: { name: editName.trim() } });
      setEditId(null);
      toast.success('Correction reason updated');
    } catch (err) {
      extractApiErrors(err, 'Failed to update correction reason').forEach((m) => toast.error(m));
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Correction reason deleted');
    } catch (err) {
      extractApiErrors(err, 'Failed to delete correction reason').forEach((m) => toast.error(m));
    }
  }

  return (
    <ConfigSection
      title="Correction Reasons"
      description="Why a credit note, refund, or write-off was issued (e.g. Billing Error, Family Relocated) — a different domain from discount reasons, used after a bill is already posted."
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2">
          <Input placeholder="Reason name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className="w-28" />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={!name.trim() || !code.trim() || create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      }
    >
      {reasons && reasons.length === 0 && <EmptyState message="No correction reasons yet. Add one above." />}
      {reasons?.map((r: CorrectionReason) => (
        <ConfigRow
          key={r.id}
          isEditing={editId === r.id}
          editValue={editName}
          onEditChange={setEditName}
          onStartEdit={() => { setEditId(r.id); setEditName(r.name); }}
          onSave={() => handleUpdate(r.id)}
          onCancel={() => setEditId(null)}
          onDelete={() => handleDelete(r.id)}
          isSaving={update.isPending}
        >
          <div>
            <span className="font-medium text-sm text-gray-800 dark:text-white">{r.name}</span>
            <span className="ml-2 text-xs text-gray-400 font-mono">{r.code}</span>
          </div>
        </ConfigRow>
      ))}
    </ConfigSection>
  );
}

// ── Transport Routes ────────────────────────────────────────────────────────

function TransportRoutesTab() {
  const { data: routes, isLoading } = useTransportRoutes();
  const create = useCreateTransportRoute();
  const update = useUpdateTransportRoute();
  const remove = useDeleteTransportRoute();

  const [form, setForm] = useState({ name: '', code: '', monthlyAmount: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', code: '', monthlyAmount: '' });

  async function handleCreate() {
    const amount = Number(form.monthlyAmount);
    if (!form.name.trim() || !form.code.trim() || !amount) return;
    try {
      await create.mutateAsync({ name: form.name.trim(), code: form.code.trim(), monthlyAmount: amount.toFixed(2) });
      setForm({ name: '', code: '', monthlyAmount: '' });
      toast.success('Transport route created');
    } catch (err) {
      extractApiErrors(err, 'Failed to create transport route').forEach((m) => toast.error(m));
    }
  }

  async function handleUpdate(id: string) {
    const amount = Number(editForm.monthlyAmount);
    if (!editForm.name.trim() || !amount) return;
    try {
      await update.mutateAsync({ id, data: { name: editForm.name.trim(), monthlyAmount: amount.toFixed(2) } });
      setEditId(null);
      toast.success('Transport route updated');
    } catch (err) {
      extractApiErrors(err, 'Failed to update transport route').forEach((m) => toast.error(m));
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Transport route deleted');
    } catch (err) {
      extractApiErrors(err, 'Failed to delete transport route').forEach((m) => toast.error(m));
    }
  }

  return (
    <ConfigSection
      title="Transport Routes"
      description="Bus routes a student can be assigned to, each with its own monthly fee."
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Route name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="max-w-48" />
          <Input placeholder="Code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} className="w-24" />
          <Input type="number" step="0.01" placeholder="Monthly Rs." value={form.monthlyAmount} onChange={(e) => setForm((p) => ({ ...p, monthlyAmount: e.target.value }))} className="w-32" />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={!form.name.trim() || !form.code.trim() || !form.monthlyAmount || create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      }
    >
      {routes && routes.length === 0 && <EmptyState message="No transport routes yet. Add one above." />}
      {routes?.map((r: TransportRoute) => (
        <div key={r.id} className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
          {editId === r.id ? (
            <div className="flex gap-2 flex-wrap items-center">
              <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="max-w-48 h-8 text-sm" autoFocus />
              <Input type="number" step="0.01" value={editForm.monthlyAmount} onChange={(e) => setEditForm((p) => ({ ...p, monthlyAmount: e.target.value }))} className="w-28 h-8 text-sm" />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(r.id)} disabled={update.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm text-gray-800 dark:text-white">{r.name}</span>
                <span className="text-xs text-gray-400 font-mono">{r.code}</span>
                <span className="text-xs text-gray-500">Rs. {r.monthlyAmount.toLocaleString('en-IN')}/mo</span>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600" onClick={() => { setEditId(r.id); setEditForm({ name: r.name, code: r.code, monthlyAmount: String(r.monthlyAmount) }); }}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </ConfigSection>
  );
}

// ── Tax Rates ────────────────────────────────────────────────────────────────

function TaxRatesTab() {
  const { data: rates, isLoading } = useTaxRates();
  const create = useCreateTaxRate();
  const update = useUpdateTaxRate();
  const remove = useDeleteTaxRate();

  const [form, setForm] = useState({ name: '', rate: '', appliesTo: 'ALL' as TaxAppliesTo, effectiveFrom: '', effectiveTo: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', effectiveFrom: '', effectiveTo: '' });

  async function handleCreate() {
    const rate = Number(form.rate);
    if (!form.name.trim() || !form.effectiveFrom || Number.isNaN(rate)) return;
    try {
      await create.mutateAsync({
        name: form.name.trim(), rate, appliesTo: form.appliesTo,
        effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || undefined,
      });
      setForm({ name: '', rate: '', appliesTo: 'ALL', effectiveFrom: '', effectiveTo: '' });
      toast.success('Tax rate created');
    } catch (err) {
      extractApiErrors(err, 'Failed to create tax rate').forEach((m) => toast.error(m));
    }
  }

  async function handleUpdate(id: string) {
    if (!editForm.name.trim()) return;
    try {
      await update.mutateAsync({ id, data: { name: editForm.name.trim(), effectiveFrom: editForm.effectiveFrom || undefined, effectiveTo: editForm.effectiveTo || undefined } });
      setEditId(null);
      toast.success('Tax rate updated');
    } catch (err) {
      extractApiErrors(err, 'Failed to update tax rate').forEach((m) => toast.error(m));
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Tax rate deleted');
    } catch (err) {
      extractApiErrors(err, 'Failed to delete tax rate').forEach((m) => toast.error(m));
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <ConfigSection
      title="Tax Rates"
      description="VAT/tax percentages applied to taxable fee heads. A rate's percentage can't be edited once created — a rate already used on real invoices must never silently change; create a new rate instead."
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2 flex-wrap items-center">
          <Input placeholder="Name (e.g. VAT 13%)" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="max-w-48" />
          <Input type="number" step="0.001" min={0} max={100} placeholder="Rate %" value={form.rate} onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))} className="w-24" />
          <select className={nativeSelect} value={form.appliesTo} onChange={(e) => setForm((p) => ({ ...p, appliesTo: e.target.value as TaxAppliesTo }))}>
            <option value="ALL">Applies to: All</option>
            <option value="TAXABLE_HEADS">Applies to: Taxable heads only</option>
          </select>
          <BsDateInput value={form.effectiveFrom} onChange={(ad) => setForm((p) => ({ ...p, effectiveFrom: ad }))} label="Effective From" />
          <BsDateInput value={form.effectiveTo} onChange={(ad) => setForm((p) => ({ ...p, effectiveTo: ad }))} label="Effective To (optional)" />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={!form.name.trim() || !form.rate || !form.effectiveFrom || create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      }
    >
      {rates && rates.length === 0 && <EmptyState message="No tax rates yet. Add one above." />}
      {rates?.map((r: TaxRate) => {
        const isActive = r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today);
        return (
          <div key={r.id} className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
            {editId === r.id ? (
              <div className="flex gap-2 flex-wrap items-center">
                <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="max-w-48 h-8 text-sm" autoFocus />
                <BsDateInput value={editForm.effectiveFrom} onChange={(ad) => setEditForm((p) => ({ ...p, effectiveFrom: ad }))} />
                <BsDateInput value={editForm.effectiveTo} onChange={(ad) => setEditForm((p) => ({ ...p, effectiveTo: ad }))} />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(r.id)} disabled={update.isPending}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium text-sm text-gray-800 dark:text-white">{r.name}</span>
                  <Badge variant="outline" className="text-xs">{r.rate}%</Badge>
                  <span className="text-xs text-gray-400">{r.appliesTo === 'ALL' ? 'All heads' : 'Taxable heads only'}</span>
                  <span className="text-xs text-gray-500"><BsDate date={r.effectiveFrom} /> — {r.effectiveTo ? <BsDate date={r.effectiveTo} /> : 'ongoing'}</span>
                  <StatusBadge status={isActive ? 'ACTIVE' : 'INACTIVE'} />
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600" onClick={() => { setEditId(r.id); setEditForm({ name: r.name, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo ?? '' }); }}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </ConfigSection>
  );
}

// ── Late Fee Rules ───────────────────────────────────────────────────────────

const LATE_FEE_TYPES: LateFeeRuleType[] = ['FLAT', 'PER_DAY', 'PERCENT'];
const VALUE_LABEL: Record<LateFeeRuleType, string> = {
  FLAT: 'Flat amount (Rs.)', PER_DAY: 'Amount per day (Rs.)', PERCENT: 'Percent of outstanding (%)',
};

function emptyLateFeeForm() {
  return { scope: 'GLOBAL' as LateFeeRuleScope, feeHeadId: '', type: 'PER_DAY' as LateFeeRuleType, value: '', graceDays: '0', capAmount: '', isEnabled: false, effectiveFrom: '', effectiveTo: '' };
}

function LateFeeRulesTab() {
  const { data: rules, isLoading } = useLateFeeRules();
  const { data: feeHeads } = useFeeHeads();
  const create = useCreateLateFeeRule();
  const update = useUpdateLateFeeRule();
  const remove = useDeleteLateFeeRule();

  const [form, setForm] = useState(emptyLateFeeForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ value: '', graceDays: '0', capAmount: '', isEnabled: false, effectiveFrom: '', effectiveTo: '' });

  async function handleCreate() {
    const value = Number(form.value);
    if (!form.effectiveFrom || Number.isNaN(value) || (form.scope === 'FEE_HEAD' && !form.feeHeadId)) return;
    try {
      await create.mutateAsync({
        scope: form.scope, feeHeadId: form.scope === 'FEE_HEAD' ? form.feeHeadId : undefined, type: form.type,
        value: value.toFixed(2), graceDays: Number(form.graceDays) || 0,
        capAmount: form.capAmount ? Number(form.capAmount).toFixed(2) : undefined,
        isEnabled: form.isEnabled, effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || undefined,
      });
      setForm(emptyLateFeeForm());
      toast.success('Late fee rule created');
    } catch (err) {
      extractApiErrors(err, 'Failed to create late fee rule').forEach((m) => toast.error(m));
    }
  }

  async function handleUpdate(id: string) {
    const value = Number(editForm.value);
    if (Number.isNaN(value)) return;
    try {
      await update.mutateAsync({
        id,
        data: {
          value: value.toFixed(2), graceDays: Number(editForm.graceDays) || 0,
          capAmount: editForm.capAmount ? Number(editForm.capAmount).toFixed(2) : undefined,
          isEnabled: editForm.isEnabled, effectiveFrom: editForm.effectiveFrom || undefined, effectiveTo: editForm.effectiveTo || undefined,
        },
      });
      setEditId(null);
      toast.success('Late fee rule updated');
    } catch (err) {
      extractApiErrors(err, 'Failed to update late fee rule').forEach((m) => toast.error(m));
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Late fee rule deleted');
    } catch (err) {
      extractApiErrors(err, 'Failed to delete late fee rule').forEach((m) => toast.error(m));
    }
  }

  return (
    <ConfigSection
      title="Late Fee Rules"
      description="Automatic fines for overdue bills. Off by default per rule — no school gets surprise fines. Turning a rule on starts real, automatic charges the moment it runs."
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2 flex-wrap items-end">
          <select className={nativeSelect} value={form.scope} onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value as LateFeeRuleScope, feeHeadId: '' }))}>
            <option value="GLOBAL">Scope: Whole bill</option>
            <option value="FEE_HEAD">Scope: One fee head</option>
          </select>
          {form.scope === 'FEE_HEAD' && (
            <select className={nativeSelect} value={form.feeHeadId} onChange={(e) => setForm((p) => ({ ...p, feeHeadId: e.target.value }))}>
              <option value="">Select fee head…</option>
              {feeHeads?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
          <select className={nativeSelect} value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as LateFeeRuleType }))}>
            {LATE_FEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{VALUE_LABEL[form.type]}</label>
            <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} className="w-32" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Grace days</label>
            <Input type="number" min={0} value={form.graceDays} onChange={(e) => setForm((p) => ({ ...p, graceDays: e.target.value }))} className="w-24" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Cap (optional)</label>
            <Input type="number" step="0.01" value={form.capAmount} onChange={(e) => setForm((p) => ({ ...p, capAmount: e.target.value }))} className="w-24" />
          </div>
          <BsDateInput value={form.effectiveFrom} onChange={(ad) => setForm((p) => ({ ...p, effectiveFrom: ad }))} label="Effective From" />
          <BsDateInput value={form.effectiveTo} onChange={(ad) => setForm((p) => ({ ...p, effectiveTo: ad }))} label="Effective To (optional)" />
          <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={!form.effectiveFrom || !form.value || create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none rounded-md border border-warning-300 bg-warning-25 dark:bg-warning-500/10 px-3 py-2">
            <input type="checkbox" checked={form.isEnabled} onChange={(e) => setForm((p) => ({ ...p, isEnabled: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-brand-500" />
            <span>
              Enable immediately
              <span className="block text-xs text-gray-400">Off by default — no school gets surprise fines. Turning this on starts real, automatic charges.</span>
            </span>
          </label>
        </div>
      }
    >
      {rules && rules.length === 0 && <EmptyState message="No late fee rules yet. Add one above." />}
      {rules?.map((r: LateFeeRule) => (
        <div key={r.id} className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
          {editId === r.id ? (
            <div className="flex gap-2 flex-wrap items-center">
              <Input type="number" step="0.01" value={editForm.value} onChange={(e) => setEditForm((p) => ({ ...p, value: e.target.value }))} className="w-28 h-8 text-sm" autoFocus />
              <Input type="number" min={0} value={editForm.graceDays} onChange={(e) => setEditForm((p) => ({ ...p, graceDays: e.target.value }))} className="w-20 h-8 text-sm" placeholder="Grace days" />
              <Input type="number" step="0.01" value={editForm.capAmount} onChange={(e) => setEditForm((p) => ({ ...p, capAmount: e.target.value }))} className="w-24 h-8 text-sm" placeholder="Cap" />
              <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={editForm.isEnabled} onChange={(e) => setEditForm((p) => ({ ...p, isEnabled: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-brand-500" />
                Enabled
              </label>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(r.id)} disabled={update.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{r.scope === 'GLOBAL' ? 'Whole bill' : (feeHeads?.find((h) => h.id === r.feeHeadId)?.name ?? 'Fee head')}</Badge>
                <Badge variant="outline" className="text-xs">{r.type}</Badge>
                <span className="text-sm text-gray-800 dark:text-white">{r.value}{r.type === 'PERCENT' ? '%' : ' Rs.'}</span>
                {r.graceDays > 0 && <span className="text-xs text-gray-400">{r.graceDays}d grace</span>}
                {r.capAmount != null && <span className="text-xs text-gray-400">cap Rs. {r.capAmount}</span>}
                <StatusBadge status={r.isEnabled ? 'ACTIVE' : 'INACTIVE'} className={r.isEnabled ? '' : ''} />
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600"
                  onClick={() => { setEditId(r.id); setEditForm({ value: String(r.value), graceDays: String(r.graceDays), capAmount: r.capAmount != null ? String(r.capAmount) : '', isEnabled: r.isEnabled, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo ?? '' }); }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </ConfigSection>
  );
}
