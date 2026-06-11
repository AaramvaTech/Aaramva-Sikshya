'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import type { SectionTimetable, StaffSummary, Subject } from '@/types/api.types';
import { useCreateSlot, useDeleteSlot, useTeachers } from '@/lib/hooks/use-academic';

const DAYS = [
  { key: '0', label: 'SUN' },
  { key: '1', label: 'MON' },
  { key: '2', label: 'TUE' },
  { key: '3', label: 'WED' },
  { key: '4', label: 'THU' },
  { key: '5', label: 'FRI' },
];

const DEFAULT_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

interface TimetableGridProps {
  timetable: SectionTimetable;
  subjects: Subject[];
  academicYearId: string;
}

interface AddSlotState {
  dayOfWeek: number;
  periodNumber: number;
}

interface SlotDetailState {
  slotId: string;
  subject: string;
  teacher: string;
  room: string | null;
  time: string;
  dayOfWeek: number;
  periodNumber: number;
}

export function TimetableGrid({ timetable, subjects, academicYearId }: TimetableGridProps) {
  const [addSlot, setAddSlot] = useState<AddSlotState | null>(null);
  const [slotDetail, setSlotDetail] = useState<SlotDetailState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Add slot form
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [room, setRoom] = useState('');

  const createSlot = useCreateSlot();
  const deleteSlot = useDeleteSlot();
  const { data: teachers } = useTeachers();

  // Build a lookup: [period][day] → slot
  const allPeriods = new Set<number>();
  Object.values(timetable.schedule).forEach((slots) => {
    slots.forEach((s) => allPeriods.add(s.periodNumber));
  });
  DEFAULT_PERIODS.forEach((p) => allPeriods.add(p));
  const periods = Array.from(allPeriods).sort((a, b) => a - b);

  const slotMap = new Map<string, (typeof timetable.schedule)[string][number]>();
  DAYS.forEach(({ key }) => {
    (timetable.schedule[key] ?? []).forEach((slot) => {
      slotMap.set(`${slot.periodNumber}-${key}`, slot);
    });
  });

  function openAdd(dayOfWeek: number, periodNumber: number) {
    setSubjectId('');
    setTeacherId('');
    setStartTime('');
    setEndTime('');
    setRoom('');
    setAddSlot({ dayOfWeek, periodNumber });
  }

  function openDetail(slot: typeof timetable.schedule[string][number], dayKey: string) {
    setSlotDetail({
      slotId: slot.slotId,
      subject: slot.subject.name,
      teacher: slot.teacher.fullName,
      room: slot.room,
      time: `${slot.startTime} – ${slot.endTime}`,
      dayOfWeek: Number(dayKey),
      periodNumber: slot.periodNumber,
    });
  }

  async function handleAddSave() {
    if (!addSlot || !subjectId || !startTime || !endTime || !teacherId) return;
    try {
      await createSlot.mutateAsync({
        sectionId: timetable.sectionId,
        subjectId,
        teacherId,
        academicYearId,
        dayOfWeek: addSlot.dayOfWeek,
        periodNumber: addSlot.periodNumber,
        startTime,
        endTime,
        room: room || undefined,
      });
      toast.success('Slot added');
      setAddSlot(null);
    } catch {
      toast.error('Failed to add slot');
    }
  }

  async function handleDelete() {
    if (!deleteConfirm || !slotDetail) return;
    try {
      await deleteSlot.mutateAsync({
        slotId: deleteConfirm,
        sectionId: timetable.sectionId,
      });
      toast.success('Slot deleted');
      setDeleteConfirm(null);
      setSlotDetail(null);
    } catch {
      toast.error('Failed to delete slot');
    }
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-20 border-r">
                Period
              </th>
              {DAYS.map((day) => (
                <th key={day.key} className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 min-w-[110px]">
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {periods.map((period) => (
              <tr key={period} className="hover:bg-gray-50/50">
                <td className="px-3 py-2.5 text-xs font-medium text-gray-500 border-r text-center">
                  P{period}
                </td>
                {DAYS.map((day) => {
                  const slot = slotMap.get(`${period}-${day.key}`);
                  return (
                    <td key={day.key} className="px-2 py-2 text-center">
                      {slot ? (
                        <button
                          className="w-full rounded-md bg-brand-50 border border-brand-200 px-2 py-1.5 text-left hover:bg-brand-100 transition-colors"
                          onClick={() => openDetail(slot, day.key)}
                        >
                          <div className="text-xs font-semibold text-brand-500 truncate">
                            {slot.subject.name}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {slot.teacher.fullName.split(' ')[0]}
                          </div>
                        </button>
                      ) : (
                        <button
                          className="w-full h-12 rounded-md border border-dashed border-gray-200 flex items-center justify-center hover:border-brand-500 hover:bg-brand-50/50 transition-colors group"
                          onClick={() => openAdd(Number(day.key), period)}
                        >
                          <Plus className="h-3.5 w-3.5 text-gray-300 group-hover:text-brand-500" />
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add slot dialog */}
      <Dialog open={!!addSlot} onOpenChange={(open) => { if (!open) setAddSlot(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Add Slot — {DAYS.find((d) => d.key === String(addSlot?.dayOfWeek))?.label}, Period {addSlot?.periodNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Subject *</Label>
              <Select value={subjectId} onValueChange={(v) => setSubjectId(v ?? '')}>
                <SelectTrigger>
                  <span className={subjectId ? '' : 'text-muted-foreground'}>
                    {subjectId
                      ? (subjects.find((s) => s.id === subjectId)?.name ?? 'Loading…')
                      : 'Select subject'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Teacher *</Label>
              <Select value={teacherId} onValueChange={(v) => setTeacherId(v ?? '')}>
                <SelectTrigger>
                  <span className={teacherId ? '' : 'text-muted-foreground'}>
                    {teacherId
                      ? (teachers?.find((t: StaffSummary) => t.userId === teacherId)?.fullName ?? 'Loading…')
                      : 'Select teacher'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {teachers?.map((t: StaffSummary) => (
                    <SelectItem key={t.id} value={t.userId}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start-time">Start Time *</Label>
                <Input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-time">End Time *</Label>
                <Input id="end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room">Room</Label>
              <Input id="room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Room 101" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSlot(null)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleAddSave}
              disabled={createSlot.isPending || !subjectId || !startTime || !endTime || !teacherId}
            >
              {createSlot.isPending ? 'Adding…' : 'Add Slot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot detail dialog */}
      <Dialog open={!!slotDetail} onOpenChange={(open) => { if (!open) setSlotDetail(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{slotDetail?.subject}</DialogTitle>
            <DialogDescription>
              {slotDetail && DAYS.find((d) => d.key === String(slotDetail.dayOfWeek))?.label} · Period {slotDetail?.periodNumber} · {slotDetail?.time}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2 text-sm text-gray-600">
            <p><span className="font-medium text-gray-800">Teacher:</span> {slotDetail?.teacher}</p>
            {slotDetail?.room && <p><span className="font-medium text-gray-800">Room:</span> {slotDetail.room}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlotDetail(null)}>Close</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => slotDetail && setDeleteConfirm(slotDetail.slotId)}
            >
              <X className="h-4 w-4 mr-1" />
              Delete Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Delete Slot</DialogTitle>
            <DialogDescription>Remove this timetable slot?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteSlot.isPending}>
              {deleteSlot.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
