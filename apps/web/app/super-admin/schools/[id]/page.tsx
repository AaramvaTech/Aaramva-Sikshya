'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ExternalLink, ArrowLeft, KeyRound, Pencil, Upload } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { uploadFile } from '@/lib/upload';
import { extractApiErrors } from '@/lib/api-errors';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useTenant,
  usePlans,
  useSuspendTenant,
  useActivateTenant,
  useImpersonate,
  useResendOwnerCredentials,
  useUpdateSubscription,
  useUpdateTenant,
} from '@/lib/hooks/use-super-admin';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: school, isLoading } = useTenant(id);
  const { data: plans } = usePlans();
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const impersonate = useImpersonate();
  const resendOwnerCreds = useResendOwnerCredentials();
  const updateSubscription = useUpdateSubscription();
  const updateTenant = useUpdateTenant();
  const { setAuth } = useAuthStore();
  const { setTenant } = useTenantStore();
  const [changingPlan, setChangingPlan] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState({
    schoolName: '',
    email: '',
    phone: '',
    address: '',
    panNumber: '',
    description: '',
    establishedYear: '',
    website: '',
    logoUrl: '',
  });

  function openEditDialog() {
    if (!school) return;
    setEditForm({
      schoolName: school.name,
      email: school.email ?? '',
      phone: school.phone ?? '',
      address: school.address ?? '',
      panNumber: school.panNumber ?? '',
      description: school.description ?? '',
      establishedYear: school.establishedYear ? String(school.establishedYear) : '',
      website: school.website ?? '',
      logoUrl: school.logoUrl ?? '',
    });
    setEditOpen(true);
  }

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2 MB');
      return;
    }
    setPendingLogoFile(file);
    // Preview stays a local data-URI; the actual upload happens on Save.
    const reader = new FileReader();
    reader.onloadend = () => setEditForm((f) => ({ ...f, logoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  }

  async function handleSaveEdit() {
    if (!school) return;
    const year = editForm.establishedYear ? Number(editForm.establishedYear) : undefined;
    if (year !== undefined && (Number.isNaN(year) || year < 1800 || year > 2100)) {
      toast.error('Established year must be between 1800 and 2100');
      return;
    }
    try {
      // FILE-1: presign→PUT→logoFileKey. The /files presign route is
      // tenant-scoped, so the platform admin names the target school's slug.
      let logoFields: { logoFileKey?: string; logoUrl?: string } = {
        logoUrl: editForm.logoUrl || undefined,
      };
      if (pendingLogoFile) {
        const uploaded = await uploadFile(pendingLogoFile, 'school-logo', { tenantSlug: school.slug });
        logoFields =
          uploaded.mode === 'key'
            ? { logoFileKey: uploaded.key }
            : { logoUrl: uploaded.dataUrl };
      }
      await updateTenant.mutateAsync({
        id: school.id,
        data: {
          schoolName: editForm.schoolName,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          address: editForm.address || undefined,
          panNumber: editForm.panNumber || undefined,
          description: editForm.description || undefined,
          establishedYear: year,
          website: editForm.website || undefined,
          ...logoFields,
        },
      });
      toast.success('School updated');
      setEditOpen(false);
      setPendingLogoFile(null);
      router.refresh();
    } catch {
      toast.error('Failed to update school');
    }
  }

  async function handleResendOwnerCredentials() {
    if (!school) return;
    try {
      const res = await resendOwnerCreds.mutateAsync(school.id);
      toast.success(`New credentials emailed to ${res.email}`);
    } catch (err) {
      toast.error(extractApiErrors(err, 'Failed to resend owner credentials').join(' • '));
    }
  }

  async function handleImpersonate() {
    if (!school) return;
    try {
      const res = await impersonate.mutateAsync(school.id);
      const token = res.data.data;
      setAuth(token.accessToken, {
        id: '',
        email: '',
        role: 'SCHOOL_OWNER',
        tenantId: null,
        tenantSlug: token.tenantSlug,
      });
      setTenant({ slug: token.tenantSlug, name: token.schoolName });
      toast.warning('Impersonation active — all actions are audited', { duration: 6000 });
      window.open(`/?tenant=${token.tenantSlug}`, '_blank');
    } catch {
      toast.error('Impersonation failed');
    }
  }

  async function handleChangePlan(planId: string | null) {
    if (!planId) return;
    if (!school) return;
    setChangingPlan(true);
    try {
      await updateSubscription.mutateAsync({ tenantId: school.id, data: { planId } });
      toast.success('Plan updated');
    } catch {
      toast.error('Failed to update plan');
    } finally {
      setChangingPlan(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="text-center py-20 text-gray-400 dark:text-gray-500">School not found</div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/super-admin/schools"
          className="inline-flex items-center gap-1.5 text-theme-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Schools
        </Link>
      </div>

      <PageHeader
        title={school.name}
        description={`${school.slug}.aaramvashikshya.com`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openEditDialog}>
              <Pencil className="h-4 w-4 mr-1.5" />
              Edit
            </Button>
            <ConfirmDialog
              title="Resend Owner Credentials"
              description={`Reset the ${school.name} owner's password and email them new login credentials? Their current password will stop working and they will be signed out everywhere.`}
              confirmLabel="Reset & Email"
              trigger={
                <Button variant="outline" size="sm" disabled={resendOwnerCreds.isPending}>
                  <KeyRound className="h-4 w-4 mr-1.5" />
                  Resend Credentials
                </Button>
              }
              onConfirm={handleResendOwnerCredentials}
            />
            <ConfirmDialog
              title="Impersonate School Owner"
              description={`You are about to access ${school.name} as SCHOOL_OWNER. All actions will be audited. Continue?`}
              confirmLabel="Impersonate"
              trigger={
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Impersonate
                </Button>
              }
              onConfirm={handleImpersonate}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <InfoCard title="School Information">
          {school.logoUrl && (
            <div className="mb-4 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={school.logoUrl}
                alt={`${school.name} logo`}
                className="h-14 w-14 rounded-lg border border-gray-200 object-contain dark:border-gray-700"
              />
            </div>
          )}
          <dl className="space-y-3 text-sm">
            {[
              { label: 'Name', value: school.name },
              { label: 'School Code', value: school.slug, mono: true },
              { label: 'Email', value: school.email ?? '—' },
              { label: 'Phone', value: school.phone ?? '—' },
              { label: 'Address', value: school.address ?? '—' },
              { label: 'PAN', value: school.panNumber ?? '—' },
              { label: 'Established', value: school.establishedYear ? String(school.establishedYear) : '—' },
              {
                label: 'Website',
                value: school.website ?? '—',
                render: school.website ? (
                  <a
                    href={school.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-500 hover:underline"
                  >
                    {school.website}
                  </a>
                ) : undefined,
              },
              { label: 'Description', value: school.description ?? '—' },
              {
                label: 'Primary Color',
                value: school.primaryColor,
                render: (
                  <span className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full border border-gray-200 dark:border-gray-700"
                      style={{ background: school.primaryColor }}
                    />
                    {school.primaryColor}
                  </span>
                ),
              },
            ].map(({ label, value, mono, render }) => (
              <div key={label} className="flex">
                <dt className="w-32 text-gray-400 dark:text-gray-500 flex-shrink-0">{label}</dt>
                <dd
                  className={`text-gray-800 dark:text-white ${mono ? 'font-mono text-theme-xs' : ''}`}
                >
                  {render ?? value}
                </dd>
              </div>
            ))}
          </dl>
        </InfoCard>

        <InfoCard title="Subscription">
          <div className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div className="flex">
                <dt className="w-32 text-gray-400 dark:text-gray-500">Plan</dt>
                <dd className="font-medium text-gray-800 dark:text-white">{school.planName}</dd>
              </div>
              <div className="flex">
                <dt className="w-32 text-gray-400 dark:text-gray-500">Status</dt>
                <dd>
                  <StatusBadge status={school.subscriptionStatus} />
                </dd>
              </div>
              <div className="flex">
                <dt className="w-32 text-gray-400 dark:text-gray-500">Account</dt>
                <dd>
                  <StatusBadge status={school.isActive ? 'ACTIVE' : 'SUSPENDED'} />
                </dd>
              </div>
              {school.trialEndsAt && (
                <div className="flex">
                  <dt className="w-32 text-gray-400 dark:text-gray-500">Trial Ends</dt>
                  <dd className="text-gray-800 dark:text-white">
                    {new Date(school.trialEndsAt).toLocaleDateString()}
                  </dd>
                </div>
              )}
              {school.subscriptionEndsAt && (
                <div className="flex">
                  <dt className="w-32 text-gray-400 dark:text-gray-500">Expires</dt>
                  <dd className="text-gray-800 dark:text-white">
                    {new Date(school.subscriptionEndsAt).toLocaleDateString()}
                  </dd>
                </div>
              )}
            </dl>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
              <p className="text-theme-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">
                Change Plan
              </p>
              <Select
                value={school.planId}
                onValueChange={handleChangePlan}
                disabled={changingPlan}
              >
                <SelectTrigger className="w-full">
                  <span>{plans?.find((p) => p.id === school.planId)?.name ?? 'Select plan'}</span>
                </SelectTrigger>
                <SelectContent>
                  {plans?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
              {school.isActive ? (
                <ConfirmDialog
                  title="Suspend School"
                  description={`Suspend ${school.name}? They will lose access immediately.`}
                  confirmLabel="Suspend"
                  variant="destructive"
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-error-600 border-error-200 hover:bg-error-50 w-full dark:border-error-800 dark:hover:bg-error-500/10"
                    >
                      Suspend School
                    </Button>
                  }
                  onConfirm={async () => {
                    await suspendTenant.mutateAsync(school.id);
                    toast.success('School suspended');
                    router.refresh();
                  }}
                />
              ) : (
                <ConfirmDialog
                  title="Activate School"
                  description={`Activate ${school.name}?`}
                  confirmLabel="Activate"
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-success-700 border-success-200 hover:bg-success-50 w-full dark:border-success-800 dark:hover:bg-success-500/10"
                    >
                      Activate School
                    </Button>
                  }
                  onConfirm={async () => {
                    await activateTenant.mutateAsync(school.id);
                    toast.success('School activated');
                    router.refresh();
                  }}
                />
              )}
            </div>
          </div>
        </InfoCard>
      </div>

      <InfoCard title="Usage">
        <div className="flex gap-8">
          <div>
            <p className="text-theme-xs text-gray-400 dark:text-gray-500 mb-0.5">Students</p>
            <p className="text-3xl font-bold text-gray-800 dark:text-white">{school.studentCount}</p>
          </div>
          <div className="border-l border-gray-200 dark:border-gray-800 pl-8">
            <p className="text-theme-xs text-gray-400 dark:text-gray-500 mb-0.5">Staff</p>
            <p className="text-3xl font-bold text-gray-800 dark:text-white">{school.staffCount}</p>
          </div>
        </div>
      </InfoCard>

      <div className="mt-6">
        <InfoCard title="Subscription History">
          <p className="text-theme-sm text-gray-400 dark:text-gray-500">
            Subscription management coming soon
          </p>
        </InfoCard>
      </div>

      {/* Edit School Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit School</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Read-only School Code — permanent subdomain + data key */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-code">School Code</Label>
              <Input
                id="edit-code"
                value={school.slug}
                readOnly
                disabled
                className="font-mono bg-gray-50 dark:bg-gray-800/50 cursor-not-allowed"
              />
              <p className="text-theme-xs text-gray-400">
                The school code is permanent — it identifies the subdomain and data and cannot be changed.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {editForm.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={editForm.logoUrl}
                    alt="Logo preview"
                    className="h-14 w-14 rounded-lg border border-gray-200 object-contain dark:border-gray-700"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-300">
                    <Upload className="h-5 w-5" />
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoFileChange}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Upload
                  </Button>
                  {editForm.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-error-600"
                      onClick={() => setEditForm((f) => ({ ...f, logoUrl: '' }))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">School Name</Label>
              <Input
                id="edit-name"
                value={editForm.schoolName}
                onChange={(e) => setEditForm((f) => ({ ...f, schoolName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-pan">PAN Number</Label>
                <Input
                  id="edit-pan"
                  value={editForm.panNumber}
                  onChange={(e) => setEditForm((f) => ({ ...f, panNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-year">Established Year</Label>
                <Input
                  id="edit-year"
                  type="number"
                  min={1800}
                  max={2100}
                  placeholder="e.g. 1995"
                  value={editForm.establishedYear}
                  onChange={(e) => setEditForm((f) => ({ ...f, establishedYear: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-website">Website</Label>
              <Input
                id="edit-website"
                placeholder="https://school.edu.np"
                value={editForm.website}
                onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <textarea
                id="edit-description"
                rows={3}
                placeholder="Short description about the school"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateTenant.isPending}>
              {updateTenant.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
