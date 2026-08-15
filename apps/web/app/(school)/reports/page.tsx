'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { BsDate } from '@/components/shared/bs-date';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useClasses } from '@/lib/hooks/use-academic';
import {
  useAttendanceTrends,
  useClassComparison,
  useExamComparison,
  useExamSummary,
  useFeeAging,
  useLowAttendance,
  usePublishedExams,
  useStaffAttendanceSummary,
} from '@/lib/hooks/use-reports';
import { exportToCsv } from '@/lib/export';
import { useAuthStore } from '@/store/auth.store';
import { todayBs } from 'bs-calendar';

// Semantic report colours (attendance STATUS_CONFIG convention — not brand).
const COLOR = { present: '#16A34A', absent: '#DC2626', late: '#D97706', leave: '#2563EB' };

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
    </Button>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-black dark:text-white">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: (string | number | null)[][] }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-gray-400">No data in this range.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-2 text-left dark:bg-meta-4">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium text-black dark:text-white">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stroke dark:divide-strokedark">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-gray-600 dark:text-gray-300">{cell ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Attendance tab ────────────────────────────────────────────────────────────

function AttendanceTab() {
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [groupBy, setGroupBy] = useState<'bs-month' | 'day'>('bs-month');
  const bsYear = useMemo(() => todayBs().year, []);

  const { data: classes } = useClasses();
  const selectedClass = classes?.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];

  const params = {
    from: from || undefined,
    to: to || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
  };
  const trends = useAttendanceTrends({ ...params, groupBy });
  const low = useLowAttendance(params);
  const staff = useStaffAttendanceSummary({ from: params.from, to: params.to });
  const comparison = useClassComparison(classId, { from: params.from, to: params.to });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={classId || 'all'} onValueChange={(v) => { setClassId(!v || v === 'all' ? '' : v); setSectionId(''); }}>
          <SelectTrigger className="w-40"><span>{selectedClass?.name ?? 'All classes'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sectionId || 'all'} onValueChange={(v) => setSectionId(!v || v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36"><span>{sections.find((s) => s.id === sectionId)?.name ?? 'All sections'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <BsDateInput label="From (BS)" value={from} onChange={setFrom} minYear={bsYear - 2} maxYear={bsYear} />
        <BsDateInput label="To (BS)" value={to} onChange={setTo} minYear={bsYear - 2} maxYear={bsYear} />
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v === 'day' ? 'day' : 'bs-month')}>
          <SelectTrigger className="w-36"><span>{groupBy === 'day' ? 'Daily' : 'BS month'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="bs-month">BS month</SelectItem>
            <SelectItem value="day">Daily</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card
        title="Attendance trend"
        action={trends.data && (
          <CsvButton onClick={() => exportToCsv('attendance-trends.csv', trends.data!.buckets.map((b) => ({
            period: b.label, present: b.present, absent: b.absent, late: b.late,
            leave: b.leave, total: b.total, 'attendance %': b.attendanceRate,
          })))} />
        )}
      >
        {trends.isError ? (
          <QueryErrorState onRetry={() => trends.refetch()} />
        ) : trends.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !trends.data?.buckets.length ? (
          <p className="py-6 text-center text-sm text-gray-400">No attendance in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trends.data.buckets}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="present" stackId="a" fill={COLOR.present} name="Present" />
              <Bar dataKey="late" stackId="a" fill={COLOR.late} name="Late" />
              <Bar dataKey="leave" stackId="a" fill={COLOR.leave} name="Leave" />
              <Bar dataKey="absent" stackId="a" fill={COLOR.absent} name="Absent" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {classId && comparison.data && (
        <Card
          title={`Section comparison — ${selectedClass?.name}`}
          action={<CsvButton onClick={() => exportToCsv('section-comparison.csv', comparison.data!.sections.map((s) => ({
            section: s.sectionName, present: s.present, absent: s.absent, late: s.late,
            leave: s.leave, 'attendance %': s.attendanceRate,
          })))} />}
        >
          <SimpleTable
            headers={['Section', 'Present', 'Absent', 'Late', 'Leave', 'Attendance %']}
            rows={comparison.data.sections.map((s) => [s.sectionName, s.present, s.absent, s.late, s.leave, `${s.attendanceRate}%`])}
          />
        </Card>
      )}

      <Card
        title={`Low attendance (below ${low.data?.threshold ?? 75}%)`}
        action={low.data && (
          <CsvButton onClick={() => exportToCsv('low-attendance.csv', low.data!.students.map((s) => ({
            student: s.studentName, roll: s.rollNumber ?? '', class: s.className ?? '',
            section: s.sectionName ?? '', 'marked days': s.markedDays, 'attendance %': s.attendanceRate,
          })))} />
        )}
      >
        {low.isError ? (
          <QueryErrorState onRetry={() => low.refetch()} />
        ) : low.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <SimpleTable
            headers={['Student', 'Roll', 'Class', 'Section', 'Marked days', 'Attendance %']}
            rows={(low.data?.students ?? []).map((s) => [
              s.studentName, s.rollNumber, s.className, s.sectionName, s.markedDays, `${s.attendanceRate}%`,
            ])}
          />
        )}
      </Card>

      <Card
        title="Staff attendance"
        action={staff.data && (
          <CsvButton onClick={() => exportToCsv('staff-attendance.csv', staff.data!.staff.map((s) => ({
            staff: s.staffName, present: s.present, absent: s.absent, late: s.late,
            leave: s.leave, 'marked days': s.markedDays, 'attendance %': s.attendanceRate,
          })))} />
        )}
      >
        {staff.isError ? (
          <QueryErrorState onRetry={() => staff.refetch()} />
        ) : staff.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <SimpleTable
            headers={['Staff', 'Present', 'Absent', 'Late', 'Leave', 'Attendance %']}
            rows={(staff.data?.staff ?? []).map((s) => [
              s.staffName, s.present, s.absent, s.late, s.leave, `${s.attendanceRate}%`,
            ])}
          />
        )}
      </Card>
    </div>
  );
}

// ── Exams tab ─────────────────────────────────────────────────────────────────

function ExamsTab() {
  const { data: exams, isLoading: examsLoading } = usePublishedExams();
  const [examTypeId, setExamTypeId] = useState('');
  const effectiveExamId = examTypeId || exams?.[0]?.id || '';
  const summary = useExamSummary(effectiveExamId);
  const comparison = useExamComparison(effectiveExamId);
  const selectedExam = exams?.find((e) => e.id === effectiveExamId);

  if (examsLoading) return <Skeleton className="h-64 w-full" />;
  if (!exams?.length) {
    return <p className="py-10 text-center text-sm text-gray-400">No published exams yet — analytics appear once results are published.</p>;
  }

  return (
    <div className="space-y-6">
      <Select value={effectiveExamId} onValueChange={(v) => setExamTypeId(v ?? '')}>
        <SelectTrigger className="w-64"><span>{selectedExam?.name ?? 'Select exam'}</span></SelectTrigger>
        <SelectContent>
          {exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {summary.isError ? (
        <QueryErrorState onRetry={() => summary.refetch()} />
      ) : summary.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : summary.data ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              ['Students', summary.data.students],
              ['Pass rate', `${summary.data.passRate}%`],
              ['Average %', summary.data.averagePercentage ?? '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-sm border border-stroke bg-white p-4 text-center shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="text-2xl font-bold text-black dark:text-white">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>

          <Card
            title="Per-subject performance"
            action={<CsvButton onClick={() => exportToCsv('exam-subjects.csv', summary.data!.subjects.map((s) => ({
              subject: s.subjectName, appeared: s.appeared, average: s.average ?? '',
              highest: s.highest ?? '', lowest: s.lowest ?? '', 'pass %': s.passRate,
            })))} />}
          >
            <SimpleTable
              headers={['Subject', 'Appeared', 'Average', 'Highest', 'Lowest', 'Pass %']}
              rows={summary.data.subjects.map((s) => [
                s.subjectName, s.appeared, s.average, s.highest, s.lowest, `${s.passRate}%`,
              ])}
            />
          </Card>

          <Card title="Grade distribution">
            {summary.data.gradeDistribution.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No grades recorded.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={summary.data.gradeDistribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="grade" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563EB" name="Students" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {comparison.data && (
            <Card
              title="Class / section comparison"
              action={<CsvButton onClick={() => exportToCsv('exam-comparison.csv', comparison.data!.map((r) => ({
                class: r.className ?? '', section: r.sectionName ?? '', students: r.students,
                'pass %': r.passRate, 'average %': r.averagePercentage ?? '',
              })))} />}
            >
              <SimpleTable
                headers={['Class', 'Section', 'Students', 'Pass %', 'Average %']}
                rows={comparison.data.map((r) => [
                  r.className, r.sectionName, r.students, `${r.passRate}%`, r.averagePercentage,
                ])}
              />
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Fees tab ──────────────────────────────────────────────────────────────────

function FeesTab() {
  const [asOf, setAsOf] = useState('');
  const [classId, setClassId] = useState('');
  const [bucketFilter, setBucketFilter] = useState('');
  const bsYear = useMemo(() => todayBs().year, []);
  const { data: classes } = useClasses();
  const selectedClass = classes?.find((c) => c.id === classId);

  const aging = useFeeAging({ asOf: asOf || undefined, classId: classId || undefined });
  const filteredInvoices =
    aging.data?.invoices.filter((i) => !bucketFilter || i.bucket === bucketFilter) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <BsDateInput label="As of (BS)" value={asOf} onChange={setAsOf} minYear={bsYear - 2} maxYear={bsYear} />
        <Select value={classId || 'all'} onValueChange={(v) => setClassId(!v || v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40"><span>{selectedClass?.name ?? 'All classes'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="pb-2 text-xs text-gray-400">
          Who owes overall lives in the{' '}
          <Link href="/finance/bill/reports" className="text-brand-500 hover:underline">defaulters report</Link>
          {' '}— aging adds how long it has been owed.
        </p>
      </div>

      {aging.isError ? (
        <QueryErrorState onRetry={() => aging.refetch()} />
      ) : aging.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : aging.data ? (
        <>
          <div className="grid grid-cols-5 gap-4">
            {[...aging.data.buckets.map((b) => [b.bucket + ' days', b.amount, b.invoices] as const),
              ['Total', aging.data.totalOutstanding, aging.data.invoices.length] as const].map(([label, amount, count]) => (
              <div key={String(label)} className="rounded-sm border border-stroke bg-white p-4 text-center shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="text-lg font-bold text-black dark:text-white">Rs {amount}</div>
                <div className="text-xs text-gray-500">{label} · {count} inv</div>
              </div>
            ))}
          </div>

          <Card
            title="Aging by class"
            action={<CsvButton onClick={() => exportToCsv('fee-aging-by-class.csv', aging.data!.byClass.map((c) => ({
              class: c.className, '0-30': c['0-30'], '31-60': c['31-60'],
              '61-90': c['61-90'], '90+': c['90+'], total: c.total,
            })))} />}
          >
            <SimpleTable
              headers={['Class', '0–30', '31–60', '61–90', '90+', 'Total']}
              rows={aging.data.byClass.map((c) => [
                c.className, c['0-30'] as number, c['31-60'] as number,
                c['61-90'] as number, c['90+'] as number, c.total,
              ])}
            />
          </Card>

          <Card
            title="Overdue invoices"
            action={
              <div className="flex items-center gap-2">
                <Select value={bucketFilter || 'all'} onValueChange={(v) => setBucketFilter(!v || v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-32"><span>{bucketFilter || 'All buckets'}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All buckets</SelectItem>
                    {['0-30', '31-60', '61-90', '90+'].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
                <CsvButton onClick={() => exportToCsv('fee-aging-invoices.csv', filteredInvoices.map((i) => ({
                  invoice: i.invoiceNumber, student: i.studentName, class: i.className ?? '',
                  section: i.sectionName ?? '', 'due (AD)': i.dueDate,
                  'days past due': i.daysPastDue, bucket: i.bucket, balance: i.balance,
                })))} />
              </div>
            }
          >
            {filteredInvoices.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nothing overdue in this view. 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-2 text-left dark:bg-meta-4">
                    <tr>
                      {['Invoice', 'Student', 'Class', 'Due', 'Days', 'Bucket', 'Balance'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium text-black dark:text-white">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke dark:divide-strokedark">
                    {filteredInvoices.map((i) => (
                      <tr key={i.invoiceId}>
                        <td className="px-3 py-2 font-mono text-xs">{i.invoiceNumber}</td>
                        <td className="px-3 py-2">{i.studentName}</td>
                        <td className="px-3 py-2 text-gray-500">{i.className}{i.sectionName ? ` · ${i.sectionName}` : ''}</td>
                        <td className="px-3 py-2"><BsDate date={i.dueDate} /></td>
                        <td className="px-3 py-2 font-mono">{i.daysPastDue}</td>
                        <td className="px-3 py-2">{i.bucket}</td>
                        <td className="px-3 py-2 font-mono">Rs {i.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const role = useAuthStore((s) => s.user?.role);
  // Backend parity: aging opens to ACCOUNTANT; attendance/exams do not.
  const accountantOnly = role === 'ACCOUNTANT';

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Cross-module analytics — attendance, exams and fees" />
      <Tabs defaultValue={accountantOnly ? 'fees' : 'attendance'}>
        <TabsList>
          {!accountantOnly && <TabsTrigger value="attendance">Attendance</TabsTrigger>}
          {!accountantOnly && <TabsTrigger value="exams">Exams</TabsTrigger>}
          <TabsTrigger value="fees">Fee aging</TabsTrigger>
        </TabsList>
        {!accountantOnly && (
          <TabsContent value="attendance"><AttendanceTab /></TabsContent>
        )}
        {!accountantOnly && (
          <TabsContent value="exams"><ExamsTab /></TabsContent>
        )}
        <TabsContent value="fees"><FeesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
