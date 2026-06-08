'use client';

import { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ClassAccordion } from '@/components/academic/class-accordion';
import { EmptyState } from '@/components/shared/empty-state';
import { useClasses, useCreateClass } from '@/lib/hooks/use-academic';
import { Users } from 'lucide-react';

export default function ClassesPage() {
  const router = useRouter();
  const { data: classes, isLoading } = useClasses();
  const createClass = useCreateClass();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [orderIndex, setOrderIndex] = useState('');

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await createClass.mutateAsync({
        name: name.trim(),
        alias: alias.trim() || undefined,
        orderIndex: orderIndex ? Number(orderIndex) : (classes?.length ?? 0) + 1,
      });
      toast.success('Class created');
      setAddOpen(false);
      setName('');
      setAlias('');
      setOrderIndex('');
    } catch {
      toast.error('Failed to create class');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Classes & Sections"
          description="Manage classes and their sections"
        />
        <div className="flex gap-2 mt-0.5">
          <Button variant="ghost" size="sm" onClick={() => router.push('/academic')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Class
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : !classes?.length ? (
        <EmptyState message="No classes yet. Add your first class to get started." icon={Users} />
      ) : (
        <ClassAccordion classes={classes} />
      )}

      {/* Add class dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setAddOpen(false); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Add Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-cls-name">Class Name *</Label>
              <Input
                id="new-cls-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Grade 10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-cls-alias">Alias</Label>
              <Input
                id="new-cls-alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. X"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-cls-order">Order Index</Label>
              <Input
                id="new-cls-order"
                type="number"
                value={orderIndex}
                onChange={(e) => setOrderIndex(e.target.value)}
                placeholder="Auto"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleAdd}
              disabled={createClass.isPending || !name.trim()}
            >
              {createClass.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
