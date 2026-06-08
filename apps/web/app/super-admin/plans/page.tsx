'use client';

import { useState } from 'react';
import { Check, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { usePlans, useCreatePlan, useUpdatePlan, useDeactivatePlan } from '@/lib/hooks/use-super-admin';
import type { SubscriptionPlan } from '@/types/api.types';

const FEATURE_KEYS: { key: string; label: string }[] = [
  { key: 'smsNotifications', label: 'SMS Notifications' },
  { key: 'eLearning', label: 'E-Learning' },
  { key: 'advancedReports', label: 'Advanced Reports' },
  { key: 'apiAccess', label: 'API Access' },
  { key: 'customBranding', label: 'Custom Branding' },
  { key: 'prioritySupport', label: 'Priority Support' },
];

const BLANK: {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  maxStudents: string;
  maxStaff: string;
  features: Record<string, boolean>;
} = {
  name: '',
  monthlyPrice: '',
  annualPrice: '',
  maxStudents: '',
  maxStaff: '',
  features: Object.fromEntries(FEATURE_KEYS.map(({ key }) => [key, false])),
};

function PlanFormDialog({
  open,
  onClose,
  initial,
  onSave,
  isLoading,
  title,
}: {
  open: boolean;
  onClose: () => void;
  initial: typeof BLANK;
  onSave: (values: typeof BLANK) => void;
  isLoading: boolean;
  title: string;
}) {
  const [form, setForm] = useState(initial);

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFeature(key: string) {
    setForm((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: !prev.features[key] },
    }));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-5">
          <div className="space-y-1.5">
            <Label>Plan Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Pro"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monthly Price (NPR) *</Label>
              <Input
                type="number"
                value={form.monthlyPrice}
                onChange={(e) => setField('monthlyPrice', e.target.value)}
                placeholder="2499"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Annual Price (NPR) *</Label>
              <Input
                type="number"
                value={form.annualPrice}
                onChange={(e) => setField('annualPrice', e.target.value)}
                placeholder="24990"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max Students *</Label>
              <Input
                type="number"
                value={form.maxStudents}
                onChange={(e) => setField('maxStudents', e.target.value)}
                placeholder="2000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max Staff *</Label>
              <Input
                type="number"
                value={form.maxStaff}
                onChange={(e) => setField('maxStaff', e.target.value)}
                placeholder="200"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Features</Label>
            <div className="space-y-2">
              {FEATURE_KEYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`feat-${key}`}
                    checked={form.features[key] ?? false}
                    onCheckedChange={() => toggleFeature(key)}
                  />
                  <label
                    htmlFor={`feat-${key}`}
                    className="text-theme-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={() => onSave(form)}
            disabled={isLoading}
          >
            {isLoading ? 'Saving…' : 'Save Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlansPage() {
  const { data: plans, isLoading } = usePlans();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deactivatePlan = useDeactivatePlan();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<SubscriptionPlan | null>(null);

  function formFromPlan(plan: SubscriptionPlan): typeof BLANK {
    return {
      name: plan.name,
      monthlyPrice: String(plan.monthlyPrice),
      annualPrice: String(plan.annualPrice),
      maxStudents: String(plan.maxStudents),
      maxStaff: String(plan.maxStaff),
      features: {
        ...Object.fromEntries(FEATURE_KEYS.map(({ key }) => [key, false])),
        ...plan.features,
      },
    };
  }

  async function handleCreate(form: typeof BLANK) {
    if (
      !form.name ||
      !form.monthlyPrice ||
      !form.annualPrice ||
      !form.maxStudents ||
      !form.maxStaff
    ) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await createPlan.mutateAsync({
        name: form.name,
        monthlyPrice: Number(form.monthlyPrice),
        annualPrice: Number(form.annualPrice),
        maxStudents: Number(form.maxStudents),
        maxStaff: Number(form.maxStaff),
        features: form.features,
      });
      toast.success('Plan created');
      setCreateOpen(false);
    } catch {
      toast.error('Failed to create plan');
    }
  }

  async function handleEdit(form: typeof BLANK) {
    if (!editPlan) return;
    try {
      await updatePlan.mutateAsync({
        id: editPlan.id,
        data: {
          name: form.name,
          monthlyPrice: Number(form.monthlyPrice),
          annualPrice: Number(form.annualPrice),
          maxStudents: Number(form.maxStudents),
          maxStaff: Number(form.maxStaff),
          features: form.features,
        },
      });
      toast.success('Plan updated');
      setEditPlan(null);
    } catch {
      toast.error('Failed to update plan');
    }
  }

  return (
    <div>
      <PageHeader
        title="Subscription Plans"
        description="Manage what features each plan includes"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Plan
          </Button>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {plans?.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden transition-opacity ${plan.isActive ? '' : 'opacity-60'}`}
          >
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-white text-base">
                    {plan.name}
                  </h3>
                  <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Rs. {plan.monthlyPrice.toLocaleString()}/month &nbsp;|&nbsp; Rs.{' '}
                    {plan.annualPrice.toLocaleString()}/year
                  </p>
                </div>
                <StatusBadge status={plan.isActive ? 'ACTIVE' : 'INACTIVE'} />
              </div>
              <p className="text-theme-xs text-gray-400 dark:text-gray-500 mt-1.5">
                Up to {plan.maxStudents.toLocaleString()} students &nbsp;·&nbsp;{' '}
                {plan.maxStaff.toLocaleString()} staff
              </p>
            </div>

            <div className="p-5">
              <ul className="space-y-1.5 mb-5">
                {FEATURE_KEYS.map(({ key, label }) => {
                  const enabled = plan.features[key] ?? false;
                  return (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      {enabled ? (
                        <Check className="h-3.5 w-3.5 text-success-500 flex-shrink-0" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                      )}
                      <span
                        className={
                          enabled
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-400 dark:text-gray-500'
                        }
                      >
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setEditPlan(plan)}
                >
                  Edit
                </Button>
                {plan.isActive && (
                  <ConfirmDialog
                    title="Deactivate Plan"
                    description="Schools on this plan will not be affected, but no new schools can subscribe to it."
                    confirmLabel="Deactivate"
                    variant="destructive"
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-error-600 border-error-200 hover:bg-error-50 dark:border-error-800 dark:hover:bg-error-500/10"
                      >
                        Deactivate
                      </Button>
                    }
                    onConfirm={async () => {
                      await deactivatePlan.mutateAsync(plan.id);
                      toast.success('Plan deactivated');
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <PlanFormDialog
        key="create"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initial={BLANK}
        onSave={handleCreate}
        isLoading={createPlan.isPending}
        title="Create Plan"
      />

      {editPlan && (
        <PlanFormDialog
          key={editPlan.id}
          open
          onClose={() => setEditPlan(null)}
          initial={formFromPlan(editPlan)}
          onSave={handleEdit}
          isLoading={updatePlan.isPending}
          title={`Edit — ${editPlan.name}`}
        />
      )}
    </div>
  );
}
