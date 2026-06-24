'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check, Lock, ArrowRight, Plus, CalendarRange, GraduationCap, Layers, BookOpen,
  Users, Briefcase, Palette, Loader2, PartyPopper,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { useOnboardingStatus, useCompleteOnboarding } from '@/lib/hooks/use-onboarding';
import {
  useClasses, useCreateClass, useCreateSection,
  useSubjects, useCreateSubject, useAssignSubject, useClassSubjects,
} from '@/lib/hooks/use-academic';
import {
  useCurrentAcademicYear, useCreateAcademicYear, useSetCurrentAcademicYear,
} from '@/lib/hooks/use-students';
import { StudentImport } from '@/components/students/student-import';
import { StaffStep } from '@/components/onboarding/staff-step';
import { BrandingStep } from '@/components/onboarding/branding-step';
import type { OnboardingStatus } from '@/types/api.types';

type StepKey = 'year' | 'classes' | 'sections' | 'subjects' | 'students' | 'staff' | 'branding';
const STEPS: { n: number; key: StepKey | 'finish'; label: string; icon: React.ReactNode; upcoming?: boolean }[] = [
  { n: 1, key: 'year', label: 'Academic Year', icon: <CalendarRange className="h-4 w-4" /> },
  { n: 2, key: 'classes', label: 'Classes', icon: <GraduationCap className="h-4 w-4" /> },
  { n: 3, key: 'sections', label: 'Sections', icon: <Layers className="h-4 w-4" /> },
  { n: 4, key: 'subjects', label: 'Subjects', icon: <BookOpen className="h-4 w-4" /> },
  { n: 5, key: 'students', label: 'Students', icon: <Users className="h-4 w-4" /> },
  { n: 6, key: 'staff', label: 'Staff', icon: <Briefcase className="h-4 w-4" /> },
  { n: 7, key: 'branding', label: 'Branding', icon: <Palette className="h-4 w-4" /> },
  { n: 8, key: 'finish', label: 'Review & finish', icon: <PartyPopper className="h-4 w-4" /> },
];

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useOnboardingStatus();
  const completeMutation = useCompleteOnboarding();
  const [activeStep, setActiveStep] = useState(1);
  const [resumed, setResumed] = useState(false);

  // Resume: jump to the first incomplete academic step once, on load.
  useEffect(() => {
    if (status && !resumed) {
      setActiveStep(Math.min(status.currentStep, 4));
      setResumed(true);
    }
  }, [status, resumed]);

  const steps = status?.steps;
  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: ['onboarding', 'status'] });

  // A step is reachable only when its academic prerequisites are complete.
  const academicComplete = !!steps && steps.year && steps.classes && steps.sections && steps.subjects;
  function unlocked(n: number): boolean {
    if (!steps) return n === 1;
    if (n === 1) return true;
    if (n === 2) return steps.year;
    if (n === 3) return steps.year && steps.classes;
    if (n === 4) return steps.year && steps.classes && steps.sections;
    // Students (5) / Staff (6) / Branding (7) / Finish (8) — all open once academic setup is done.
    return academicComplete;
  }
  // Stepper completion tick: data-presence for the recommended steps; the persisted
  // flag for the Finish step.
  function stepDone(key: StepKey | 'finish'): boolean {
    if (key === 'finish') return !!status?.completed;
    return !!steps?.[key];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-black dark:text-white">Set up your school</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          A quick guided setup. You can leave anytime and pick up where you left off.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* ── Stepper rail ──────────────────────────────────────────────── */}
        <ol className="space-y-1.5">
          {STEPS.map((s) => {
            const complete = stepDone(s.key);
            const isActive = s.n === activeStep;
            const canOpen = unlocked(s.n);
            return (
              <li key={s.n}>
                <button
                  type="button"
                  disabled={!canOpen}
                  onClick={() => canOpen && setActiveStep(s.n)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10'
                      : 'border-stroke bg-white hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4'
                  } ${!canOpen ? 'cursor-not-allowed opacity-55' : ''}`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      complete
                        ? 'bg-success-500 text-white'
                        : isActive
                        ? 'bg-brand-500 text-white'
                        : 'bg-gray-100 text-gray-500 dark:bg-meta-4'
                    }`}
                  >
                    {complete ? <Check className="h-4 w-4" /> : !canOpen ? <Lock className="h-3.5 w-3.5" /> : s.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-black dark:text-white">
                      {s.icon}
                      {s.label}
                    </span>
                    {!canOpen && <span className="text-[11px] text-gray-400">Finish academic setup first</span>}
                    {complete && <span className="text-[11px] text-success-600">Done</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* ── Step content ──────────────────────────────────────────────── */}
        <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-6">
          {isLoading || !steps ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading setup…
            </div>
          ) : activeStep === 1 ? (
            <YearStep done={steps.year} onChanged={refreshStatus} onNext={() => setActiveStep(2)} />
          ) : activeStep === 2 ? (
            <ClassesStep done={steps.classes} onChanged={refreshStatus} onNext={() => setActiveStep(3)} />
          ) : activeStep === 3 ? (
            <SectionsStep done={steps.sections} onChanged={refreshStatus} onNext={() => setActiveStep(4)} />
          ) : activeStep === 4 ? (
            <SubjectsStep
              done={steps.subjects}
              finishing={completeMutation.isPending}
              onChanged={refreshStatus}
              onFinish={completeAndGo}
            />
          ) : activeStep === 5 ? (
            <StepFrame title="Students" hint="Bulk-import students and their guardians from a CSV. Optional — you can also do this later from Students › Import.">
              <StudentImport onCommitted={refreshStatus} />
              <div className="flex items-center justify-between border-t border-stroke pt-3 dark:border-strokedark">
                <span className="text-xs text-gray-500">Students import is optional — continue when ready.</span>
                <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => setActiveStep(6)}>
                  Next: Staff <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </StepFrame>
          ) : activeStep === 6 ? (
            <StepFrame title="Staff" hint="Add teachers and other staff. Each gets a login — share the temporary password shown after you add them. Optional, and you can add more later from HR › Staff.">
              <StaffStep onChanged={refreshStatus} />
              <div className="flex items-center justify-between border-t border-stroke pt-3 dark:border-strokedark">
                <span className="text-xs text-gray-500">Staff setup is optional — continue when ready.</span>
                <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => setActiveStep(7)}>
                  Next: Branding <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </StepFrame>
          ) : activeStep === 7 ? (
            <StepFrame title="Branding" hint="Upload your school logo — the theme colour is derived automatically (you can override it). This is what the student, parent and teacher apps load for your school.">
              <BrandingStep onChanged={refreshStatus} />
              <div className="flex items-center justify-between border-t border-stroke pt-3 dark:border-strokedark">
                <span className="text-xs text-gray-500">Branding is optional — you can finish without it.</span>
                <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => setActiveStep(8)}>
                  Review &amp; finish <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </StepFrame>
          ) : activeStep === 8 ? (
            <FinishStep
              status={status}
              finishing={completeMutation.isPending}
              onFinish={completeAndGo}
              onJump={setActiveStep}
            />
          ) : null}
        </div>
      </div>
    </div>
  );

  async function completeAndGo() {
    try {
      await completeMutation.mutateAsync();
      toast.success('Setup complete! Welcome aboard.');
      router.push('/dashboard');
    } catch {
      toast.error('Could not finish setup. Please try again.');
    }
  }
}

// ── Step 1: Academic Year ──────────────────────────────────────────────────
function YearStep({ done, onChanged, onNext }: { done: boolean; onChanged: () => void; onNext: () => void }) {
  const { data: currentYear } = useCurrentAcademicYear();
  const createYear = useCreateAcademicYear();
  const setCurrent = useSetCurrentAcademicYear();
  const [name, setName] = useState('2081-82');
  const [yearBs, setYearBs] = useState('2081');
  const [startDate, setStartDate] = useState('2024-07-16');
  const [endDate, setEndDate] = useState('2025-07-15');

  async function handleCreate() {
    if (!name.trim() || !yearBs || !startDate || !endDate) {
      toast.error('Fill in all fields');
      return;
    }
    try {
      const res = await createYear.mutateAsync({ name: name.trim(), yearBs: Number(yearBs), startDate, endDate });
      await setCurrent.mutateAsync(res.data.data.id); // two-step: create → set-current
      onChanged();
      toast.success('Academic year created and set as current');
    } catch {
      toast.error('Could not create the academic year');
    }
  }

  const busy = createYear.isPending || setCurrent.isPending;

  return (
    <StepFrame
      title="Academic Year"
      hint="Everything else hangs off the current academic year, so it comes first."
    >
      {done ? (
        <DoneNotice
          text={`Current year: ${currentYear?.name ?? 'set'} (BS ${currentYear?.yearBs ?? ''})`}
          onNext={onNext}
          nextLabel="Next: Classes"
        />
      ) : (
        <div className="max-w-md space-y-4">
          <Field label="Year name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2081-82" />
          </Field>
          <Field label="BS year">
            <Input value={yearBs} onChange={(e) => setYearBs(e.target.value)} inputMode="numeric" placeholder="2081" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date (AD)">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={dateInputClass} />
            </Field>
            <Field label="End date (AD)">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={dateInputClass} />
            </Field>
          </div>
          <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleCreate} disabled={busy}>
            {busy ? 'Creating…' : 'Create & set current'}
          </Button>
        </div>
      )}
    </StepFrame>
  );
}

// ── Step 2: Classes ─────────────────────────────────────────────────────────
function ClassesStep({ done, onChanged, onNext }: { done: boolean; onChanged: () => void; onNext: () => void }) {
  const { data: classes } = useClasses();
  const createClass = useCreateClass();
  const [name, setName] = useState('');

  async function add() {
    if (!name.trim()) return;
    try {
      await createClass.mutateAsync({ name: name.trim(), orderIndex: (classes?.length ?? 0) + 1 });
      setName('');
      onChanged();
    } catch {
      toast.error('Could not add the class');
    }
  }

  return (
    <StepFrame title="Classes / Grades" hint="Add the grades your school runs (e.g. Grade 1, Grade 2 …).">
      <div className="max-w-lg space-y-4">
        <div className="flex items-end gap-2">
          <Field label="Class name" className="flex-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="e.g. Grade 1"
            />
          </Field>
          <Button variant="outline" onClick={add} disabled={createClass.isPending || !name.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>

        <ChipList items={(classes ?? []).map((c) => c.name)} empty="No classes yet — add your first above." />

        {done && <NextRow onNext={onNext} nextLabel="Next: Sections" count={classes?.length ?? 0} unit="class" />}
      </div>
    </StepFrame>
  );
}

// ── Step 3: Sections ──────────────────────────────────────────────────────
function SectionsStep({ done, onChanged, onNext }: { done: boolean; onChanged: () => void; onNext: () => void }) {
  const { data: classes } = useClasses();
  const createSection = useCreateSection();
  const [draft, setDraft] = useState<Record<string, string>>({});

  async function add(classId: string) {
    const val = (draft[classId] ?? '').trim();
    if (!val) return;
    try {
      await createSection.mutateAsync({ classId, data: { name: val } });
      setDraft((d) => ({ ...d, [classId]: '' }));
      onChanged();
    } catch {
      toast.error('Could not add the section');
    }
  }

  return (
    <StepFrame title="Sections" hint="Add at least one section to each class (e.g. A, B).">
      <div className="space-y-3">
        {(classes ?? []).map((c) => (
          <div key={c.id} className="rounded-lg border border-stroke p-3 dark:border-strokedark">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-black dark:text-white">{c.name}</span>
              <span className="text-xs text-gray-400">{c.sections.length} section(s)</span>
            </div>
            <ChipList items={c.sections.map((s) => s.name)} small empty="No sections yet" />
            <div className="mt-2 flex items-end gap-2">
              <Input
                value={draft[c.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && add(c.id)}
                placeholder="Section name (e.g. A)"
                className="h-9 max-w-[220px]"
              />
              <Button variant="outline" size="sm" onClick={() => add(c.id)} disabled={createSection.isPending}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>
        ))}
        {done && <NextRow onNext={onNext} nextLabel="Next: Subjects" />}
      </div>
    </StepFrame>
  );
}

// ── Step 4: Subjects ────────────────────────────────────────────────────────
function SubjectsStep({ done, finishing, onChanged, onFinish }: { done: boolean; finishing: boolean; onChanged: () => void; onFinish: () => void }) {
  const { data: currentYear } = useCurrentAcademicYear();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const createSubject = useCreateSubject();
  const assignSubject = useAssignSubject();

  const [newSubject, setNewSubject] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const { data: classSubjects } = useClassSubjects(classId, currentYear?.id);

  async function addSubject() {
    if (!newSubject.trim()) return;
    try {
      await createSubject.mutateAsync({ name: newSubject.trim() });
      setNewSubject('');
    } catch {
      toast.error('Could not create the subject');
    }
  }

  async function assign() {
    if (!classId || !subjectId || !currentYear?.id) {
      toast.error('Pick a class and a subject');
      return;
    }
    try {
      await assignSubject.mutateAsync({ classId, data: { subjectId, academicYearId: currentYear.id } });
      setSubjectId('');
      onChanged();
      toast.success('Subject assigned');
    } catch {
      toast.error('Could not assign (maybe already assigned)');
    }
  }

  const selectedClass = classes?.find((c) => c.id === classId);
  const selectedSubject = subjects?.find((s) => s.id === subjectId);

  return (
    <StepFrame title="Subjects" hint="Create subjects, then assign them to each class for the current year.">
      <div className="space-y-5">
        {/* Subject pool */}
        <div className="max-w-lg">
          <div className="flex items-end gap-2">
            <Field label="New subject" className="flex-1">
              <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubject()} placeholder="e.g. Mathematics" />
            </Field>
            <Button variant="outline" onClick={addSubject} disabled={createSubject.isPending || !newSubject.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          <div className="mt-2"><ChipList items={(subjects ?? []).map((s) => s.name)} small empty="No subjects yet" /></div>
        </div>

        {/* Assign to class */}
        <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
          <p className="mb-3 text-sm font-medium text-black dark:text-white">Assign a subject to a class</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Class">
              <Select value={classId} onValueChange={(v) => v && setClassId(v)}>
                <SelectTrigger className="w-44">
                  <span className={classId ? '' : 'text-muted-foreground'}>{selectedClass?.name ?? 'Select class'}</span>
                </SelectTrigger>
                <SelectContent>
                  {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subject">
              <Select value={subjectId} onValueChange={(v) => v && setSubjectId(v)}>
                <SelectTrigger className="w-44">
                  <span className={subjectId ? '' : 'text-muted-foreground'}>{selectedSubject?.name ?? 'Select subject'}</span>
                </SelectTrigger>
                <SelectContent>
                  {(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={assign}
              disabled={assignSubject.isPending || !classId || !subjectId}>
              Assign
            </Button>
          </div>

          {classId && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-gray-500">Assigned to {selectedClass?.name}:</p>
              <ChipList items={(classSubjects ?? []).map((cs) => cs.subjectName)} small empty="None assigned yet" />
            </div>
          )}
        </div>

        {done && (
          <div className="flex items-center justify-between rounded-lg border border-success-200 bg-success-50 px-4 py-3 dark:border-success-500/30 dark:bg-success-500/10">
            <span className="flex items-center gap-2 text-sm font-medium text-success-700 dark:text-success-400">
              <PartyPopper className="h-4 w-4" /> Academic setup is complete.
            </span>
            <Button className="bg-success-600 hover:bg-success-700 text-white" onClick={onFinish} disabled={finishing}>
              {finishing ? 'Finishing…' : 'Finish setup'} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </StepFrame>
  );
}

// ── Step 8: Review & finish ─────────────────────────────────────────────────
function FinishStep({
  status,
  finishing,
  onFinish,
  onJump,
}: {
  status: OnboardingStatus | undefined;
  finishing: boolean;
  onFinish: () => void;
  onJump: (n: number) => void;
}) {
  const steps = status?.steps;
  const counts = status?.counts;

  const rows: { label: string; done: boolean; detail: string; step: number; required?: boolean }[] = [
    {
      label: 'Academic setup',
      done: !!status?.academicComplete,
      detail: 'Year, classes, sections & subjects',
      step: 1,
      required: true,
    },
    {
      label: 'Students',
      done: !!steps?.students,
      detail: counts?.students ? `${counts.students} added` : 'None yet — recommended',
      step: 5,
    },
    {
      label: 'Staff',
      done: !!steps?.staff,
      detail: counts?.staff ? `${counts.staff} added` : 'None yet — recommended',
      step: 6,
    },
    {
      label: 'Branding',
      done: !!steps?.branding,
      detail: steps?.branding ? 'Logo / theme set' : 'Not set — recommended',
      step: 7,
    },
  ];

  return (
    <StepFrame title="Review & finish" hint="Academic setup is all you need to go live. Students, staff and branding are recommended — you can finish now and add them anytime.">
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between rounded-lg border border-stroke px-4 py-3 dark:border-strokedark"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  r.done ? 'bg-success-500 text-white' : 'bg-gray-100 text-gray-400 dark:bg-meta-4'
                }`}
              >
                {r.done ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs">–</span>}
              </span>
              <div>
                <p className="text-sm font-medium text-black dark:text-white">
                  {r.label}
                  {r.required && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">Required</span>}
                </p>
                <p className="text-xs text-gray-500">{r.detail}</p>
              </div>
            </div>
            {!r.done && (
              <Button variant="ghost" size="sm" onClick={() => onJump(r.step)}>
                Add <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-success-200 bg-success-50 px-4 py-3 dark:border-success-500/30 dark:bg-success-500/10">
        <span className="flex items-center gap-2 text-sm font-medium text-success-700 dark:text-success-400">
          <PartyPopper className="h-4 w-4" /> You&apos;re ready to go live.
        </span>
        <Button className="bg-success-600 hover:bg-success-700 text-white" onClick={onFinish} disabled={finishing}>
          {finishing ? 'Finishing…' : 'Finish setup'} <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </StepFrame>
  );
}

// ── Small presentational helpers ───────────────────────────────────────────
const dateInputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function StepFrame({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-black dark:text-white">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-gray-500">{label}</Label>
      {children}
    </div>
  );
}

function ChipList({ items, empty, small }: { items: string[]; empty: string; small?: boolean }) {
  if (items.length === 0) return <p className="text-xs text-gray-400">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={`${it}-${i}`}
          className={`inline-flex items-center rounded-full bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300 ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
          {it}
        </span>
      ))}
    </div>
  );
}

function DoneNotice({ text, onNext, nextLabel }: { text: string; onNext: () => void; nextLabel: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-success-200 bg-success-50 px-4 py-3 dark:border-success-500/30 dark:bg-success-500/10">
      <span className="flex items-center gap-2 text-sm font-medium text-success-700 dark:text-success-400">
        <Check className="h-4 w-4" /> {text}
      </span>
      <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={onNext}>
        {nextLabel} <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

function NextRow({ onNext, nextLabel, count, unit }: { onNext: () => void; nextLabel: string; count?: number; unit?: string }) {
  return (
    <div className="flex items-center justify-between border-t border-stroke pt-3 dark:border-strokedark">
      <span className="text-xs text-success-600">
        {count != null && unit ? `${count} ${unit}${count === 1 ? '' : 'es'} added — ` : ''}ready to continue
      </span>
      <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={onNext}>
        {nextLabel} <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
