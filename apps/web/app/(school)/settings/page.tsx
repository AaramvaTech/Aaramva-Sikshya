'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  Edit2,
  Landmark,
  Loader2,
  MapPin,
  Palette,
  PenLine,
  QrCode,
  ScrollText,
  Stamp,
  Upload,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ChangePasswordCard } from '@/components/shared/change-password-card';
import { authApi } from '@/lib/api/auth.api';
import { extractApiErrors } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useSchoolProfile, useUpdateSchoolProfile } from '@/lib/hooks/use-settings';
import { useFinanceSettings, useUpdateFinanceSettings } from '@/lib/hooks/use-bill-correction';
import { uploadFile } from '@/lib/upload';
import { useFileUrl } from '@/lib/hooks/use-file-url';
import { useTenantStore } from '@/store/tenant.store';
import { useAuthStore } from '@/store/auth.store';
import type { SchoolProfile, UpdateProfileData } from '@/types/api.types';
import { cn } from '@/lib/utils';

// UI-7 — the curated bill/receipt print-accent set (common/tenant-brand-color.ts
// on the backend). Deliberately not the free-hex primaryColor above — print
// media has no runtime contrast enforcement, so the choices are pre-vetted.
const BILL_BRAND_COLORS: { value: string; name: string }[] = [
  { value: '#475569', name: 'Slate' },
  { value: '#0f6e56', name: 'Green' },
  { value: '#1e5aa8', name: 'Blue' },
  { value: '#9a2c2c', name: 'Maroon' },
  { value: '#6b3fa0', name: 'Purple' },
  { value: '#b45309', name: 'Amber' },
  { value: '#0e7490', name: 'Teal' },
  { value: '#a1306e', name: 'Rose' },
];

const PRINT_LANGUAGES = [
  { value: 'EN', label: 'English' },
  { value: 'NE', label: 'Nepali' },
  { value: 'BOTH', label: 'Both (bilingual)' },
] as const;

const OWNER_ROLES = ['SCHOOL_OWNER', 'PLATFORM_ADMIN'];

type FormState = Record<string, string>;

const EMPTY: FormState = {
  name: '', motto: '', establishedYear: '', website: '', description: '',
  address: '', province: '', district: '', phone: '', alternatePhone: '', email: '',
  panNumber: '', registrationNumber: '', affiliationBoard: '', affiliationNumber: '',
  principalName: '', logoUrl: '', primaryColor: '#2563EB',
  principalSignatureUrl: '', schoolStampUrl: '',
  brandColor: '#475569', printLanguage: 'EN', paymentInstructions: '', qrImageUrl: '',
};

function fromProfile(p: SchoolProfile): FormState {
  return {
    name: p.name ?? '', motto: p.motto ?? '', establishedYear: p.establishedYear ? String(p.establishedYear) : '',
    website: p.website ?? '', description: p.description ?? '', address: p.address ?? '',
    province: p.province ?? '', district: p.district ?? '', phone: p.phone ?? '',
    alternatePhone: p.alternatePhone ?? '', email: p.email ?? '', panNumber: p.panNumber ?? '',
    registrationNumber: p.registrationNumber ?? '', affiliationBoard: p.affiliationBoard ?? '',
    affiliationNumber: p.affiliationNumber ?? '', principalName: p.principalName ?? '',
    logoUrl: p.logoUrl ?? '', primaryColor: p.primaryColor ?? '#2563EB',
    principalSignatureUrl: p.principalSignatureUrl ?? '', schoolStampUrl: p.schoolStampUrl ?? '',
    brandColor: p.brandColor ?? '#475569', printLanguage: p.printLanguage ?? 'EN',
    paymentInstructions: p.paymentInstructions ?? '', qrImageUrl: p.qrImageUrl ?? '',
  };
}

export default function SettingsPage() {
  const { data: profile, isLoading } = useSchoolProfile();
  const update = useUpdateSchoolProfile();
  const { slug, setTenant } = useTenantStore();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState(false);
  // FILE-1: files picked while editing — uploaded via presign on Save.
  const [pendingFiles, setPendingFiles] = useState<{ logo?: File; signature?: File; stamp?: File; qr?: File }>({});
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function startEdit() {
    if (!profile) return;
    setForm(fromProfile(profile));
    setPendingFiles({});
    setEditing(true);
  }

  async function handleSave() {
    const year = form.establishedYear ? Number(form.establishedYear) : undefined;
    if (year !== undefined && (Number.isNaN(year) || year < 1800 || year > 2100)) {
      toast.error('Established year must be between 1800 and 2100');
      return;
    }
    // Text fields: omit when empty (avoids clearing on partial edits / failing IsEmail).
    const t = (v: string) => (v.trim() ? v.trim() : undefined);
    const payload: UpdateProfileData = {
      name: t(form.name), motto: t(form.motto), establishedYear: year,
      website: t(form.website), description: t(form.description), address: t(form.address),
      province: t(form.province), district: t(form.district), phone: t(form.phone),
      alternatePhone: t(form.alternatePhone), email: t(form.email), panNumber: t(form.panNumber),
      registrationNumber: t(form.registrationNumber), affiliationBoard: t(form.affiliationBoard),
      affiliationNumber: t(form.affiliationNumber), principalName: t(form.principalName),
      primaryColor: t(form.primaryColor),
      // Image fields: send raw so they can be cleared.
      logoUrl: form.logoUrl, principalSignatureUrl: form.principalSignatureUrl, schoolStampUrl: form.schoolStampUrl,
      // UI-7: brandColor/printLanguage always have a concrete value (the
      // picker/select default to the backend's own fallback, never blank);
      // paymentInstructions is free text, omitted when empty like the other
      // text fields above. qrImageUrl sent raw so it can be cleared.
      brandColor: form.brandColor,
      printLanguage: form.printLanguage as UpdateProfileData['printLanguage'],
      paymentInstructions: t(form.paymentInstructions),
      qrImageUrl: form.qrImageUrl,
    };
    try {
      // FILE-1: presign→PUT each picked file; the verified key replaces the
      // legacy base64 field. uploadFile falls back to base64 only when the
      // server has storage disabled (503) — then the preview data-URI in the
      // form value is exactly what gets sent, as before.
      const kinds = [
        ['logo', 'school-logo', 'logoFileKey', 'logoUrl'],
        ['signature', 'principal-signature', 'principalSignatureFileKey', 'principalSignatureUrl'],
        ['stamp', 'school-stamp', 'schoolStampFileKey', 'schoolStampUrl'],
        ['qr', 'qr-image', 'qrImageFileKey', 'qrImageUrl'],
      ] as const;
      for (const [slot, kind, keyField, urlField] of kinds) {
        const file = pendingFiles[slot];
        if (!file) continue;
        const uploaded = await uploadFile(file, kind);
        if (uploaded.mode === 'key') {
          payload[keyField] = uploaded.key;
          delete payload[urlField];
        }
      }
      const res = await update.mutateAsync(payload);
      // `useUpdateSchoolProfile`'s mutationFn returns settingsApi.updateProfile(data)
      // — the RAW axios response, not an unwrapped body. ResponseInterceptor wraps
      // as { success, data }, so the profile is at .data.data (the codebase's
      // documented "simple list -> .data.data" rule).
      const saved = res.data.data;
      // The tenant store is fed by /auth/me, which is not refetched here — so
      // without this the panel keeps the old branding until the next login.
      // BrandingSync repaints (and rewrites the pre-paint cache) off this.
      setTenant({
        slug: slug ?? undefined,
        name: saved.name,
        logoUrl: saved.logoUrl,
        primaryColor: saved.primaryColor,
        primaryForeground: saved.primaryForeground,
      });
      toast.success('School profile updated');
      setEditing(false);
      setPendingFiles({});
    } catch (err) {
      // MAIL-3 §3 / REG-1 Phase 5: surface the server's field-level 400 (e.g. an
      // invalid official Email) instead of a generic message.
      toast.error(extractApiErrors(err, 'Failed to update profile').join(' • '));
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Manage your school profile and official details" />
        <Skeleton className="h-28 rounded-sm" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-sm" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your school profile and official details" />

      {/* Hero */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            {profile?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logoUrl} alt="School logo" className="h-16 w-16 rounded-lg border border-stroke object-contain dark:border-strokedark" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10">
                <Building2 className="h-7 w-7" />
              </div>
            )}
            <div>
              <h3 className="text-xl font-semibold text-black dark:text-white">{profile?.name ?? 'Your School'}</h3>
              <p className="font-mono text-xs text-gray-500">{profile?.slug}</p>
              {profile?.motto && <p className="mt-0.5 text-sm italic text-gray-500 dark:text-gray-400">“{profile.motto}”</p>}
            </div>
          </div>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Edit2 className="mr-1.5 h-4 w-4" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleSave} disabled={update.isPending}>
                {update.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 1. Identity */}
      <Section icon={<Building2 className="h-4 w-4" />} title="School Identity" subtitle="Name, branding and about">
        <Grid>
          <FieldText label="School Name" required editing={editing} value={form.name} display={profile?.name} onChange={(v) => set('name', v)} placeholder="St. Xavier's School" />
          <FieldText label="Motto / Tagline" editing={editing} value={form.motto} display={profile?.motto} onChange={(v) => set('motto', v)} placeholder="Knowledge is Light" />
          <FieldText label="Established Year (AD)" type="number" editing={editing} value={form.establishedYear} display={profile?.establishedYear ? String(profile.establishedYear) : undefined} onChange={(v) => set('establishedYear', v)} placeholder="1995" />
          <FieldColor editing={editing} value={form.primaryColor} display={profile?.primaryColor} onChange={(v) => set('primaryColor', v)} />
          <div className="sm:col-span-2">
            <FieldTextarea label="Description" editing={editing} value={form.description} display={profile?.description} onChange={(v) => set('description', v)} placeholder="A short description / mission of your school" />
          </div>
          <div className="sm:col-span-2">
            <ImageField label="School Logo" hint="Square image works best (PNG/JPG, max 2 MB)" editing={editing} value={editing ? form.logoUrl : (profile?.logoUrl ?? '')} onChange={(v) => set('logoUrl', v)} onFile={(f) => setPendingFiles((p) => ({ ...p, logo: f }))} boxClass="h-20 w-20 rounded-lg" fallback={<Building2 className="h-6 w-6" />} />
          </div>
        </Grid>
      </Section>

      {/* 2. Contact & Location */}
      <Section icon={<MapPin className="h-4 w-4" />} title="Contact & Location" subtitle="How people reach your school">
        <Grid>
          <FieldText label="Phone" editing={editing} value={form.phone} display={profile?.phone} onChange={(v) => set('phone', v)} placeholder="01-XXXXXXX" />
          <FieldText label="Alternate Phone" editing={editing} value={form.alternatePhone} display={profile?.alternatePhone} onChange={(v) => set('alternatePhone', v)} placeholder="98XXXXXXXX" />
          <FieldText label="Email" type="email" editing={editing} value={form.email} display={profile?.email} onChange={(v) => set('email', v)} placeholder="info@school.edu.np" />
          <FieldText label="Website" editing={editing} value={form.website} display={profile?.website} onChange={(v) => set('website', v)} placeholder="https://school.edu.np" truncate />
          <FieldText label="Province" editing={editing} value={form.province} display={profile?.province} onChange={(v) => set('province', v)} placeholder="Bagmati" />
          <FieldText label="District" editing={editing} value={form.district} display={profile?.district} onChange={(v) => set('district', v)} placeholder="Kathmandu" />
          <div className="sm:col-span-2">
            <FieldText label="Address" editing={editing} value={form.address} display={profile?.address} onChange={(v) => set('address', v)} placeholder="Ward, Municipality, Street" />
          </div>
        </Grid>
      </Section>

      {/* 3. Legal & Affiliation */}
      <Section icon={<ScrollText className="h-4 w-4" />} title="Registration & Affiliation" subtitle="Official identifiers used on invoices and certificates">
        <Grid>
          <FieldText label="PAN Number (IRD)" editing={editing} value={form.panNumber} display={profile?.panNumber} onChange={(v) => set('panNumber', v)} placeholder="IRD PAN" mono />
          <FieldText label="Registration Number" editing={editing} value={form.registrationNumber} display={profile?.registrationNumber} onChange={(v) => set('registrationNumber', v)} placeholder="Govt. registration no." mono />
          <FieldText label="Affiliation Board" editing={editing} value={form.affiliationBoard} display={profile?.affiliationBoard} onChange={(v) => set('affiliationBoard', v)} placeholder="NEB / CBSE / Cambridge" />
          <FieldText label="Affiliation Number" editing={editing} value={form.affiliationNumber} display={profile?.affiliationNumber} onChange={(v) => set('affiliationNumber', v)} placeholder="Affiliation / approval no." mono />
        </Grid>
      </Section>

      {/* 4. Official signatures & stamp */}
      <Section
        icon={<PenLine className="h-4 w-4" />}
        title="Principal & Official Stamp"
        subtitle="Printed on report cards, certificates, ID cards and official letters"
      >
        <Grid>
          <div className="sm:col-span-2">
            <FieldText label="Principal's Name" editing={editing} value={form.principalName} display={profile?.principalName} onChange={(v) => set('principalName', v)} placeholder="Full name as it should appear on documents" />
          </div>
          <ImageField
            label="Principal's Signature"
            hint="Transparent PNG on white, landscape (max 2 MB)"
            editing={editing}
            value={editing ? form.principalSignatureUrl : (profile?.principalSignatureUrl ?? '')}
            onChange={(v) => set('principalSignatureUrl', v)}
            onFile={(f) => setPendingFiles((p) => ({ ...p, signature: f }))}
            boxClass="h-20 w-44 rounded-md"
            fallback={<PenLine className="h-6 w-6" />}
          />
          <ImageField
            label="School Stamp / Seal"
            hint="Round seal, transparent PNG (max 2 MB)"
            editing={editing}
            value={editing ? form.schoolStampUrl : (profile?.schoolStampUrl ?? '')}
            onChange={(v) => set('schoolStampUrl', v)}
            onFile={(f) => setPendingFiles((p) => ({ ...p, stamp: f }))}
            boxClass="h-24 w-24 rounded-full"
            fallback={<Stamp className="h-6 w-6" />}
          />
        </Grid>
      </Section>

      {/* 5. UI-7 — bill/receipt print settings. Same edit session, same
          EDITOR_ROLES tier as every section above (backend confirmed:
          brandColor/printLanguage/paymentInstructions/qrImageUrl all live on
          PATCH /settings/profile, not the owner-only finance/settings). */}
      <Section icon={<Palette className="h-4 w-4" />} title="Billing Documents" subtitle="Printed on every bill and receipt">
        <Grid>
          <BrandColorPicker editing={editing} value={form.brandColor} display={profile?.brandColor} onChange={(v) => set('brandColor', v)} />
          <PrintLanguageField editing={editing} value={form.printLanguage} display={profile?.printLanguage} onChange={(v) => set('printLanguage', v)} />
          <div className="sm:col-span-2">
            <FieldTextarea label="Payment Instructions" editing={editing} value={form.paymentInstructions} display={profile?.paymentInstructions} onChange={(v) => set('paymentInstructions', v)} placeholder="Bank details, eSewa ID, or how a parent should pay" />
          </div>
          <div className="sm:col-span-2">
            <ImageField
              label="Payment QR Code"
              hint="eSewa/bank QR image (max 1 MB)"
              editing={editing}
              value={editing ? form.qrImageUrl : (profile?.qrImageUrl ?? '')}
              onChange={(v) => set('qrImageUrl', v)}
              onFile={(f) => setPendingFiles((p) => ({ ...p, qr: f }))}
              boxClass="h-24 w-24 rounded-md"
              fallback={<QrCode className="h-6 w-6" />}
            />
          </div>
        </Grid>
      </Section>

      {/* 6. UI-7 — owner-only billing policy. A separate resource
          (PATCH /finance/settings) and a separate, stricter role tier —
          deliberately its own self-contained edit session (like
          ChangePasswordCard below), not folded into the page-wide toggle
          above, which only ever writes /settings/profile. */}
      <BillingPolicyCard />

      {/* MAIL-1 T4: account security */}
      <ChangePasswordCard onChange={(data) => authApi.changePassword(data)} />
    </div>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex items-center gap-3 border-b border-stroke px-6 py-4 dark:border-strokedark">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">{icon}</span>
        <div>
          <h4 className="font-semibold text-black dark:text-white">{title}</h4>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">{children}</div>;
}

function FieldText({
  label, value, display, onChange, editing, placeholder, type = 'text', required, mono, truncate,
}: {
  label: string; value: string; display?: string | null; onChange: (v: string) => void;
  editing: boolean; placeholder?: string; type?: string; required?: boolean; mono?: boolean; truncate?: boolean;
}) {
  if (editing) {
    return (
      <div className="space-y-1.5">
        <Label>{label}{required && ' *'}</Label>
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(mono && 'font-mono')} />
      </div>
    );
  }
  return (
    <div>
      <span className="text-xs text-gray-500">{label}</span>
      <p className={cn('mt-0.5 text-sm font-medium text-black dark:text-white', mono && 'font-mono text-xs', truncate && 'truncate')}>
        {display || <span className="font-normal text-gray-400">—</span>}
      </p>
    </div>
  );
}

function FieldTextarea({ label, value, display, onChange, editing, placeholder }: { label: string; value: string; display?: string | null; onChange: (v: string) => void; editing: boolean; placeholder?: string }) {
  if (editing) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-strokedark dark:text-white" />
      </div>
    );
  }
  return (
    <div>
      <span className="text-xs text-gray-500">{label}</span>
      <p className="mt-0.5 text-sm font-medium text-black dark:text-white">{display || <span className="font-normal text-gray-400">—</span>}</p>
    </div>
  );
}

function FieldColor({ value, display, onChange, editing }: { value: string; display?: string | null; onChange: (v: string) => void; editing: boolean }) {
  if (editing) {
    return (
      <div className="space-y-1.5">
        <Label>Brand Color</Label>
        <div className="flex items-center gap-2">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-14 cursor-pointer rounded border border-gray-300 p-0.5" />
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#2563EB" className="font-mono" />
        </div>
      </div>
    );
  }
  return (
    <div>
      <span className="text-xs text-gray-500">Brand Color</span>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-gray-200" style={{ background: display ?? '#2563EB' }} />
        <span className="font-mono text-sm font-medium">{display ?? '#2563EB'}</span>
      </div>
    </div>
  );
}

function ImageField({
  label, hint, value, onChange, onFile, editing, boxClass, fallback,
}: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
  onFile?: (file: File) => void;
  editing: boolean; boxClass: string; fallback: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // FILE-1: saved signature/stamp values are storage keys — resolve them to a
  // presigned GET for display. data-URI previews and public URLs pass through.
  const displaySrc = useFileUrl(value) ?? '';

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2 MB');
      return;
    }
    onFile?.(file);
    // Preview stays a local data-URI; the actual upload happens on Save.
    const reader = new FileReader();
    reader.onloadend = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displaySrc} alt={label} className={cn('border border-stroke bg-white object-contain dark:border-strokedark', boxClass)} />
        ) : (
          <div className={cn('flex items-center justify-center border border-dashed border-gray-300 text-gray-300 dark:border-strokedark', boxClass)}>{fallback}</div>
        )}
        {editing && (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload
              </Button>
              {value && (
                <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => onChange('')}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              )}
            </div>
            {hint && <p className="text-xs text-gray-400">{hint}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// UI-7 — the curated 8-swatch picker (not a hex input — the set is
// pre-vetted for print, see BILL_BRAND_COLORS above). Exported for its own
// focused test rather than mounting the whole page.
export function BrandColorPicker({
  value, display, onChange, editing,
}: { value: string; display?: string | null; onChange: (v: string) => void; editing: boolean }) {
  if (!editing) {
    const current = BILL_BRAND_COLORS.find((c) => c.value === display) ?? BILL_BRAND_COLORS[0];
    return (
      <div>
        <span className="text-xs text-gray-500">Bill Print Accent</span>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-5 w-5 rounded-full border border-gray-200" style={{ background: current.value }} />
          <span className="text-sm font-medium text-black dark:text-white">{current.name}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label>Bill Print Accent</Label>
      <div className="flex flex-wrap gap-2">
        {BILL_BRAND_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={value === c.value}
            onClick={() => onChange(c.value)}
            className={cn(
              'h-8 w-8 rounded-full border-2 transition-transform',
              value === c.value ? 'scale-110 border-black dark:border-white' : 'border-transparent',
            )}
            style={{ background: c.value }}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400">Print only — separate from the web Brand Color above.</p>
    </div>
  );
}

function PrintLanguageField({
  value, display, onChange, editing,
}: { value: string; display?: string | null; onChange: (v: string) => void; editing: boolean }) {
  const label = (v: string | null | undefined) => PRINT_LANGUAGES.find((l) => l.value === v)?.label ?? 'English';
  if (!editing) {
    return (
      <div>
        <span className="text-xs text-gray-500">Print Language</span>
        <p className="mt-0.5 text-sm font-medium text-black dark:text-white">{label(display)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label>Print Language</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="w-full"><span>{label(value)}</span></SelectTrigger>
        <SelectContent>
          {PRINT_LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// UI-7 — a separate resource (PATCH /finance/settings, OWNER_ONLY) and a
// separate role tier from everything above (PATCH /settings/profile,
// PRINCIPAL-inclusive) — its own self-contained edit session, same shape as
// ChangePasswordCard. Ruling: visible but disabled for a non-owner, with a
// short explanation — not hidden.
export function canEditBillingPolicy(role: string | undefined): boolean {
  return !!role && OWNER_ROLES.includes(role);
}

function BillingPolicyCard() {
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = canEditBillingPolicy(role);
  const { data: settings, isLoading } = useFinanceSettings();
  const update = useUpdateFinanceSettings();

  const [editing, setEditing] = useState(false);
  const [reset, setReset] = useState(false);
  const [threshold, setThreshold] = useState('');

  function startEdit() {
    if (!settings) return;
    setReset(settings.invoiceNumberingReset);
    setThreshold(String(settings.creditNoteApprovalThreshold));
    setEditing(true);
  }

  async function handleSave() {
    const amount = Number(threshold);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Threshold must be a non-negative number');
      return;
    }
    try {
      await update.mutateAsync({ invoiceNumberingReset: reset, creditNoteApprovalThreshold: threshold });
      toast.success('Billing policy updated');
      setEditing(false);
    } catch (err) {
      toast.error(extractApiErrors(err, 'Failed to update billing policy').join(' • '));
    }
  }

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex items-center gap-3 border-b border-stroke px-6 py-4 dark:border-strokedark">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
          <Landmark className="h-4 w-4" />
        </span>
        <div>
          <h4 className="font-semibold text-black dark:text-white">Billing Policy</h4>
          <p className="text-xs text-gray-500">Invoice numbering and correction approval</p>
        </div>
      </div>
      <div className="p-6">
        {!isOwner && (
          <p className="mb-4 rounded-sm border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
            Owner-only — contact your school&apos;s owner to change these settings.
          </p>
        )}
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-5">
            <Grid>
              <div className="flex items-start gap-2.5">
                <Checkbox
                  checked={editing ? reset : (settings?.invoiceNumberingReset ?? false)}
                  onCheckedChange={(c) => setReset(!!c)}
                  disabled={!editing || !isOwner}
                />
                <div>
                  <p className="text-sm font-medium text-black dark:text-white">Reset invoice numbering each fiscal year</p>
                  <p className="text-xs text-gray-500">Off = numbering runs continuous across years.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Credit Note Approval Threshold (Rs)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing ? threshold : String(settings?.creditNoteApprovalThreshold ?? 5000)}
                  onChange={(e) => setThreshold(e.target.value)}
                  disabled={!editing || !isOwner}
                  className="font-mono"
                />
                <p className="text-xs text-gray-400">Credit notes below this amount auto-post; at or above requires owner approval.</p>
              </div>
            </Grid>
            {isOwner && (
              <div className="flex justify-end gap-2">
                {!editing ? (
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    <Edit2 className="mr-1.5 h-4 w-4" />
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleSave} disabled={update.isPending}>
                      {update.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      Save
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
