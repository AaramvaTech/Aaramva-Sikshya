'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useGenerateInvoice, useGenerateBulkInvoices } from '@/lib/hooks/use-finance';
import { useStudents, useClasses, useAcademicYears, useCurrentAcademicYear } from '@/lib/hooks/use-students';
import type { StudentSummary } from '@/types/api.types';

type Mode = 'single' | 'bulk';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function todayAd() {
  return new Date().toISOString().split('T')[0];
}

export function GenerateInvoiceDialog({ open, onOpenChange, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('single');

  // Single mode state
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Shared state
  const [academicYearId, setAcademicYearId] = useState('');
  const [dueDate, setDueDate] = useState(todayAd());

  // Bulk mode state
  const [classId, setClassId] = useState('');

  // Result state
  const [bulkResult, setBulkResult] = useState<{ generated: number; skipped: number } | null>(null);

  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const { data: classes } = useClasses();
  const { data: studentsData } = useStudents({ search: searchQuery, limit: 10, page: 1 });

  const generateSingle = useGenerateInvoice();
  const generateBulk = useGenerateBulkInvoices();

  const effectiveYearId = academicYearId || currentYear?.id || '';
  const students = studentsData?.data?.data ?? [];

  function handleSearchInput(value: string) {
    setStudentSearch(value);
    setSelectedStudent(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
      setShowDropdown(true);
    }, 300);
  }

  function handleSelectStudent(student: StudentSummary) {
    setSelectedStudent(student);
    setStudentSearch(`${student.firstName} ${student.lastName} (${student.studentId})`);
    setShowDropdown(false);
  }

  function reset() {
    setStudentSearch('');
    setSelectedStudent(null);
    setSearchQuery('');
    setAcademicYearId('');
    setDueDate(todayAd());
    setClassId('');
    setBulkResult(null);
    setMode('single');
  }

  async function handleSingleSubmit() {
    if (!selectedStudent) { toast.error('Select a student'); return; }
    if (!effectiveYearId) { toast.error('Select academic year'); return; }
    if (!dueDate) { toast.error('Set a due date'); return; }
    try {
      await generateSingle.mutateAsync({
        studentId: selectedStudent.id,
        academicYearId: effectiveYearId,
        dueDate,
      });
      toast.success('Invoice generated');
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Failed to generate invoice');
    }
  }

  async function handleBulkSubmit() {
    if (!classId) { toast.error('Select a class'); return; }
    if (!effectiveYearId) { toast.error('Select academic year'); return; }
    if (!dueDate) { toast.error('Set a due date'); return; }
    try {
      const result = await generateBulk.mutateAsync({
        classId,
        academicYearId: effectiveYearId,
        dueDate,
      });
      const r = result.data.data;
      setBulkResult({ generated: r.generated, skipped: r.skipped });
      onSuccess?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Failed to generate bulk invoices');
    }
  }

  const isPending = generateSingle.isPending || generateBulk.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Generate Invoice</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 -mx-6 px-6">
          {(['single', 'bulk'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setBulkResult(null); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                mode === m
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {m === 'single' ? 'Single Student' : 'Bulk (Class)'}
            </button>
          ))}
        </div>

        {bulkResult ? (
          <div className="py-4 text-center space-y-1">
            <p className="text-2xl font-bold text-success-600">{bulkResult.generated}</p>
            <p className="text-sm text-gray-600">invoices generated</p>
            {bulkResult.skipped > 0 && (
              <p className="text-xs text-gray-400">{bulkResult.skipped} skipped (already have invoice for this date)</p>
            )}
            <Button
              className="mt-4 bg-brand-500 hover:bg-brand-600 text-white"
              onClick={() => { reset(); onOpenChange(false); }}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {mode === 'single' && (
              <div className="space-y-1.5">
                <Label>Student *</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search student by name or admission no."
                    value={studentSearch}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    onFocus={() => searchQuery && setShowDropdown(true)}
                  />
                  {showDropdown && students.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white dark:bg-gray-900 shadow-lg max-h-48 overflow-y-auto">
                      {students.map((s) => (
                        <button
                          key={s.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5 flex items-center justify-between"
                          onClick={() => handleSelectStudent(s)}
                        >
                          <span className="font-medium">{s.firstName} {s.lastName}</span>
                          <span className="text-xs text-gray-400 font-mono">{s.studentId}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {mode === 'bulk' && (
              <div className="space-y-1.5">
                <Label>Class *</Label>
                <Select value={classId} onValueChange={(v) => setClassId(v ?? '')}>
                  <SelectTrigger>
                    <span className={classId ? '' : 'text-muted-foreground'}>
                      {classId
                        ? (classes?.find((c) => c.id === classId)?.name ?? 'Loading…')
                        : 'Select class'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {classes?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">
                  Generates one invoice per active student. Skips students who already have an invoice for this due date.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Academic Year *</Label>
              <Select value={effectiveYearId} onValueChange={(v) => setAcademicYearId(v ?? '')}>
                <SelectTrigger>
                  <span>
                    {effectiveYearId
                      ? (allYears?.find((y) => y.id === effectiveYearId)?.name ?? 'Loading…')
                      : 'Select year'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {allYears?.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name} {y.isCurrent ? '(Current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Due Date *</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {!bulkResult && (
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={mode === 'single' ? handleSingleSubmit : handleBulkSubmit}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'single' ? 'Generate Invoice' : 'Generate for Class'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
