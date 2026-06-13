'use client';

import { useState } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  useNotices,
  useCreateNotice,
  usePublishNotice,
  useDeleteNotice,
} from '@/lib/hooks/use-communication';
import type { Notice, CreateNoticeData } from '@/types/api.types';

const TYPE_COLORS: Record<string, string> = {
  URGENT: 'bg-error-100 text-error-700',
  EXAM: 'bg-blue-100 text-blue-700',
  EVENT: 'bg-purple-100 text-purple-700',
  HOLIDAY: 'bg-yellow-100 text-yellow-700',
  GENERAL: 'bg-gray-100 text-gray-700',
};

const AUDIENCE_LABELS: Record<string, string> = {
  ALL: 'Everyone',
  STUDENTS: 'Students',
  TEACHERS: 'Teachers',
  PARENTS: 'Parents',
  CLASS: 'Specific Class',
};

const TYPE_OPTIONS = ['GENERAL', 'EXAM', 'EVENT', 'URGENT', 'HOLIDAY'];
const AUDIENCE_OPTIONS = ['ALL', 'STUDENTS', 'TEACHERS', 'PARENTS', 'CLASS'];

function NoticeCardSkeleton() {
  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex justify-between items-center pt-1">
          <Skeleton className="h-4 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NoticesPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState<CreateNoticeData>({
    title: '',
    body: '',
    type: 'GENERAL',
    audience: 'ALL',
    expiresAt: undefined,
  });

  const { data: noticesData, isLoading } = useNotices({
    page: 1,
    limit: 50,
    type: typeFilter || undefined,
    audience: audienceFilter || undefined,
  });

  const notices: Notice[] = noticesData?.data ?? [];

  const createNotice = useCreateNotice();
  const publishNotice = usePublishNotice();
  const deleteNotice = useDeleteNotice();

  function resetForm() {
    setForm({ title: '', body: '', type: 'GENERAL', audience: 'ALL', expiresAt: undefined });
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    try {
      await createNotice.mutateAsync(form);
      toast.success('Notice created');
      setDialogOpen(false);
      resetForm();
    } catch {
      toast.error('Failed to create notice');
    }
  }

  async function handlePublish(id: string) {
    try {
      await publishNotice.mutateAsync(id);
      toast.success('Notice published');
    } catch {
      toast.error('Failed to publish notice');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteNotice.mutateAsync(id);
      toast.success('Notice deleted');
    } catch {
      toast.error('Failed to delete notice');
    }
  }

  return (
    <div>
      <PageHeader
        title="Notice Board"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Notice
          </Button>
        }
      />

      <div className="flex gap-3 mb-6">
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v == null || v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="w-36">
            <span className="truncate">{typeFilter || 'All Types'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={audienceFilter}
          onValueChange={(v) => setAudienceFilter(v == null || v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="w-44">
            <span className="truncate">{audienceFilter ? AUDIENCE_LABELS[audienceFilter] ?? audienceFilter : 'All Audiences'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Audiences</SelectItem>
            {AUDIENCE_OPTIONS.map((a) => (
              <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a] ?? a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <NoticeCardSkeleton key={i} />)}
        </div>
      ) : notices.length === 0 ? (
        <EmptyState message="No notices found." icon={Bell} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 2xl:gap-7.5">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={`rounded-sm border shadow-default dark:border-strokedark dark:bg-boxdark ${
                notice.isPublished
                  ? 'border-stroke bg-white'
                  : 'border-dashed border-stroke bg-gray-50 opacity-70'
              }`}
            >
              <div className="p-4">
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[notice.type] ?? 'bg-gray-100 text-gray-700'}`}>
                    {notice.type}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {AUDIENCE_LABELS[notice.audience] ?? notice.audience}
                  </Badge>
                </div>
                <h3 className="font-semibold text-black dark:text-white mb-1 leading-snug">{notice.title}</h3>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{notice.body}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {notice.isPublished && notice.publishedAt
                      ? <span>Published: <BsDate date={notice.publishedAt} /></span>
                      : <span className="italic">Draft</span>}
                  </span>
                  <div className="flex gap-2">
                    {!notice.isPublished && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-brand-500 text-brand-500 hover:bg-brand-500 hover:text-white"
                        onClick={() => handlePublish(notice.id)}
                        disabled={publishNotice.isPending}
                      >
                        Publish
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-error-600 hover:bg-error-50"
                      onClick={() => handleDelete(notice.id)}
                      disabled={deleteNotice.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Notice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="notice-title">Title *</Label>
              <Input
                id="notice-title"
                placeholder="Notice title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notice-body">Body *</Label>
              <Textarea
                id="notice-body"
                placeholder="Notice content..."
                rows={4}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.type ?? 'GENERAL'}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? undefined }))}
                >
                  <SelectTrigger>
                    <span className="truncate">{form.type ?? 'GENERAL'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select
                  value={form.audience ?? 'ALL'}
                  onValueChange={(v) => setForm((f) => ({ ...f, audience: v ?? undefined }))}
                >
                  <SelectTrigger>
                    <span className="truncate">{form.audience ? (AUDIENCE_LABELS[form.audience] ?? form.audience) : 'ALL'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((a) => (
                      <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a] ?? a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notice-expires">Expires At (optional)</Label>
              <Input
                id="notice-expires"
                type="date"
                value={form.expiresAt ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value || undefined }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleCreate}
              disabled={createNotice.isPending}
            >
              {createNotice.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
