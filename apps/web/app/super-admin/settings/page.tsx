'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, MessageSquare, CreditCard, Palette, Info } from 'lucide-react';
import { usePlatformSettings, useUpdatePlatformSettings } from '@/lib/hooks/use-super-admin';

export default function SettingsPage() {
  const { data: settings, isLoading } = usePlatformSettings();
  const updateSettings = useUpdatePlatformSettings();

  const [general, setGeneral] = useState({ platformName: '', defaultTrialDays: 30 });
  const [sms, setSms] = useState({ smsSenderId: '' });
  const [branding, setBranding] = useState({ primaryColor: '#1A5C38' });

  useEffect(() => {
    if (settings) {
      setGeneral({ platformName: settings.platformName, defaultTrialDays: settings.defaultTrialDays });
      setSms({ smsSenderId: settings.smsSenderId });
      setBranding({ primaryColor: settings.primaryColor });
    }
  }, [settings]);

  async function handleSave() {
    try {
      await updateSettings.mutateAsync({
        platformName: general.platformName,
        defaultTrialDays: general.defaultTrialDays,
        smsSenderId: sms.smsSenderId,
        primaryColor: branding.primaryColor,
      });
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">Loading settings…</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Platform Settings"
        description="Configure platform-wide settings"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={handleSave}
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        }
      />

      <div className="space-y-6">
        {/* General */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <div>
                <CardTitle>General</CardTitle>
                <CardDescription>Basic platform configuration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Platform Name</Label>
              <Input
                value={general.platformName}
                onChange={(e) => setGeneral((g) => ({ ...g, platformName: e.target.value }))}
                placeholder="Aaramva Shikshya"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default Trial Days</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={general.defaultTrialDays}
                onChange={(e) =>
                  setGeneral((g) => ({ ...g, defaultTrialDays: parseInt(e.target.value) || 30 }))
                }
              />
              <p className="text-xs text-gray-400">Applied to new school onboarding (1–90)</p>
            </div>
          </CardContent>
        </Card>

        {/* SMS Provider */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <div>
                <CardTitle>SMS Provider</CardTitle>
                <CardDescription>Sparrow SMS configuration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                The Sparrow SMS API token is configured via the <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">SPARROW_SMS_TOKEN</code> environment variable on the server. Set it in your <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">.env</code> file.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Sender ID</Label>
              <Input
                value={sms.smsSenderId}
                onChange={(e) => setSms((s) => ({ ...s, smsSenderId: e.target.value }))}
                placeholder="Aaramva"
                maxLength={11}
              />
              <p className="text-xs text-gray-400">Max 11 characters — shown as the SMS sender name</p>
            </div>
          </CardContent>
        </Card>

        {/* Payment Gateways */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <div>
                <CardTitle>Payment Gateways</CardTitle>
                <CardDescription>eSewa and Khalti configuration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Payment gateway secrets are configured via environment variables:{' '}
                <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">ESEWA_SECRET_KEY</code> and{' '}
                <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">KHALTI_SECRET_KEY</code>.
                Set them in your <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">.env</code> file.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Branding */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <div>
                <CardTitle>Branding</CardTitle>
                <CardDescription>Platform appearance settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Primary Color</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding((b) => ({ ...b, primaryColor: e.target.value }))}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={branding.primaryColor}
                  onChange={(e) => setBranding((b) => ({ ...b, primaryColor: e.target.value }))}
                  className="font-mono"
                  placeholder="#1A5C38"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
