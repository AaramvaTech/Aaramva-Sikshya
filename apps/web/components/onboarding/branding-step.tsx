'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Loader2, Image as ImageIcon, Palette, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSchoolProfile, useUpdateSchoolProfile } from '@/lib/hooks/use-settings';
import { uploadFile } from '@/lib/upload';

export function BrandingStep({ onChanged }: { onChanged?: () => void }) {
  const { data: profile, isLoading } = useSchoolProfile();
  const update = useUpdateSchoolProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [manualColor, setManualColor] = useState('#2563EB');
  const [hydrated, setHydrated] = useState(false);

  // Seed editable fields from the loaded profile once.
  useEffect(() => {
    if (profile && !hydrated) {
      setName(profile.name ?? '');
      setManualColor(profile.primaryColor ?? '#2563EB');
      setHydrated(true);
    }
  }, [profile, hydrated]);

  // Keep the manual picker in sync with a freshly auto-derived colour.
  useEffect(() => {
    if (profile?.primaryColor) setManualColor(profile.primaryColor);
  }, [profile?.primaryColor]);

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2 MB');
      return;
    }
    try {
      // FILE-1: presign→PUT→logoFileKey (base64 only if storage is disabled).
      // Either way the server runs node-vibrant on the logo bytes and stores
      // the auto-derived theme colour.
      const uploaded = await uploadFile(file, 'school-logo');
      await update.mutateAsync(
        uploaded.mode === 'key' ? { logoFileKey: uploaded.key } : { logoUrl: uploaded.dataUrl },
      );
      toast.success('Logo uploaded — theme colour derived from it');
      onChanged?.();
    } catch {
      toast.error('Could not upload the logo');
    }
  }

  async function saveName() {
    if (!name.trim()) {
      toast.error('School name cannot be empty');
      return;
    }
    try {
      await update.mutateAsync({ name: name.trim() });
      toast.success('School name saved');
      onChanged?.();
    } catch {
      toast.error('Could not save the name');
    }
  }

  async function applyColor() {
    try {
      // Manual override → server flags colorSource = 'manual'.
      await update.mutateAsync({ primaryColor: manualColor });
      toast.success('Theme colour updated');
      onChanged?.();
    } catch {
      toast.error('Could not update the colour');
    }
  }

  if (isLoading || !profile) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading branding…
      </div>
    );
  }

  const derived = profile.primaryColor;

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-black dark:text-white">
          <ImageIcon className="h-4 w-4" /> School logo
        </p>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stroke bg-gray-50 dark:border-strokedark dark:bg-meta-4">
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logoUrl} alt="School logo" className="h-full w-full object-contain" />
            ) : (
              <ImageIcon className="h-7 w-7 text-gray-300" />
            )}
          </div>
          <div className="space-y-1.5">
            <input ref={fileRef} type="file" accept="image/*" onChange={onLogoFile} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {profile.logoUrl ? 'Replace logo' : 'Upload logo'}
            </Button>
            <p className="text-xs text-gray-400">PNG/JPG up to 2 MB. The theme colour is derived from the logo automatically.</p>
          </div>
        </div>
      </div>

      {/* Theme colour */}
      <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-black dark:text-white">
          <Palette className="h-4 w-4" /> Theme colour
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Current (apps use this)</Label>
            <div className="flex items-center gap-2">
              <span className="h-9 w-9 rounded-md border border-stroke dark:border-strokedark" style={{ backgroundColor: derived }} />
              <span className="font-mono text-sm text-gray-600 dark:text-gray-300">{derived}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Override</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={manualColor}
                onChange={(e) => setManualColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent"
              />
              <Input value={manualColor} onChange={(e) => setManualColor(e.target.value)} className="w-32 font-mono" />
            </div>
          </div>
          <Button variant="outline" onClick={applyColor} disabled={update.isPending || manualColor === derived}>
            <Check className="mr-1 h-4 w-4" /> Apply colour
          </Button>
        </div>
      </div>

      {/* Display name */}
      <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
        <p className="mb-3 text-sm font-medium text-black dark:text-white">School display name</p>
        <div className="flex max-w-md items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-gray-500">Name shown to students &amp; parents</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="St. Xavier's School" />
          </div>
          <Button variant="outline" onClick={saveName} disabled={update.isPending || name.trim() === profile.name}>
            Save
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Branding is optional — you can skip it now and set it later from Settings. Whatever you save here is what the
        student, parent and teacher apps load for your school.
      </p>
    </div>
  );
}
