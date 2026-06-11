'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import type { ClassWithSections } from '@/types/api.types';
import {
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useUpdateClass,
  useDeleteClass,
} from '@/lib/hooks/use-academic';

interface ClassAccordionProps {
  classes: ClassWithSections[];
}

type SectionDialogState =
  | { mode: 'add'; classId: string }
  | { mode: 'edit'; classId: string; sectionId: string; name: string; capacity: number }
  | null;

type ClassDialogState =
  | { mode: 'edit'; id: string; name: string; alias: string; orderIndex: number }
  | null;

type DeleteState =
  | { type: 'class'; id: string; name: string }
  | { type: 'section'; classId: string; sectionId: string; name: string }
  | null;

export function ClassAccordion({ classes }: ClassAccordionProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sectionDialog, setSectionDialog] = useState<SectionDialogState>(null);
  const [classDialog, setClassDialog] = useState<ClassDialogState>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>(null);
  const submittingRef = useRef(false);

  const [sectionName, setSectionName] = useState('');
  const [sectionCapacity, setSectionCapacity] = useState('');
  const [className, setClassName] = useState('');
  const [classAlias, setClassAlias] = useState('');
  const [classOrder, setClassOrder] = useState('');

  const createSection = useCreateSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const updateClass = useUpdateClass();
  const deleteClass = useDeleteClass();

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAddSection(classId: string) {
    setSectionName('');
    setSectionCapacity('');
    setSectionDialog({ mode: 'add', classId });
  }

  function openEditSection(classId: string, sectionId: string, name: string, capacity: number) {
    setSectionName(name);
    setSectionCapacity(String(capacity));
    setSectionDialog({ mode: 'edit', classId, sectionId, name, capacity });
  }

  function openEditClass(cls: ClassWithSections) {
    setClassName(cls.name);
    setClassAlias(cls.alias ?? '');
    setClassOrder(String(cls.orderIndex));
    setClassDialog({ mode: 'edit', id: cls.id, name: cls.name, alias: cls.alias ?? '', orderIndex: cls.orderIndex });
  }

  async function handleSectionSave() {
    if (!sectionDialog || !sectionName.trim() || submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (sectionDialog.mode === 'add') {
        await createSection.mutateAsync({
          classId: sectionDialog.classId,
          data: { name: sectionName.trim(), capacity: sectionCapacity ? Number(sectionCapacity) : undefined },
        });
        toast.success('Section added');
      } else {
        await updateSection.mutateAsync({
          classId: sectionDialog.classId,
          sectionId: sectionDialog.sectionId,
          data: { name: sectionName.trim(), capacity: sectionCapacity ? Number(sectionCapacity) : undefined },
        });
        toast.success('Section updated');
      }
      setSectionDialog(null);
    } catch {
      toast.error('Failed to save section');
    } finally {
      submittingRef.current = false;
    }
  }

  async function handleClassSave() {
    if (!classDialog || !className.trim() || submittingRef.current) return;
    submittingRef.current = true;
    try {
      await updateClass.mutateAsync({
        id: classDialog.id,
        data: { name: className.trim(), alias: classAlias.trim() || undefined, orderIndex: classOrder ? Number(classOrder) : undefined },
      });
      toast.success('Class updated');
      setClassDialog(null);
    } catch {
      toast.error('Failed to update class');
    } finally {
      submittingRef.current = false;
    }
  }

  async function handleDelete() {
    if (!deleteState || submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (deleteState.type === 'class') {
        await deleteClass.mutateAsync(deleteState.id);
        toast.success('Class deleted');
      } else {
        await deleteSection.mutateAsync({ classId: deleteState.classId, sectionId: deleteState.sectionId });
        toast.success('Section deleted');
      }
      setDeleteState(null);
    } catch {
      toast.error('Failed to delete');
    } finally {
      submittingRef.current = false;
    }
  }

  const sectionPending = createSection.isPending || updateSection.isPending;
  const deletePending = deleteClass.isPending || deleteSection.isPending;

  // Deduplicate classes and sections by ID (defensive against stale cache data)
  const dedupedClasses = classes.filter((cls, idx, arr) => arr.findIndex((c) => c.id === cls.id) === idx);

  return (
    <div className="space-y-2">
      {dedupedClasses.map((cls) => {
        // Deduplicate sections within each class
        const seenSecIds = new Set<string>();
        const dedupedSections = cls.sections.filter((sec) => {
          if (seenSecIds.has(sec.id)) return false;
          seenSecIds.add(sec.id);
          return true;
        });
        const isOpen = expanded.has(cls.id);
        return (
          <div key={cls.id} className="border rounded-lg bg-white overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
              onClick={() => toggle(cls.id)}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                <span className="font-semibold text-gray-800">{cls.name}</span>
                {cls.alias && <span className="text-xs text-gray-400">({cls.alias})</span>}
                <span className="text-xs text-gray-400 ml-1">
                  · {dedupedSections.length} {dedupedSections.length === 1 ? 'section' : 'sections'}
                </span>
              </div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditClass(cls)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-error-500 hover:text-error-600"
                  onClick={() => setDeleteState({ type: 'class', id: cls.id, name: cls.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {isOpen && (
              <div className="border-t bg-gray-50/50">
                {dedupedSections.length === 0 ? (
                  <p className="text-sm text-gray-400 px-6 py-3">No sections yet</p>
                ) : (
                  <div className="divide-y">
                    {dedupedSections.map((sec) => (
                      <div key={sec.id} className="flex items-center justify-between px-6 py-2.5">
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Section {sec.name}</span>
                          {sec.capacity > 0 && (
                            <span className="text-gray-400 ml-2">Capacity: {sec.capacity}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditSection(cls.id, sec.id, sec.name, sec.capacity)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-error-500 hover:text-error-600"
                            onClick={() =>
                              setDeleteState({ type: 'section', classId: cls.id, sectionId: sec.id, name: sec.name })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="px-6 py-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-brand-500 border-brand-500 hover:bg-brand-500 hover:text-white h-8 text-xs"
                    onClick={() => openAddSection(cls.id)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Section
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Section dialog */}
      <Dialog open={!!sectionDialog} onOpenChange={(open) => { if (!open) setSectionDialog(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{sectionDialog?.mode === 'add' ? 'Add Section' : 'Edit Section'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sec-name">Section Name *</Label>
              <Input id="sec-name" value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="e.g. A" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sec-cap">Capacity</Label>
              <Input id="sec-cap" type="number" value={sectionCapacity} onChange={(e) => setSectionCapacity(e.target.value)} placeholder="e.g. 40" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionDialog(null)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleSectionSave}
              disabled={sectionPending || !sectionName.trim()}
            >
              {sectionPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit class dialog */}
      <Dialog open={!!classDialog} onOpenChange={(open) => { if (!open) setClassDialog(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cls-name">Class Name *</Label>
              <Input id="cls-name" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. Grade 10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cls-alias">Alias</Label>
              <Input id="cls-alias" value={classAlias} onChange={(e) => setClassAlias(e.target.value)} placeholder="e.g. X" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cls-order">Order Index</Label>
              <Input id="cls-order" type="number" value={classOrder} onChange={(e) => setClassOrder(e.target.value)} placeholder="e.g. 10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassDialog(null)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleClassSave}
              disabled={updateClass.isPending || !className.trim()}
            >
              {updateClass.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={!!deleteState} onOpenChange={(open) => { if (!open) setDeleteState(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>
              {deleteState?.type === 'class' ? 'Delete Class' : 'Delete Section'}
            </DialogTitle>
            <DialogDescription>
              {deleteState?.type === 'class'
                ? `Are you sure you want to delete "${deleteState.name}"? All sections will also be deleted.`
                : `Are you sure you want to delete "Section ${deleteState?.name}"?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteState(null)} disabled={deletePending}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletePending}>
              {deletePending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
