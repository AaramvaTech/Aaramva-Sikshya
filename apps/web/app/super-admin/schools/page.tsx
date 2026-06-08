'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  useTenants,
  usePlans,
  useOnboardTenant,
  useSuspendTenant,
  useActivateTenant,
  useImpersonate,
} from '@/lib/hooks/use-super-admin';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import type { TenantSummary } from '@/types/api.types';

const suggestSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

const BLANK_FORM = {
  schoolName: '',
  slug: '',
  planId: '',
  adminEmail: '',
  adminFirstName: '',
  adminLastName: '',
  adminPassword: '',
  phone: '',
  address: '',
  panNumber: '',
  trialDays: '30',
};

export default function SchoolsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: plans } = usePlans();
  const { data: tenantsData, isLoading } = useTenants({
    page,
    limit: 20,
    search: search || undefined,
    status: (statusFilter as 'active' | 'suspended') || undefined,
    planId: planFilter || undefined,
  });
  const onboardTenant = useOnboardTenant();
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const impersonate = useImpersonate();
  const { setAuth } = useAuthStore();
  const { setTenant } = useTenantStore();

  const tenants = tenantsData?.data ?? [];
  const meta = tenantsData?.meta;

  function handleSearchChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  }

  function setField(key: string, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'schoolName' && !slugManuallyEdited) {
        next.slug = suggestSlug(value);
      }
      return next;
    });
  }

  async function handleOnboard() {
    if (
      !form.schoolName ||
      !form.slug ||
      !form.planId ||
      !form.adminEmail ||
      !form.adminFirstName ||
      !form.adminLastName ||
      !form.adminPassword
    ) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await onboardTenant.mutateAsync({
        schoolName: form.schoolName,
        slug: form.slug,
        planId: form.planId,
        adminEmail: form.adminEmail,
        adminFirstName: form.adminFirstName,
        adminLastName: form.adminLastName,
        adminPassword: form.adminPassword,
        phone: form.phone || undefined,
        address: form.address || undefined,
        panNumber: form.panNumber || undefined,
        trialDays: form.trialDays ? parseInt(form.trialDays) : undefined,
      });
      toast.success('School onboarded successfully');
      setAddOpen(false);
      setForm(BLANK_FORM);
      setSlugManuallyEdited(false);
    } catch {
      toast.error('Failed to onboard school');
    }
  }

  async function handleImpersonate(tenant: TenantSummary) {
    try {
      const { data } = await impersonate.mutateAsync(tenant.id);
      const token = data.data;
      setAuth(token.accessToken, {
        id: '',
        email: '',
        role: 'SCHOOL_OWNER',
        tenantId: null,
        tenantSlug: token.tenantSlug,
      });
      setTenant({ slug: token.tenantSlug, name: token.schoolName });
      toast.warning('Impersonation active — all actions are audited', {
        duration: 6000,
      });
      window.open(`/?tenant=${token.tenantSlug}`, '_blank');
    } catch {
      toast.error('Impersonation failed');
    }
  }

  const columns: ColumnDef<TenantSummary>[] = [
    {
      id: 'name',
      header: 'School',
      cell: ({ row }) => (
        <Link
          href={`/super-admin/schools/${row.original.id}`}
          className="font-medium text-gray-800 dark:text-white hover:text-brand-500 dark:hover:text-brand-400 hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'slug',
      header: 'Slug',
      cell: ({ getValue }) => (
        <span className="font-mono text-theme-xs text-gray-500 dark:text-gray-400">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'planName',
      header: 'Plan',
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge status={row.original.isActive ? 'ACTIVE' : 'SUSPENDED'} />
      ),
    },
    {
      accessorKey: 'studentCount',
      header: 'Students',
      cell: ({ getValue }) => (
        <span className="text-gray-600 dark:text-gray-300">{getValue<number>()}</span>
      ),
    },
    {
      accessorKey: 'staffCount',
      header: 'Staff',
      cell: ({ getValue }) => (
        <span className="text-gray-600 dark:text-gray-300">{getValue<number>()}</span>
      ),
    },
    {
      id: 'joined',
      header: 'Joined',
      cell: ({ row }) => (
        <span className="text-theme-xs text-gray-500 dark:text-gray-400">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex items-center gap-1">
            <Link href={`/super-admin/schools/${t.id}`}>
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
                View
              </Button>
            </Link>
            {t.isActive ? (
              <ConfirmDialog
                title="Suspend School"
                description={`Suspend ${t.name}? They will lose access immediately.`}
                confirmLabel="Suspend"
                variant="destructive"
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 text-error-600 hover:text-error-700"
                  >
                    Suspend
                  </Button>
                }
                onConfirm={async () => {
                  await suspendTenant.mutateAsync(t.id);
                  toast.success('School suspended');
                }}
              />
            ) : (
              <ConfirmDialog
                title="Activate School"
                description={`Activate ${t.name}?`}
                confirmLabel="Activate"
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 text-success-700 hover:text-success-800"
                  >
                    Activate
                  </Button>
                }
                onConfirm={async () => {
                  await activateTenant.mutateAsync(t.id);
                  toast.success('School activated');
                }}
              />
            )}
            <ConfirmDialog
              title="Impersonate School Owner"
              description={`You are about to access ${t.name} as SCHOOL_OWNER. All actions will be audited. Continue?`}
              confirmLabel="Impersonate"
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 text-orange-600 hover:text-orange-700"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Impersonate
                </Button>
              }
              onConfirm={() => handleImpersonate(t)}
            />
          </div>
        );
      },
    },
  ];

  const selectedPlan = plans?.find((p) => p.id === form.planId);
  const isTrial = selectedPlan?.name?.toLowerCase() === 'trial';

  return (
    <div>
      <PageHeader
        title="Schools"
        description="Manage all schools on the platform"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Onboard School
          </Button>
        }
      />

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by name or slug..."
            className="pl-9 w-72"
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Select
          value={planFilter}
          onValueChange={(v) => {
            setPlanFilter(v ?? '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <span className="truncate">
              {plans?.find((p) => p.id === planFilter)?.name ?? 'All Plans'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Plans</SelectItem>
            {plans?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v ?? '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <span className="truncate">
              {statusFilter === 'active'
                ? 'Active'
                : statusFilter === 'suspended'
                  ? 'Suspended'
                  : 'All Status'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={tenants}
        isLoading={isLoading}
        pagination={
          meta ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage } : undefined
        }
      />

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false);
            setForm(BLANK_FORM);
            setSlugManuallyEdited(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Onboard New School</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="o-name">School Name *</Label>
              <Input
                id="o-name"
                value={form.schoolName}
                onChange={(e) => setField('schoolName', e.target.value)}
                placeholder="St. Xavier's School"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="o-slug">School Code / Slug *</Label>
              <Input
                id="o-slug"
                value={form.slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setField('slug', e.target.value);
                }}
                placeholder="sxs"
                className="font-mono"
              />
              <p className="text-theme-xs text-gray-400">Only lowercase letters, numbers, hyphens</p>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Plan *</Label>
              <Select
                value={form.planId || 'NONE'}
                onValueChange={(v) => setField('planId', (v ?? '') === 'NONE' ? '' : (v ?? ''))}
              >
                <SelectTrigger>
                  <span className="truncate">
                    {plans?.find((p) => p.id === form.planId)?.name ?? 'Select a plan'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Select a plan</SelectItem>
                  {plans?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-first">Admin First Name *</Label>
              <Input
                id="o-first"
                value={form.adminFirstName}
                onChange={(e) => setField('adminFirstName', e.target.value)}
                placeholder="Ramesh"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-last">Admin Last Name *</Label>
              <Input
                id="o-last"
                value={form.adminLastName}
                onChange={(e) => setField('adminLastName', e.target.value)}
                placeholder="Sharma"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-email">Admin Email *</Label>
              <Input
                id="o-email"
                type="email"
                value={form.adminEmail}
                onChange={(e) => setField('adminEmail', e.target.value)}
                placeholder="admin@school.edu.np"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-pass">Admin Password *</Label>
              <Input
                id="o-pass"
                type="password"
                value={form.adminPassword}
                onChange={(e) => setField('adminPassword', e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-phone">Phone</Label>
              <Input
                id="o-phone"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="01-XXXXXXX"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-pan">PAN Number</Label>
              <Input
                id="o-pan"
                value={form.panNumber}
                onChange={(e) => setField('panNumber', e.target.value)}
                placeholder="XXXXXXXXX"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="o-address">Address</Label>
              <Input
                id="o-address"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                placeholder="Kathmandu, Nepal"
              />
            </div>
            {isTrial && (
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="o-trial">Trial Days</Label>
                <Input
                  id="o-trial"
                  type="number"
                  value={form.trialDays}
                  onChange={(e) => setField('trialDays', e.target.value)}
                  placeholder="30"
                  min={1}
                  max={90}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setForm(BLANK_FORM);
                setSlugManuallyEdited(false);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleOnboard}
              disabled={onboardTenant.isPending}
            >
              {onboardTenant.isPending ? 'Onboarding…' : 'Onboard School'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
