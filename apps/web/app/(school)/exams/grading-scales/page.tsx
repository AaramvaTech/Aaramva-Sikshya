'use client';

import { useState } from 'react';
import { Plus, Pencil, Star, ChevronDown, ChevronUp, Scale, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import {
  useGradingScales,
  useGradingScale,
  useCreateGradingScale,
  useRenameGradingScale,
  useSetDefaultGradingScale,
} from '@/lib/hooks/use-examination';
import type { GradingScale } from '@/types/api.types';

// ── Threshold detail (loaded on expand — the list endpoint omits thresholds) ──
function ScaleThresholds({ id }: { id: string }) {
  const { data: scale, isLoading } = useGradingScale(id);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!scale?.thresholds?.length)
    return <p className="text-sm text-gray-400 py-2">No thresholds recorded.</p>;

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-2 text-left dark:bg-meta-4">
        <tr>
          {['Grade', 'Min %', 'Max %', 'GPA', 'Remarks'].map((h) => (
            <th key={h} className="px-3 py-2 font-medium text-black dark:text-white">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-stroke dark:divide-strokedark">
        {scale.thresholds.map((t) => (
          <tr key={`${t.grade}-${t.minPercent}`}>
            <td className="px-3 py-2 font-semibold text-black dark:text-white">{t.grade}</td>
            <td className="px-3 py-2 font-mono">{t.minPercent}</td>
            <td className="px-3 py-2 font-mono">{t.maxPercent}</td>
            <td className="px-3 py-2 font-mono">{t.gpaPoint ?? '—'}</td>
            <td className="px-3 py-2 text-gray-500">{t.remarks ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Create dialog threshold row model ────────────────────────────────────────
interface ThresholdDraft {
  grade: string;
  minPercent: string;
  maxPercent: string;
  gpaPoint: string;
  remarks: string;
}
const emptyRow = (): ThresholdDraft =>
  ({ grade: '', minPercent: '', maxPercent: '', gpaPoint: '', remarks: '' });

export default function GradingScalesPage() {
  const { data: scales, isLoading } = useGradingScales();
  const createScale = useCreateGradingScale();
  const renameScale = useRenameGradingScale();
  const setDefault = useSetDefaultGradingScale();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<ThresholdDraft[]>([emptyRow()]);

  // Rename dialog
  const [renameTarget, setRenameTarget] = useState<GradingScale | null>(null);
  const [renameValue, setRenameValue] = useState('');

  function updateRow(i: number, patch: Partial<ThresholdDraft>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleCreate() {
    const thresholds = rows
      .filter((r) => r.grade.trim())
      .map((r) => ({
        grade: r.grade.trim(),
        minPercent: parseFloat(r.minPercent),
        maxPercent: parseFloat(r.maxPercent),
        ...(r.gpaPoint ? { gpaPoint: parseFloat(r.gpaPoint) } : {}),
        ...(r.remarks.trim() ? { remarks: r.remarks.trim() } : {}),
      }));
    if (!name.trim()) return toast.error('Scale name is required');
    if (!thresholds.length) return toast.error('At least one threshold row is required');
    if (thresholds.some((t) => Number.isNaN(t.minPercent) || Number.isNaN(t.maxPercent)))
      return toast.error('Every threshold needs numeric min and max percentages');

    try {
      await createScale.mutateAsync({ name: name.trim(), thresholds });
      toast.success('Grading scale created');
      setCreateOpen(false);
      setName('');
      setRows([emptyRow()]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to create grading scale';
      toast.error(msg);
    }
  }

  async function handleRename() {
    if (!renameTarget) return;
    if (!renameValue.trim()) return toast.error('Name is required');
    try {
      await renameScale.mutateAsync({ id: renameTarget.id, name: renameValue.trim() });
      toast.success('Grading scale renamed');
      setRenameTarget(null);
    } catch {
      toast.error('Failed to rename grading scale');
    }
  }

  async function handleSetDefault(scale: GradingScale) {
    try {
      await setDefault.mutateAsync(scale.id);
      toast.success(`${scale.name} is now the default scale`);
    } catch {
      toast.error('Failed to set default');
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Grading Scales"
        description="Grade bands used to compute results — thresholds are fixed once created; rename or add a new scale"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Grading Scale
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !scales?.length ? (
        <EmptyState
          icon={Scale}
          message="No grading scales yet — create one (e.g. the NEB letter-grade bands) to compute exam results."
        />
      ) : (
        <div className="space-y-2">
          {scales.map((scale) => (
            <div key={scale.id} className="rounded-sm border border-stroke dark:border-strokedark overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  className="flex items-center gap-3 text-left flex-1"
                  onClick={() => setExpandedId(expandedId === scale.id ? null : scale.id)}
                >
                  <span className="font-medium text-black dark:text-white">{scale.name}</span>
                  {scale.isDefault && <Badge>Default</Badge>}
                  {expandedId === scale.id
                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
                <div className="flex items-center gap-2">
                  {!scale.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(scale)}
                      disabled={setDefault.isPending}
                    >
                      <Star className="h-3.5 w-3.5 mr-1" /> Set default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setRenameTarget(scale); setRenameValue(scale.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {expandedId === scale.id && (
                <div className="border-t border-stroke dark:border-strokedark px-4 py-3 bg-gray-50 dark:bg-meta-4/30">
                  <ScaleThresholds id={scale.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Grading Scale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="scale-name">Scale name</Label>
              <Input
                id="scale-name"
                placeholder="e.g. NEB Letter Grades"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Thresholds (min–max % → grade)</Label>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {rows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder="Grade"
                      aria-label={`Grade ${i + 1}`}
                      className="w-20"
                      value={row.grade}
                      onChange={(e) => updateRow(i, { grade: e.target.value })}
                    />
                    <Input
                      placeholder="Min %"
                      aria-label={`Min percent ${i + 1}`}
                      className="w-24"
                      inputMode="decimal"
                      value={row.minPercent}
                      onChange={(e) => updateRow(i, { minPercent: e.target.value })}
                    />
                    <Input
                      placeholder="Max %"
                      aria-label={`Max percent ${i + 1}`}
                      className="w-24"
                      inputMode="decimal"
                      value={row.maxPercent}
                      onChange={(e) => updateRow(i, { maxPercent: e.target.value })}
                    />
                    <Input
                      placeholder="GPA"
                      aria-label={`GPA ${i + 1}`}
                      className="w-20"
                      inputMode="decimal"
                      value={row.gpaPoint}
                      onChange={(e) => updateRow(i, { gpaPoint: e.target.value })}
                    />
                    <Input
                      placeholder="Remarks"
                      aria-label={`Remarks ${i + 1}`}
                      className="flex-1"
                      value={row.remarks}
                      onChange={(e) => updateRow(i, { remarks: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={rows.length === 1}
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add row
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Thresholds cannot be edited later — computed results depend on them. To change
              bands, create a new scale and set it as default.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createScale.isPending}>
              {createScale.isPending ? 'Creating…' : 'Create scale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Grading Scale</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-scale">Name</Label>
            <Input
              id="rename-scale"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={renameScale.isPending}>
              {renameScale.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
