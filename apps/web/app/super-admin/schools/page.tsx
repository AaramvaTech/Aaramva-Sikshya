'use client';

import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { extractApiErrors } from '@/lib/api-errors';
import { onboardTenantSchema, type OnboardTenantValues } from '@/lib/schemas/super-admin.schema';
import type { TenantSummary } from '@/types/api.types';

const suggestSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

export default function SchoolsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<OnboardTenantValues>({
    resolver: zodResolver(onboardTenantSchema),
    defaultValues: {
      schoolName: '',
      slug: '',
      planId: '',
      adminEmail: '',
      adminFirstName: '',
      adminLastName: '',
      phone: '',
      address: '',
      panNumber: '',
      trialDays: 30,
    },
  });

  const watchedPlanId = watch('planId');
  const watchedSchoolName = watch('schoolName');
  const watchedSlug = watch('slug');

  function handleSearchChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  }

  function handleSchoolNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    setValue('schoolName', name);
    // Auto-suggest slug only if user hasn't manually edited it
    if (!watchedSlug || watchedSlug === suggestSlug(watchedSchoolName)) {
      setValue('slug', suggestSlug(name));
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue('slug', e.target.value);
  }

  async function handleOnboard(data: OnboardTenantValues) {
    try {
      await onboardTenant.mutateAsync(data);
      toast.success('School onboarded successfully');
      setAddOpen(false);
      reset();
    } catch (err) {
      toast.error(extractApiErrors(err, 'Failed to onboard school').join(' • '));
    }
  }

  async function handleImpersonate(tenant: TenantSummary) {
    try {
      const res = await impersonate.mutateAsync(tenant.id);
      const token = res.data.data;
      // Pass token to the new tab via localStorage (30s TTL)
      localStorage.setItem(
        'impersonation_handoff',
        JSON.stringify({
          accessToken: token.accessToken,
          tenantSlug: token.tenantSlug,
          schoolName: token.schoolName,
          expires: Date.now() + 30_000,
        }),
      );
      toast.warning('Impersonation active — all actions are audited', { duration: 6000 });
      window.open(`/?tenant=${token.tenantSlug}`, '_blank');
    } catch {
      toast.error('Impersonation failed');
    }
  }

  const columns: ColumnDef<TenantSummary>[] = [
    {
      id: 'name',
      header: 'School',
      cell: ({ row }) => {
        const t = row.original;
        const initials = t.name
          .split(' ')
          .map((w) => w[0])
          .filter(Boolean)
          .slice(0, 2)
          .join('')
          .toUpperCase();
        return (
          <div className="flex items-center gap-3">
            {t.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.logoUrl}
                alt={`${t.name} logo`}
                className="h-9 w-9 flex-shrink-0 rounded-lg border border-gray-200 object-contain dark:border-gray-700"
              />
            ) : (
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-theme-xs font-semibold text-brand-500 dark:bg-brand-500/10">
                {initials || '?'}
              </span>
            )}
            <Link
              href={`/super-admin/schools/${t.id}`}
              className="font-medium text-gray-800 dark:text-white hover:text-brand-500 dark:hover:text-brand-400 hover:underline"
            >
              {t.name}
            </Link>
          </div>
        );
      },
    },
    {
      accessorKey: 'slug',
      header: 'School Code',
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
          {row.original.createdAt ? new Date(row.original.createdAt).toLocaleDateString() : '—'}
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

  const selectedPlan = plans?.find((p) => p.id === watchedPlanId);
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

      <DataTable
        columns={columns}
        data={tenants}
        isLoading={isLoading}
        filterBar={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Search by name or code..."
                className="h-9 w-64 pl-9 text-sm"
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v ?? ''); setPage(1); }}>
              <SelectTrigger className="h-9 w-32 text-sm">
                <span className="truncate">
                  {plans?.find((p) => p.id === planFilter)?.name ?? 'All Plans'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Plans</SelectItem>
                {plans?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ''); setPage(1); }}>
              <SelectTrigger className="h-9 w-32 text-sm">
                <span className="truncate">
                  {statusFilter === 'active' ? 'Active' : statusFilter === 'suspended' ? 'Suspended' : 'All Status'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        activeFilterCount={[search, planFilter, statusFilter].filter(Boolean).length}
        onClearFilters={() => { setSearch(''); setPlanFilter(''); setStatusFilter(''); setPage(1); }}
        exportConfig={{
          filename: 'schools',
          getData: () =>
            tenants.map((t) => ({
              Name: t.name,
              'School Code': t.slug,
              Plan: t.planName ?? '',
              Status: t.isActive ? 'Active' : 'Suspended',
              Students: t.studentCount,
              Staff: t.staffCount,
              Joined: t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '',
            })),
        }}
        pagination={
          meta ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage } : undefined
        }
      />

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false);
            reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Onboard New School</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(handleOnboard)}>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="o-name">School Name *</Label>
                <Input
                  id="o-name"
                  placeholder="St. Xavier's School"
                  {...register('schoolName')}
                  onChange={(e) => {
                    register('schoolName').onChange(e);
                    handleSchoolNameChange(e);
                  }}
                />
                {errors.schoolName && (
                  <p className="text-theme-xs text-error-600">{errors.schoolName.message}</p>
                )}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="o-slug">School Code *</Label>
                <Input
                  id="o-slug"
                  placeholder="sxs"
                  className="font-mono"
                  {...register('slug')}
                  onChange={(e) => {
                    register('slug').onChange(e);
                    handleSlugChange(e);
                  }}
                />
                <p className="text-theme-xs text-gray-400">Only lowercase letters, numbers, hyphens</p>
                {errors.slug && (
                  <p className="text-theme-xs text-error-600">{errors.slug.message}</p>
                )}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Plan *</Label>
                <Select
                  value={watchedPlanId || 'NONE'}
                  onValueChange={(v) =>
                    setValue('planId', (v ?? '') === 'NONE' ? '' : (v ?? ''), {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <span className="truncate">
                      {plans?.find((p) => p.id === watchedPlanId)?.name ?? 'Select a plan'}
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
                {errors.planId && (
                  <p className="text-theme-xs text-error-600">{errors.planId.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-first">Admin First Name *</Label>
                <Input
                  id="o-first"
                  placeholder="Ramesh"
                  {...register('adminFirstName')}
                />
                {errors.adminFirstName && (
                  <p className="text-theme-xs text-error-600">{errors.adminFirstName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-last">Admin Last Name *</Label>
                <Input
                  id="o-last"
                  placeholder="Sharma"
                  {...register('adminLastName')}
                />
                {errors.adminLastName && (
                  <p className="text-theme-xs text-error-600">{errors.adminLastName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-email">Admin Email *</Label>
                <Input
                  id="o-email"
                  type="email"
                  placeholder="admin@school.edu.np"
                  {...register('adminEmail')}
                />
                {errors.adminEmail && (
                  <p className="text-theme-xs text-error-600">{errors.adminEmail.message}</p>
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <p className="rounded-md bg-muted/50 px-3 py-2 text-theme-xs text-muted-foreground">
                  A temporary password is generated automatically and delivered to the
                  school owner — they set their own on first login.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-phone">Phone</Label>
                <Input
                  id="o-phone"
                  placeholder="01-XXXXXXX"
                  {...register('phone')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-pan">PAN Number</Label>
                <Input
                  id="o-pan"
                  placeholder="XXXXXXXXX"
                  {...register('panNumber')}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="o-address">Address</Label>
                <Input
                  id="o-address"
                  placeholder="Kathmandu, Nepal"
                  {...register('address')}
                />
              </div>
              {isTrial && (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="o-trial">Trial Days</Label>
                  <Input
                    id="o-trial"
                    type="number"
                    placeholder="30"
                    min={1}
                    max={90}
                    {...register('trialDays', { valueAsNumber: true })}
                  />
                  {errors.trialDays && (
                    <p className="text-theme-xs text-error-600">{errors.trialDays.message}</p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAddOpen(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-brand-500 hover:bg-brand-600 text-white"
                disabled={onboardTenant.isPending}
              >
                {onboardTenant.isPending ? 'Onboarding…' : 'Onboard School'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
