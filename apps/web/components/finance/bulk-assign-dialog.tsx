'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, Loader2, X } from 'lucide-react';
import { todayBs } from 'bs-calendar';
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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { BulkJobProgress } from './bulk-job-progress';
import { useFeeStructures } from '@/lib/hooks/use-bill-catalog';
import { useAcademicYears, useCurrentAcademicYear, useClasses, useStudents } from '@/lib/hooks/use-students';
import { useBulkAssign } from '@/lib/hooks/use-bill-assignment';
import { addPickedStudent, removePickedStudent } from '@/lib/student-picker';
import { extractApiErrors } from '@/lib/api-errors';
import type { BulkAssignScopeType, StudentSummary } from '@/types/api.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * UI-2 §5.2 — mirrors generate-invoice-dialog.tsx's shape (single-student
 * search dropdown, class scope select), adapted where the two genuinely
 * differ: STUDENT_LIST needs an array, so each search result ADDS a
 * removable chip instead of replacing the input.
 */
export function BulkAssignDialog({ open, onOpenChange }: Props) {
  const bsYear = useMemo(() => todayBs().year, []);

  const [academicYearId, setAcademicYearId] = useState('');
  const [feeStructureId, setFeeStructureId] = useState('');
  const [scopeType, setScopeType] = useState<BulkAssignScopeType>('CLASS');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const [studentSearch, setStudentSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [pickedStudents, setPickedStudents] = useState<StudentSummary[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);

  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const effectiveYearId = academicYearId || currentYear?.id || '';

  const { data: structuresResponse } = useFeeStructures({ academicYearId: effectiveYearId || undefined });
  const structures = structuresResponse?.data ?? [];

  const { data: classes } = useClasses();
  const sections = classes?.find((c) => c.id === classId)?.sections ?? [];

  const { data: studentsData } = useStudents({ search: searchQuery, limit: 10, page: 1 });
  const searchResults = (studentsData?.data?.data ?? []).filter(
    (s) => !pickedStudents.some((p) => p.id === s.id),
  );

  const bulkAssign = useBulkAssign();

  function handleSearchInput(value: string) {
    setStudentSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
      setShowDropdown(true);
    }, 300);
  }

  function addStudent(s: StudentSummary) {
    setPickedStudents((prev) => addPickedStudent(prev, s));
    setStudentSearch('');
    setSearchQuery('');
    setShowDropdown(false);
  }

  function removeStudent(id: string) {
    setPickedStudents((prev) => removePickedStudent(prev, id));
  }

  function reset() {
    setAcademicYearId('');
    setFeeStructureId('');
    setScopeType('CLASS');
    setClassId('');
    setSectionId('');
    setEffectiveFrom('');
    setStudentSearch('');
    setSearchQuery('');
    setPickedStudents([]);
    setJobId(null);
  }

  const canSubmit =
    !!feeStructureId &&
    !!effectiveYearId &&
    !!effectiveFrom &&
    (scopeType === 'CLASS' ? !!classId : pickedStudents.length > 0);

  async function handleSubmit() {
    if (!canSubmit) { toast.error('Fill in every required field'); return; }
    try {
      const res = await bulkAssign.mutateAsync({
        feeStructureId,
        data: {
          scopeType,
          classId: scopeType === 'CLASS' ? classId : undefined,
          sectionId: scopeType === 'CLASS' && sectionId ? sectionId : undefined,
          studentIds: scopeType === 'STUDENT_LIST' ? pickedStudents.map((s) => s.id) : undefined,
          effectiveFrom,
        },
      });
      setJobId(res.data.data.id);
    } catch (err) {
      extractApiErrors(err, 'Failed to start bulk assign').forEach((m) => toast.error(m));
    }
  }

  // CLASS-scope failures fall back to the raw id in BulkJobProgress — the
  // class roster isn't fetched client-side here (UI-2-SPEC.md §5.2's known gap).
  const nameMap = new Map(pickedStudents.map((s) => [s.id, s.fullName]));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Bulk Assign Fee Structure</DialogTitle>
        </DialogHeader>

        {jobId ? (
          <>
            <BulkJobProgress jobId={jobId} resolveStudentName={(id) => nameMap.get(id) ?? id} />
            <DialogFooter>
              <Button
                className="bg-brand-500 hover:bg-brand-600 text-white"
                onClick={() => { reset(); onOpenChange(false); }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4 py-2">
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
                      <SelectItem key={y.id} value={y.id}>{y.name} {y.isCurrent ? '(Current)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Fee Structure *</Label>
                <Select value={feeStructureId} onValueChange={(v) => setFeeStructureId(v ?? '')}>
                  <SelectTrigger>
                    <span className={feeStructureId ? '' : 'text-muted-foreground'}>
                      {feeStructureId
                        ? (structures.find((s) => s.id === feeStructureId)?.name ?? 'Loading…')
                        : 'Select fee structure'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {structures.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {structures.length === 0 && effectiveYearId && (
                  <p className="text-xs text-gray-400">No fee structures for this academic year yet.</p>
                )}
              </div>

              <div className="flex border-b border-gray-200 dark:border-gray-800 -mx-6 px-6">
                {(['CLASS', 'STUDENT_LIST'] as BulkAssignScopeType[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScopeType(s)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      scopeType === s
                        ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {s === 'CLASS' ? 'Whole Class' : 'Pick Students'}
                  </button>
                ))}
              </div>

              {scopeType === 'CLASS' && (
                <div className="space-y-1.5">
                  <Label>Class *</Label>
                  <Select value={classId} onValueChange={(v) => { setClassId(v ?? ''); setSectionId(''); }}>
                    <SelectTrigger>
                      <span className={classId ? '' : 'text-muted-foreground'}>
                        {classId ? (classes?.find((c) => c.id === classId)?.name ?? 'Loading…') : 'Select class'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  {classId && sections.length > 0 && (
                    <>
                      <Label className="mt-2 block">Section (optional)</Label>
                      <Select value={sectionId} onValueChange={(v) => setSectionId(v ?? '')}>
                        <SelectTrigger>
                          <span className={sectionId ? '' : 'text-muted-foreground'}>
                            {sectionId ? (sections.find((sec) => sec.id === sectionId)?.name ?? 'Loading…') : 'All sections'}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {sections.map((sec) => <SelectItem key={sec.id} value={sec.id}>{sec.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  <p className="text-xs text-gray-400">Assigns every active student in the class (or section, if picked).</p>
                </div>
              )}

              {scopeType === 'STUDENT_LIST' && (
                <div className="space-y-1.5">
                  <Label>Students *</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      className="pl-9"
                      placeholder="Search student by name or admission no."
                      value={studentSearch}
                      onChange={(e) => handleSearchInput(e.target.value)}
                      onFocus={() => searchQuery && setShowDropdown(true)}
                    />
                    {showDropdown && searchResults.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white dark:bg-gray-900 shadow-lg max-h-48 overflow-y-auto">
                        {searchResults.map((s) => (
                          <button
                            key={s.id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5 flex items-center justify-between"
                            onClick={() => addStudent(s)}
                          >
                            <span className="font-medium">{s.firstName} {s.lastName}</span>
                            <span className="text-xs text-gray-400 font-mono">{s.studentId}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {pickedStudents.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {pickedStudents.map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/30 px-2.5 py-1 text-xs text-brand-700 dark:text-brand-300"
                        >
                          {s.fullName}
                          <button onClick={() => removeStudent(s.id)} className="hover:text-red-500">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <BsDateInput
                label="Effective From (BS) *"
                value={effectiveFrom}
                onChange={setEffectiveFrom}
                minYear={bsYear - 1}
                maxYear={bsYear + 1}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
                Cancel
              </Button>
              <Button
                className="bg-brand-500 hover:bg-brand-600 text-white"
                onClick={handleSubmit}
                disabled={!canSubmit || bulkAssign.isPending}
              >
                {bulkAssign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start Bulk Assign
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
