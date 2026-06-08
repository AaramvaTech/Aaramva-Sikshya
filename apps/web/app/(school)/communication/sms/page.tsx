'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { BsDate } from '@/components/shared/bs-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSendSms, useBulkSms, useSmsLogs } from '@/lib/hooks/use-communication';
import type { SmsLog } from '@/types/api.types';

const AUDIENCE_OPTIONS = ['ALL_PARENTS', 'ALL_STUDENTS', 'ALL_TEACHERS', 'ALL_STAFF'];
const STATUS_OPTIONS = ['SENT', 'FAILED', 'MOCK', 'PENDING'] as const;

const STATUS_COLORS: Record<string, string> = {
  SENT: 'bg-success-100 text-success-700',
  FAILED: 'bg-error-100 text-error-700',
  MOCK: 'bg-yellow-100 text-yellow-700',
  PENDING: 'bg-gray-100 text-gray-700',
};

function SmsSendTab() {
  const [audience, setAudience] = useState('ALL_PARENTS');
  const [customNumber, setCustomNumber] = useState('');
  const [message, setMessage] = useState('');
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);

  const sendSms = useSendSms();
  const bulkSms = useBulkSms();

  const isCustom = audience === 'CUSTOM_NUMBER';
  const charCount = message.length;

  async function handleSend() {
    if (!message.trim()) {
      toast.error('Message is required');
      return;
    }
    if (isCustom && !customNumber.trim()) {
      toast.error('Phone number is required');
      return;
    }
    try {
      if (isCustom) {
        await sendSms.mutateAsync({ toNumber: customNumber.trim(), message });
        toast.success('SMS sent');
      } else {
        const result = await bulkSms.mutateAsync({ audience, message });
        const d = (result as { data?: { data?: { sent?: number; failed?: number; skipped?: number } } })?.data?.data;
        setBulkResult({ sent: d?.sent ?? 0, failed: d?.failed ?? 0, skipped: d?.skipped ?? 0 });
        toast.success('Bulk SMS sent');
      }
      setMessage('');
      setCustomNumber('');
    } catch {
      toast.error('Failed to send SMS');
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="space-y-1.5">
        <Label>Audience</Label>
        <Select value={audience} onValueChange={(v) => { setAudience(v ?? 'ALL_PARENTS'); setBulkResult(null); }}>
          <SelectTrigger>
            <span className="truncate">{audience === 'CUSTOM_NUMBER' ? 'Custom Number' : audience.replace(/_/g, ' ')}</span>
          </SelectTrigger>
          <SelectContent>
            {AUDIENCE_OPTIONS.map((a) => (
              <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
            ))}
            <SelectItem value="CUSTOM_NUMBER">Custom Number</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isCustom && (
        <div className="space-y-1.5">
          <Label htmlFor="phone-number">Phone Number</Label>
          <Input
            id="phone-number"
            placeholder="e.g. 9841234567"
            value={customNumber}
            onChange={(e) => setCustomNumber(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="sms-message">Message</Label>
          <span className={`text-xs ${charCount > 160 ? 'text-error-500' : 'text-gray-400'}`}>
            {charCount}/160
          </span>
        </div>
        <Textarea
          id="sms-message"
          placeholder="Type your message here..."
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {charCount > 160 && (
          <p className="text-xs text-yellow-600">Message exceeds 160 characters — may be sent as multiple SMS.</p>
        )}
      </div>

      <Button
        className="bg-brand-500 hover:bg-brand-600 text-white"
        onClick={handleSend}
        disabled={sendSms.isPending || bulkSms.isPending}
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        {sendSms.isPending || bulkSms.isPending ? 'Sending...' : 'Send SMS'}
      </Button>

      {bulkResult && (
        <div className="flex gap-4 p-3 rounded-lg bg-gray-50 border text-sm">
          <span className="text-success-700 font-medium">Sent: {bulkResult.sent}</span>
          <span className="text-error-600 font-medium">Failed: {bulkResult.failed}</span>
          <span className="text-gray-500">Skipped: {bulkResult.skipped}</span>
        </div>
      )}
    </div>
  );
}

function SmsLogsTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: logsData, isLoading } = useSmsLogs({
    page,
    limit,
    status: statusFilter || undefined,
  });

  const logs: SmsLog[] = logsData?.data ?? [];
  const meta = logsData?.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v == null || v === '__all__' ? '' : v); setPage(1); }}
        >
          <SelectTrigger className="w-36">
            <span className="truncate">{statusFilter || 'All Status'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState message="No SMS logs found." icon={MessageSquare} />
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">To Number</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Message</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 hidden lg:table-cell">Trigger</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-900 font-mono text-xs">{log.toNumber}</td>
                    <td className="px-4 py-2.5 text-gray-600 hidden md:table-cell">
                      {log.message.length > 40 ? `${log.message.slice(0, 40)}…` : log.message}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 hidden lg:table-cell text-xs">{log.trigger}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell text-xs">
                      {log.sentAt ? <BsDate date={log.sentAt} /> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.total > limit && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Page {page} of {Math.ceil(meta.total / limit)}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(meta.total / limit)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SmsPage() {
  return (
    <div>
      <PageHeader title="SMS Center" description="Send messages and view delivery logs" />
      <Tabs defaultValue="send" className="space-y-6">
        <TabsList>
          <TabsTrigger value="send">Send SMS</TabsTrigger>
          <TabsTrigger value="logs">SMS Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="send">
          <SmsSendTab />
        </TabsContent>
        <TabsContent value="logs">
          <SmsLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
