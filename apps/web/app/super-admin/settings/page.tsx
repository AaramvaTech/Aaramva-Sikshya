'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, MessageSquare, CreditCard, Palette } from 'lucide-react';

export default function SettingsPage() {
  const [general, setGeneral] = useState({
    platformName: 'Aaramva Shikshya',
    defaultTrialDays: 30,
  });
  const [sms, setSms] = useState({
    enabled: false,
    token: '',
    senderId: 'Aaramva',
  });
  const [payments, setPayments] = useState({
    esewaEnabled: false,
    esewaSecret: '',
    khaltiEnabled: false,
    khaltiSecret: '',
  });
  const [branding, setBranding] = useState({
    primaryColor: '#1A5C38',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    // TODO: Wire up to backend API when available
    await new Promise((r) => setTimeout(r, 500));
    setSaving(false);
    toast.success('Settings saved successfully');
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
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
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
              <p className="text-theme-xs text-gray-400">Number of days for new school trials (1-90)</p>
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
                <CardDescription>Configure Sparrow SMS integration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sms-enabled"
                checked={sms.enabled}
                onCheckedChange={(v) => setSms((s) => ({ ...s, enabled: !!v }))}
              />
              <Label htmlFor="sms-enabled" className="cursor-pointer">Enable SMS Notifications</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Sparrow SMS Token</Label>
              <Input
                type="password"
                value={sms.token}
                onChange={(e) => setSms((s) => ({ ...s, token: e.target.value }))}
                placeholder="Enter API token"
                disabled={!sms.enabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sender ID</Label>
              <Input
                value={sms.senderId}
                onChange={(e) => setSms((s) => ({ ...s, senderId: e.target.value }))}
                placeholder="Aaramva"
                disabled={!sms.enabled}
              />
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
                <CardDescription>Configure eSewa and Khalti integration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="esewa-enabled"
                  checked={payments.esewaEnabled}
                  onCheckedChange={(v) => setPayments((p) => ({ ...p, esewaEnabled: !!v }))}
                />
                <Label htmlFor="esewa-enabled" className="cursor-pointer">Enable eSewa</Label>
              </div>
              <div className="space-y-1.5">
                <Label>eSewa Secret Key</Label>
                <Input
                  type="password"
                  value={payments.esewaSecret}
                  onChange={(e) => setPayments((p) => ({ ...p, esewaSecret: e.target.value }))}
                  placeholder="Enter eSewa secret key"
                  disabled={!payments.esewaEnabled}
                />
              </div>
            </div>
            <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="khalti-enabled"
                  checked={payments.khaltiEnabled}
                  onCheckedChange={(v) => setPayments((p) => ({ ...p, khaltiEnabled: !!v }))}
                />
                <Label htmlFor="khalti-enabled" className="cursor-pointer">Enable Khalti</Label>
              </div>
              <div className="space-y-1.5">
                <Label>Khalti Secret Key</Label>
                <Input
                  type="password"
                  value={payments.khaltiSecret}
                  onChange={(e) => setPayments((p) => ({ ...p, khaltiSecret: e.target.value }))}
                  placeholder="Enter Khalti secret key"
                  disabled={!payments.khaltiEnabled}
                />
              </div>
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
