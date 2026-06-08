'use client';

import { useState } from 'react';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
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
  SelectValue,
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

export default function ResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: currentYear } = useCurrentAcademicYear();

  const [activeTab, setActiveTab] = useState<Tab>('ranks');
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(searchParams.get('examTypeId') ?? '');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentId, setStudentId] = useState('');

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
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-48">
              <Select value={selectedExamTypeId} onValueChange={(v) => setSelectedExamTypeId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Exam Type" /></SelectTrigger>
                <SelectContent>
                  {examTypes?.map((et) => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select value={selectedClassId} onValueChange={(v) => setSelectedClassId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  {classes?.map((cls) => <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>)}
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
          </div>

          {!selectedClassId || !selectedExamTypeId ? (
            <p className="text-sm text-gray-400 text-center py-12">
              Select exam type and class to view results
            </p>
          ) : resultsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
            </div>
          ) : !results?.length ? (
            <EmptyState
              message="No results yet. Click Compute Results to generate them."
              icon={BarChart2}
            />
          ) : (
            <div className="border rounded-lg overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
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
                  {results.map((row) => (
                    <TableRow key={row.studentId}>
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Report Card */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Enter student ID"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setStudentId(studentSearch.trim());
                }}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setStudentId(studentSearch.trim())}
              disabled={!studentSearch.trim()}
            >
              Search
            </Button>
          </div>

          {!studentId ? (
            <p className="text-sm text-gray-400 text-center py-12">
              Enter a student ID to view their report card
            </p>
          ) : reportCardLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : !reportCard ? (
            <p className="text-sm text-gray-400 text-center py-12">
              No report card found for this student
            </p>
          ) : (
            <ReportCardView reportCard={reportCard} />
          )}
        </div>
      )}
    </div>
  );
}
