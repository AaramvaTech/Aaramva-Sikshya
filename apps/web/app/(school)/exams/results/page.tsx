'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  Printer,
  Users,
  TrendingUp,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { ReportCardView } from '@/components/exams/report-card';
import { BarChart2 } from 'lucide-react';
import {
  useExamTypes,
  useClassResults,
  useComputeResults,
  useReportCard,
} from '@/lib/hooks/use-examination';
import { useClasses } from '@/lib/hooks/use-academic';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';

type Tab = 'ranks' | 'report';
type StatusFilter = 'all' | 'pass' | 'fail';

function SubjectBreakdown({ studentId, examTypeId }: { studentId: string; examTypeId: string }) {
  const { data: reportCard, isLoading } = useReportCard(studentId);

  if (isLoading) {
    return (
      <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-400 animate-pulse">
        Loading subject breakdown…
      </div>
    );
  }

  const examResult = reportCard?.examResults.find((er) => er.examType.id === examTypeId);
  if (!examResult?.subjects.length) {
    return (
      <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-400">
        No subject data available.
      </div>
    );
  }

  return (
    <div className="px-6 py-3 bg-gray-50 border-t">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b border-gray-200">
            <th className="text-left pb-1.5 pr-4 font-medium">Subject</th>
            <th className="text-center pb-1.5 pr-4 font-medium">Marks</th>
            <th className="text-center pb-1.5 pr-4 font-medium">%</th>
            <th className="text-center pb-1.5 pr-4 font-medium">Grade</th>
            <th className="text-center pb-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {examResult.subjects.map((s) => (
            <tr key={s.subjectId} className="border-b border-gray-100 last:border-0">
              <td className="py-1.5 pr-4 text-gray-700 font-medium">{s.subjectName}</td>
              <td className="text-center py-1.5 pr-4 text-gray-600">
                {s.isAbsent ? (
                  <span className="text-error-500 font-semibold">ABS</span>
                ) : s.marksObtained != null ? (
                  <>
                    <span className="font-semibold">{s.marksObtained}</span>
                    <span className="text-gray-400">/{s.fullMarks}</span>
                  </>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="text-center py-1.5 pr-4 text-gray-600">
                {s.percentage != null ? `${s.percentage.toFixed(1)}%` : '—'}
              </td>
              <td className="text-center py-1.5 pr-4 font-semibold text-gray-700">
                {s.grade ?? '—'}
              </td>
              <td className="text-center py-1.5">
                <span
                  className={`font-semibold ${
                    s.isAbsent
                      ? 'text-gray-500'
                      : s.isPassed
                      ? 'text-success-600'
                      : 'text-error-500'
                  }`}
                >
                  {s.isAbsent ? 'Absent' : s.isPassed ? 'Pass' : 'Fail'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: currentYear } = useCurrentAcademicYear();

  const [activeTab, setActiveTab] = useState<Tab>('ranks');
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(searchParams.get('examTypeId') ?? '');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Report card tab state
  const [studentSearch, setStudentSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [reportCardExamTypeId, setReportCardExamTypeId] = useState('');

  const { data: examTypes } = useExamTypes(currentYear?.id ?? '');
  const { data: classes } = useClasses();
  const { data: results, isLoading: resultsLoading } = useClassResults(
    selectedClassId,
    selectedExamTypeId,
  );
  const computeResults = useComputeResults();
  const { data: reportCard, isLoading: reportCardLoading } = useReportCard(studentId);

  async function handleCompute() {
    if (!selectedExamTypeId || !selectedClassId) {
      toast.error('Select exam type and class first');
      return;
    }
    try {
      const res = await computeResults.mutateAsync({
        examTypeId: selectedExamTypeId,
        classId: selectedClassId,
      });
      const { computed, passed, failed, absent } = res.data.data;
      toast.success(
        `Results computed: ${computed} students — ${passed} passed, ${failed} failed, ${absent} absent`,
      );
    } catch {
      toast.error('Failed to compute results');
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredResults = (results ?? []).filter((r) => {
    if (statusFilter === 'pass') return r.isPassed;
    if (statusFilter === 'fail') return !r.isPassed;
    return true;
  });

  const stats = results?.length
    ? {
        total: results.length,
        passed: results.filter((r) => r.isPassed).length,
        failed: results.filter((r) => !r.isPassed).length,
        avgPct: results.reduce((s, r) => s + r.percentage, 0) / results.length,
      }
    : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ranks', label: 'Class Rank List' },
    { key: 'report', label: 'Report Card' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Exam Results" description="View class rankings and report cards" />
        <Button variant="ghost" size="sm" onClick={() => router.push('/exams')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Class Rank List */}
      {activeTab === 'ranks' && (
        <div className="space-y-4">
          {/* Controls row */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-48">
              <Select
                value={selectedExamTypeId}
                onValueChange={(v) => {
                  setSelectedExamTypeId(v ?? '');
                  setExpandedIds(new Set());
                }}
              >
                <SelectTrigger>
                  <span className={selectedExamTypeId ? '' : 'text-muted-foreground'}>
                    {selectedExamTypeId
                      ? (examTypes?.find((et) => et.id === selectedExamTypeId)?.name ?? 'Loading…')
                      : 'Exam Type'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {examTypes?.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      {et.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select
                value={selectedClassId}
                onValueChange={(v) => {
                  setSelectedClassId(v ?? '');
                  setExpandedIds(new Set());
                }}
              >
                <SelectTrigger>
                  <span className={selectedClassId ? '' : 'text-muted-foreground'}>
                    {selectedClassId
                      ? (classes?.find((cls) => cls.id === selectedClassId)?.name ?? 'Loading…')
                      : 'Class'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              size="sm"
              onClick={handleCompute}
              disabled={computeResults.isPending || !selectedExamTypeId || !selectedClassId}
            >
              {computeResults.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Compute Results
            </Button>
            {results?.length ? (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto no-print"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            ) : null}
          </div>

          {/* Stats cards */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border rounded-lg px-4 py-3 bg-white flex items-center gap-3">
                <Users className="h-5 w-5 text-gray-500 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Total</p>
                  <p className="text-xl font-bold text-gray-800">{stats.total}</p>
                </div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-white flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-success-100 flex items-center justify-center shrink-0">
                  <span className="text-success-600 text-xs font-bold">✓</span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Passed</p>
                  <p className="text-xl font-bold text-success-600">{stats.passed}</p>
                </div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-white flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-error-100 flex items-center justify-center shrink-0">
                  <span className="text-error-500 text-xs font-bold">✗</span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Failed</p>
                  <p className="text-xl font-bold text-error-500">{stats.failed}</p>
                </div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-white flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-brand-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Avg Score</p>
                  <p className="text-xl font-bold text-brand-500">{stats.avgPct.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Status filter pills */}
          {results?.length ? (
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'pass', 'fail'] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === f
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'pass' ? 'Pass Only' : 'Fail Only'}
                </button>
              ))}
              <span className="text-xs text-gray-400 ml-1">
                {filteredResults.length} of {results.length} students
              </span>
            </div>
          ) : null}

          {!selectedClassId || !selectedExamTypeId ? (
            <p className="text-sm text-gray-400 text-center py-12">
              Select exam type and class to view results
            </p>
          ) : resultsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded" />
              ))}
            </div>
          ) : !results?.length ? (
            <EmptyState
              message="No results yet. Click Compute Results to generate them."
              icon={BarChart2}
            />
          ) : !filteredResults.length ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No students match the selected filter.
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Admission No.</TableHead>
                    <TableHead className="text-center">Obtained</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead className="text-center">Grade</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResults.map((row) => {
                    const isExpanded = expandedIds.has(row.studentId);
                    return (
                      <React.Fragment key={row.studentId}>
                        <TableRow
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => toggleExpanded(row.studentId)}
                        >
                          <TableCell className="w-8 text-gray-400 pr-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono font-semibold text-gray-700">
                            #{row.rankInSection}
                          </TableCell>
                          <TableCell className="font-medium">{row.fullName}</TableCell>
                          <TableCell className="font-mono text-xs text-gray-500">
                            {row.admissionNumber}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.obtainedMarks}/{row.totalMarks}
                          </TableCell>
                          <TableCell className="text-center">{row.percentage.toFixed(1)}%</TableCell>
                          <TableCell className="text-center font-semibold">{row.grade}</TableCell>
                          <TableCell className="text-center">
                            <Badge
                              className={
                                row.isPassed
                                  ? 'bg-success-100 text-success-700 border-0'
                                  : 'bg-error-100 text-error-600 border-0'
                              }
                            >
                              {row.isPassed ? 'Pass' : 'Fail'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="p-0">
                              <SubjectBreakdown
                                studentId={row.studentId}
                                examTypeId={selectedExamTypeId}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Report Card */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Admission number (e.g. STU-2081-0001 or 2081-0001)"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setStudentId(studentSearch.trim());
                }}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setStudentId(studentSearch.trim());
                setReportCardExamTypeId('');
              }}
              disabled={!studentSearch.trim()}
            >
              Search
            </Button>
            {reportCard && (
              <div className="w-52">
                <Select
                  value={reportCardExamTypeId}
                  onValueChange={(v) => setReportCardExamTypeId(v ?? '')}
                >
                  <SelectTrigger>
                    <span className={reportCardExamTypeId ? '' : 'text-muted-foreground'}>
                      {reportCardExamTypeId
                        ? (reportCard.examResults.find(
                            (er) => er.examType.id === reportCardExamTypeId,
                          )?.examType.name ?? 'Loading…')
                        : 'Annual (All Terms)'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Annual (All Terms)</SelectItem>
                    {[...reportCard.examResults]
                      .sort((a, b) => a.examType.orderIndex - b.examType.orderIndex)
                      .map((er) => (
                        <SelectItem key={er.examType.id} value={er.examType.id}>
                          {er.examType.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!studentId ? (
            <p className="text-sm text-gray-400 text-center py-12">
              Enter a student admission number to view their report card
            </p>
          ) : reportCardLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : !reportCard ? (
            <p className="text-sm text-gray-400 text-center py-12">
              No report card found for this student
            </p>
          ) : (
            <ReportCardView
              reportCard={reportCard}
              filterExamTypeId={reportCardExamTypeId || undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}
