'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Edit2, Plus, Trash2, Check, X, Users, Settings, Briefcase, Calendar, Tag, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ConfigSection, ConfigRow } from '@/components/shared/config-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  useDesignations,
  useCreateDesignation,
  useUpdateDesignation,
  useDeleteDesignation,
  useEmploymentTypes,
  useCreateEmploymentType,
  useUpdateEmploymentType,
  useDeleteEmploymentType,
  useRoleLabels,
  useUpdateRoleLabel,
  useResetRoleLabel,
  useLeaveTypes,
  useCreateLeaveType,
  useUpdateLeaveType,
  useDeleteLeaveType,
} from '@/lib/hooks/use-hr';
import type { Department, Designation, EmploymentType, RoleLabel, LeaveType } from '@/types/api.types';
import { cn } from '@/lib/utils';

type Tab = 'departments' | 'designations' | 'employment-types' | 'role-labels' | 'leave-types';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'departments', label: 'Departments', icon: <Users className="h-4 w-4" /> },
  { key: 'designations', label: 'Designations', icon: <Settings className="h-4 w-4" /> },
  { key: 'employment-types', label: 'Employment Types', icon: <Briefcase className="h-4 w-4" /> },
  { key: 'role-labels', label: 'Role Labels', icon: <Tag className="h-4 w-4" /> },
  { key: 'leave-types', label: 'Leave Types', icon: <Calendar className="h-4 w-4" /> },
];

export default function HrSetupPage() {
  const [activeTab, setActiveTab] = useState<Tab>('departments');

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Setup"
        description="Manage departments, designations, and leave types"
      />

      {/* Tab bar */}
      <div className="flex border-b border-stroke dark:border-strokedark">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'departments' && <DepartmentsTab />}
      {activeTab === 'designations' && <DesignationsTab />}
      {activeTab === 'employment-types' && <EmploymentTypesTab />}
      {activeTab === 'role-labels' && <RoleLabelsTab />}
      {activeTab === 'leave-types' && <LeaveTypesTab />}
    </div>
  );
}

// ── Departments Tab ───────────────────────────────────────────────────────────

function DepartmentsTab() {
  const { data: departments, isLoading } = useDepartments();
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const remove = useDeleteDepartment();

  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await create.mutateAsync({ name });
      setNewName('');
      toast.success('Department created');
    } catch {
      toast.error('Failed to create department');
    }
  }

  async function handleUpdate(id: string) {
    const name = editName.trim();
    if (!name) return;
    try {
      await update.mutateAsync({ id, data: { name } });
      setEditId(null);
      toast.success('Department updated');
    } catch {
      toast.error('Failed to update department');
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Department deleted');
    } catch {
      toast.error('Failed to delete department');
    }
  }

  return (
    <ConfigSection
      title="Departments"
      description="Organise your staff into departments (e.g. Science, Administration)"
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2">
          <Input
            placeholder="Department name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            className="max-w-xs"
          />
          <Button
            size="sm"
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={handleCreate}
            disabled={!newName.trim() || create.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      }
    >
      {departments && departments.length === 0 && (
        <EmptyState message="No departments yet. Add one above." />
      )}
      {departments?.map((dept: Department) => (
        <ConfigRow
          key={dept.id}
          isEditing={editId === dept.id}
          editValue={editName}
          onEditChange={setEditName}
          onStartEdit={() => { setEditId(dept.id); setEditName(dept.name); }}
          onSave={() => handleUpdate(dept.id)}
          onCancel={() => setEditId(null)}
          onDelete={() => handleDelete(dept.id)}
          isSaving={update.isPending}
        >
          <span className="font-medium text-sm text-gray-800 dark:text-white">{dept.name}</span>
        </ConfigRow>
      ))}
    </ConfigSection>
  );
}

// ── Designations Tab ──────────────────────────────────────────────────────────

function DesignationsTab() {
  const { data: designations, isLoading } = useDesignations();
  const { data: departments } = useDepartments();
  const create = useCreateDesignation();
  const update = useUpdateDesignation();
  const remove = useDeleteDesignation();

  const [newTitle, setNewTitle] = useState('');
  const [newDeptId, setNewDeptId] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await create.mutateAsync({ title, departmentId: newDeptId || undefined });
      setNewTitle('');
      setNewDeptId('');
      toast.success('Designation created');
    } catch {
      toast.error('Failed to create designation');
    }
  }

  async function handleUpdate(id: string, departmentId?: string | null) {
    const title = editTitle.trim();
    if (!title) return;
    try {
      await update.mutateAsync({ id, data: { title, departmentId: departmentId ?? undefined } });
      setEditId(null);
      toast.success('Designation updated');
    } catch {
      toast.error('Failed to update designation');
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Designation deleted');
    } catch {
      toast.error('Failed to delete designation');
    }
  }

  return (
    <ConfigSection
      title="Designations"
      description="Job titles within your school (e.g. Head Teacher, Senior Accountant)"
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Designation title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            className="max-w-xs"
          />
          <select
            value={newDeptId}
            onChange={(e) => setNewDeptId(e.target.value)}
            className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            <option value="">No department</option>
            {departments?.map((d: Department) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <Button
            size="sm"
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={handleCreate}
            disabled={!newTitle.trim() || create.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      }
    >
      {designations && designations.length === 0 && (
        <EmptyState message="No designations yet. Add one above." />
      )}
      {designations?.map((d: Designation) => (
        <ConfigRow
          key={d.id}
          isEditing={editId === d.id}
          editValue={editTitle}
          onEditChange={setEditTitle}
          onStartEdit={() => { setEditId(d.id); setEditTitle(d.title); }}
          onSave={() => handleUpdate(d.id, d.departmentId)}
          onCancel={() => setEditId(null)}
          onDelete={() => handleDelete(d.id)}
          isSaving={update.isPending}
        >
          <div>
            <span className="font-medium text-sm text-gray-800 dark:text-white">{d.title}</span>
            {d.departmentName && (
              <Badge variant="outline" className="ml-2 text-xs">{d.departmentName}</Badge>
            )}
          </div>
        </ConfigRow>
      ))}
    </ConfigSection>
  );
}

// ── Employment Types Tab ──────────────────────────────────────────────────────

function EmploymentTypesTab() {
  const { data: employmentTypes, isLoading } = useEmploymentTypes();
  const create = useCreateEmploymentType();
  const update = useUpdateEmploymentType();
  const remove = useDeleteEmploymentType();

  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await create.mutateAsync({ name });
      setNewName('');
      toast.success('Employment type created');
    } catch {
      toast.error('Failed to create employment type');
    }
  }

  async function handleUpdate(id: string) {
    const name = editName.trim();
    if (!name) return;
    try {
      await update.mutateAsync({ id, data: { name } });
      setEditId(null);
      toast.success('Employment type updated');
    } catch {
      toast.error('Failed to update employment type');
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Employment type deleted');
    } catch {
      toast.error('Failed to delete employment type');
    }
  }

  return (
    <ConfigSection
      title="Employment Types"
      description="Categories of staff employment (e.g. Permanent, Part Time, Visiting Faculty)"
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2">
          <Input
            placeholder="Employment type name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            className="max-w-xs"
          />
          <Button
            size="sm"
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={handleCreate}
            disabled={!newName.trim() || create.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      }
    >
      {employmentTypes && employmentTypes.length === 0 && (
        <EmptyState message="No employment types yet. Add one above." />
      )}
      {employmentTypes?.map((et: EmploymentType) => (
        <ConfigRow
          key={et.id}
          isEditing={editId === et.id}
          editValue={editName}
          onEditChange={setEditName}
          onStartEdit={() => { setEditId(et.id); setEditName(et.name); }}
          onSave={() => handleUpdate(et.id)}
          onCancel={() => setEditId(null)}
          onDelete={() => handleDelete(et.id)}
          isSaving={update.isPending}
        >
          <span className="font-medium text-sm text-gray-800 dark:text-white">{et.name}</span>
        </ConfigRow>
      ))}
    </ConfigSection>
  );
}

// ── Role Labels Tab ───────────────────────────────────────────────────────────

function RoleLabelsTab() {
  const { data: roleLabels, isLoading } = useRoleLabels();
  const update = useUpdateRoleLabel();
  const reset = useResetRoleLabel();

  const [editRole, setEditRole] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  async function handleUpdate(role: string) {
    const label = editLabel.trim();
    if (!label) return;
    try {
      await update.mutateAsync({ role, label });
      setEditRole(null);
      toast.success('Role label updated');
    } catch {
      toast.error('Failed to update role label');
    }
  }

  async function handleReset(role: string) {
    try {
      await reset.mutateAsync(role);
      toast.success('Role label reset to default');
    } catch {
      toast.error('Failed to reset role label');
    }
  }

  return (
    <ConfigSection
      title="Role Labels"
      description="Rename how staff roles are displayed for your school (e.g. Academic Coordinator -> Vice Principal). The underlying permissions never change."
      isLoading={isLoading}
      addSlot={
        <p className="text-xs text-gray-500">
          Renaming a role only changes its display text — it does not add a new role or change what that role can access.
        </p>
      }
    >
      {roleLabels?.map((rl: RoleLabel) => (
        <div
          key={rl.role}
          className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
        >
          {editRole === rl.role ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(rl.role); if (e.key === 'Escape') setEditRole(null); }}
                className="max-w-xs h-8 text-sm"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(rl.role)} disabled={update.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditRole(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm text-gray-800 dark:text-white">{rl.label}</span>
                {rl.isOverridden && <Badge variant="outline" className="text-xs">Customized</Badge>}
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-gray-400 hover:text-gray-600"
                  onClick={() => { setEditRole(rl.role); setEditLabel(rl.label); }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                {rl.isOverridden && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-gray-400 hover:text-gray-600"
                    onClick={() => handleReset(rl.role)}
                    title="Reset to default"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </ConfigSection>
  );
}

// ── Leave Types Tab ───────────────────────────────────────────────────────────

function LeaveTypesTab() {
  const { data: leaveTypes, isLoading } = useLeaveTypes();
  const create = useCreateLeaveType();
  const update = useUpdateLeaveType();
  const remove = useDeleteLeaveType();

  const [form, setForm] = useState({ name: '', daysPerYear: '', isPaid: true });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', daysPerYear: '', isPaid: true });

  async function handleCreate() {
    const name = form.name.trim();
    const days = Number(form.daysPerYear);
    if (!name || !days) return;
    try {
      await create.mutateAsync({ name, daysPerYear: days, isPaid: form.isPaid });
      setForm({ name: '', daysPerYear: '', isPaid: true });
      toast.success('Leave type created');
    } catch {
      toast.error('Failed to create leave type');
    }
  }

  async function handleUpdate(id: string) {
    const name = editForm.name.trim();
    const days = Number(editForm.daysPerYear);
    if (!name || !days) return;
    try {
      await update.mutateAsync({ id, data: { name, daysPerYear: days, isPaid: editForm.isPaid } });
      setEditId(null);
      toast.success('Leave type updated');
    } catch {
      toast.error('Failed to update leave type');
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Leave type deleted');
    } catch {
      toast.error('Failed to delete leave type');
    }
  }

  return (
    <ConfigSection
      title="Leave Types"
      description="Types of leave available to staff (e.g. Annual, Sick, Maternity)"
      isLoading={isLoading}
      addSlot={
        <div className="flex gap-2 flex-wrap items-center">
          <Input
            placeholder="Leave type name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="max-w-48"
          />
          <Input
            type="number"
            placeholder="Days/year"
            min={1}
            value={form.daysPerYear}
            onChange={(e) => setForm((p) => ({ ...p, daysPerYear: e.target.value }))}
            className="w-28"
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isPaid}
              onChange={(e) => setForm((p) => ({ ...p, isPaid: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 accent-brand-500"
            />
            Paid
          </label>
          <Button
            size="sm"
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={handleCreate}
            disabled={!form.name.trim() || !form.daysPerYear || create.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      }
    >
      {leaveTypes && leaveTypes.length === 0 && (
        <EmptyState message="No leave types yet. Add one above." />
      )}
      {leaveTypes?.map((lt: LeaveType) => (
        <div
          key={lt.id}
          className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
        >
          {editId === lt.id ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                className="max-w-48 h-8 text-sm"
                autoFocus
              />
              <Input
                type="number"
                min={1}
                value={editForm.daysPerYear}
                onChange={(e) => setEditForm((p) => ({ ...p, daysPerYear: e.target.value }))}
                className="w-24 h-8 text-sm"
              />
              <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editForm.isPaid}
                  onChange={(e) => setEditForm((p) => ({ ...p, isPaid: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 accent-brand-500"
                />
                Paid
              </label>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(lt.id)} disabled={update.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm text-gray-800 dark:text-white">{lt.name}</span>
                <span className="text-xs text-gray-500">{lt.daysPerYear} days/year</span>
                <Badge variant="outline" className={cn('text-xs', lt.isPaid ? 'text-green-600 border-green-200' : 'text-gray-500')}>
                  {lt.isPaid ? 'Paid' : 'Unpaid'}
                </Badge>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-gray-400 hover:text-gray-600"
                  onClick={() => {
                    setEditId(lt.id);
                    setEditForm({ name: lt.name, daysPerYear: String(lt.daysPerYear), isPaid: lt.isPaid });
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => handleDelete(lt.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
    </ConfigSection>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────
// ConfigSection/ConfigRow moved to components/shared/config-section.tsx (UI-1) —
// promoted so the fee-catalog page (a second consumer) doesn't re-implement them.

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-gray-400 text-center py-6">{message}</p>
  );
}
