'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Edit2, Lock, Plus, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ConfigSection } from '@/components/shared/config-section';
import { BsDate } from '@/components/shared/bs-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  useCalendarHolidays,
  useCreateSchoolHoliday,
  useUpdateSchoolHoliday,
  useDeleteSchoolHoliday,
} from '@/lib/hooks/use-calendar';
import type { CalendarDay } from '@/types/api.types';

/**
 * CAL-1 Phase 2 — admin CRUD for school-specific holidays. GOVT rows
 * (bulk-imported, Phase 1) are shown for context but carry no edit/delete
 * controls — locked decision: government holidays are fixed and not
 * overridable per-school.
 *
 * Dates are plain native <input type="date"> (AD), not the shared
 * BsDateInput component — BsDateInput's fireChange() has a known,
 * documented off-by-one-day bug under Asia/Kathmandu (UTC+5:45) via
 * toISOString() (see CLAUDE.md's WEB-P Phase 4 entry). A wrong holiday
 * date is exactly the failure this feature exists to prevent, so this
 * screen avoids that component rather than inheriting the bug. The BS
 * equivalent is still shown via <BsDate>, which is read-only display and
 * unaffected.
 */
export default function HolidaysPage() {
  const { data: holidays, isLoading } = useCalendarHolidays();
  const create = useCreateSchoolHoliday();
  const update = useUpdateSchoolHoliday();
  const remove = useDeleteSchoolHoliday();

  const [newDate, setNewDate] = useState('');
  const [newLabelEn, setNewLabelEn] = useState('');
  const [newLabelNe, setNewLabelNe] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editLabelEn, setEditLabelEn] = useState('');
  const [editLabelNe, setEditLabelNe] = useState('');

  async function handleCreate() {
    if (!newDate || !newLabelEn.trim()) return;
    try {
      await create.mutateAsync({
        date: newDate,
        labelEn: newLabelEn.trim(),
        labelNe: newLabelNe.trim() || undefined,
      });
      setNewDate('');
      setNewLabelEn('');
      setNewLabelNe('');
      toast.success('Holiday added');
    } catch {
      toast.error('Failed to add holiday');
    }
  }

  function startEdit(h: CalendarDay) {
    setEditId(h.id);
    setEditDate(h.date.ad);
    setEditLabelEn(h.labelEn);
    setEditLabelNe(h.labelNe ?? '');
  }

  async function handleUpdate(id: string) {
    if (!editDate || !editLabelEn.trim()) return;
    try {
      await update.mutateAsync({
        id,
        data: { date: editDate, labelEn: editLabelEn.trim(), labelNe: editLabelNe.trim() || undefined },
      });
      setEditId(null);
      toast.success('Holiday updated');
    } catch {
      toast.error('Failed to update holiday');
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success('Holiday removed');
    } catch {
      toast.error('Failed to remove holiday');
    }
  }

  const sorted = [...(holidays ?? [])].sort((a, b) => a.date.ad.localeCompare(b.date.ad));

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Calendar"
        description="Government public holidays and your school's own closures"
      />

      <ConfigSection
        title="Holidays"
        description="Government holidays are fixed. Add your school's own — exam breaks, local events, closures."
        isLoading={isLoading}
        addSlot={
          <div className="flex gap-2 flex-wrap items-center">
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-44"
            />
            <Input
              placeholder="Label (English)"
              value={newLabelEn}
              onChange={(e) => setNewLabelEn(e.target.value)}
              className="max-w-48"
            />
            <Input
              placeholder="Label (Nepali) — optional"
              value={newLabelNe}
              onChange={(e) => setNewLabelNe(e.target.value)}
              className="max-w-48"
            />
            <Button
              size="sm"
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleCreate}
              disabled={!newDate || !newLabelEn.trim() || create.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        }
      >
        {sorted.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No holidays on record.</p>
        )}
        {sorted.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
          >
            {editId === h.id ? (
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-44 h-8 text-sm"
                  autoFocus
                />
                <Input
                  value={editLabelEn}
                  onChange={(e) => setEditLabelEn(e.target.value)}
                  className="max-w-48 h-8 text-sm"
                />
                <Input
                  value={editLabelNe}
                  onChange={(e) => setEditLabelNe(e.target.value)}
                  placeholder="Nepali label"
                  className="max-w-48 h-8 text-sm"
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(h.id)} disabled={update.isPending}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <BsDate date={h.date} showAd />
                  <span className="font-medium text-sm text-gray-800 dark:text-white">{h.labelEn}</span>
                  {h.labelNe && <span className="text-xs text-gray-500">{h.labelNe}</span>}
                  <Badge
                    variant="outline"
                    className={h.source === 'GOVT' ? 'text-xs text-blue-600 border-blue-200' : 'text-xs text-brand-600 border-brand-200'}
                  >
                    {h.source === 'GOVT' ? 'Government' : 'School'}
                  </Badge>
                </div>
                <div className="flex gap-1 shrink-0">
                  {h.source === 'GOVT' ? (
                    <span className="flex items-center gap-1 text-xs text-gray-400 px-2" title="Government holidays are fixed and cannot be edited or removed">
                      <Lock className="h-3.5 w-3.5" />
                      Fixed
                    </span>
                  ) : (
                    <SchoolHolidayActions onEdit={() => startEdit(h)} onDelete={() => handleDelete(h.id)} />
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </ConfigSection>
    </div>
  );
}

function SchoolHolidayActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600" onClick={onEdit}>
        <Edit2 className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
