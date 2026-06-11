'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import { todayBs } from '@/lib/bs-calendar';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { SectionReportGrid } from '@/components/attendance/section-report-grid';
import { StudentSummaryCard } from '@/components/attendance/student-summary-card';
import { useClasses, useCurrentAcademicYear } from '@/lib/hooks/use-students';
import { useStudents } from '@/lib/hooks/use-students';
import {
  useSectionAttendanceReport,
  useStudentAttendanceSummary,
} from '@/lib/hooks/use-attendance';

type Tab = 'section' | 'student';

interface SectionParams {
  sectionId: string;
  fromDate: string;
  toDate: string;
}

export default function AttendanceReportsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('section');

  // ── Section Report state ──────────────────────────────────────────────────
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(today);
  const [generateParams, setGenerateParams] = useState<SectionParams | null>(null);

  const { data: classes } = useClasses();
  const { data: academicYear } = useCurrentAcademicYear();
  const selectedClass = classes?.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];

  const { data: report, isLoading: reportLoading } = useSectionAttendanceReport(
    generateParams?.sectionId ?? null,
    generateParams && academicYear
      ? {
          fromDate: generateParams.fromDate,
          toDate: generateParams.toDate,
          academicYearId: academicYear.id,
        }
      : null,
  );

  function handleGenerate() {
    if (!sectionId || !fromDate || !toDate) return;
    setGenerateParams({ sectionId, fromDate, toDate });
  }

  // ── Student Summary state ─────────────────────────────────────────────────
  const [studentSearch, setStudentSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const { data: studentSearchRes } = useStudents({
    search: searchTerm || undefined,
    limit: 20,
    status: 'ACTIVE',
  });
  const matchedStudents = studentSearchRes?.data?.data ?? [];

  const { data: studentSummary, isLoading: summaryLoading } =
    useStudentAttendanceSummary(selectedStudentId, academicYear?.id);

  function handleStudentSearch(value: string) {
    setStudentSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(value), 350);
  }

  const bsToday = todayBs();
  const yearMin = bsToday.year - 2;
  const yearMax = bsToday.year;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Attendance Reports" description="Section and student attendance analysis" />
        <Button variant="ghost" size="sm" onClick={() => router.push('/attendance')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-stroke dark:border-strokedark">
        {([
          { key: 'section', label: 'Section Report' },
          { key: 'student', label: 'Student Summary' },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Section Report tab ─────────────────────────────────────────────── */}
      {activeTab === 'section' && (
        <div className="space-y-5">
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="space-y-5 p-4 sm:p-6">
              {/* Who: class + section */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Class</label>
                  <Select
                    value={classId}
                    onValueChange={(v) => {
                      if (!v) return;
                      setClassId(v);
                      setSectionId('');
                      setGenerateParams(null);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <span className={classId ? '' : 'text-muted-foreground'}>
                        {classId
                          ? (classes?.find((c) => c.id === classId)?.name ?? 'Loading…')
                          : 'Select class'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {classes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Section</label>
                  <Select
                    value={sectionId}
                    onValueChange={(v) => {
                      if (!v) return;
                      setSectionId(v);
                      setGenerateParams(null);
                    }}
                    disabled={!classId}
                  >
                    <SelectTrigger className="w-full">
                      <span className={sectionId ? '' : 'text-muted-foreground'}>
                        {sectionId
                          ? (sections.find((s) => s.id === sectionId)?.name ?? 'Loading…')
                          : 'Select section'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* When: date range */}
              <div className="grid gap-4 sm:grid-cols-2">
                <BsDateInput
                  label="From Date"
                  value={fromDate}
                  onChange={(v) => {
                    setFromDate(v);
                    setGenerateParams(null);
                  }}
                  minYear={yearMin}
                  maxYear={yearMax}
                />

                <BsDateInput
                  label="To Date"
                  value={toDate}
                  onChange={(v) => {
                    setToDate(v);
                    setGenerateParams(null);
                  }}
                  minYear={yearMin}
                  maxYear={yearMax}
                />
              </div>

              <div className="flex justify-end border-t border-stroke pt-4 dark:border-strokedark">
                <Button
                  className="bg-brand-500 hover:bg-brand-600 text-white min-w-[160px]"
                  onClick={handleGenerate}
                  disabled={!sectionId || !fromDate || !toDate}
                >
                  <Search className="mr-1.5 h-4 w-4" />
                  Generate Report
                </Button>
              </div>
            </div>
          </div>

          {reportLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-sm" />
              ))}
            </div>
          )}

          {!reportLoading && !generateParams && (
            <div className="rounded-sm border border-dashed border-stroke px-4 py-12 text-center dark:border-strokedark">
              <CalendarRange className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choose a class, section and date range, then generate the report.
              </p>
            </div>
          )}

          {!reportLoading && report && <SectionReportGrid report={report} />}
        </div>
      )}

      {/* ── Student Summary tab ───────────────────────────────────────────── */}
      {activeTab === 'student' && (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search student by name or admission no."
                className="pl-9"
                value={studentSearch}
                onChange={(e) => handleStudentSearch(e.target.value)}
              />
            </div>

            {searchTerm && matchedStudents.length > 0 && !selectedStudentId && (
              <div className="border border-stroke dark:border-strokedark rounded-sm overflow-hidden max-w-sm bg-white dark:bg-boxdark">
                {matchedStudents.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-2 dark:hover:bg-meta-4 border-b border-stroke dark:border-strokedark last:border-b-0"
                    onClick={() => {
                      setSelectedStudentId(s.id);
                      setStudentSearch(s.fullName);
                      setSearchTerm('');
                    }}
                  >
                    <span className="font-medium text-black dark:text-white">{s.fullName}</span>
                    <span className="text-gray-500 ml-2 text-xs">{s.studentId}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedStudentId && (
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-500"
                onClick={() => {
                  setSelectedStudentId('');
                  setStudentSearch('');
                }}
              >
                ✕ Clear selection
              </Button>
            )}
          </div>

          {summaryLoading && (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48 rounded-sm" />
              <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-sm" />
                ))}
              </div>
            </div>
          )}

          {!summaryLoading && studentSummary && (
            <StudentSummaryCard summary={studentSummary} />
          )}
        </div>
      )}
    </div>
  );
}
