'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
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
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { InvoiceStatusBadge } from '@/components/finance/invoice-status-badge';
import {
  useCollectionReport,
  useDefaulters,
  useStudentLedger,
} from '@/lib/hooks/use-finance';
import { useAcademicYears, useCurrentAcademicYear, useStudents } from '@/lib/hooks/use-students';

type Tab = 'collection' | 'defaulters' | 'ledger';

// ── Collection Report Tab ────────────────────────────────────────────────────
function CollectionTab({ academicYearId }: { academicYearId: string }) {
  const { data: report, isLoading } = useCollectionReport(academicYearId);

  if (!academicYearId)
    return <p className="text-sm text-gray-400 mt-6 text-center">Select an academic year to view the report.</p>;

  if (isLoading)
    return (
      <div className="space-y-4 mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 2xl:gap-7.5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-sm" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-sm" />
      </div>
    );

  if (!report) return null;

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 2xl:gap-7.5">
        {[
          { label: 'Total Invoiced', value: report.totalInvoiced, color: 'text-gray-700' },
          { label: 'Collected', value: report.totalCollected, color: 'text-success-600' },
          { label: 'Pending', value: report.totalPending, color: 'text-error-600' },
        ].map((card) => (
          <div key={card.label} className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="p-4 sm:p-6 xl:p-7.5">
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <AmountDisplay amount={card.value} className={`text-base font-bold ${card.color}`} />
            </div>
          </div>
        ))}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="p-4 sm:p-6 xl:p-7.5">
            <p className="text-xs text-gray-500 mb-1">Collection Rate</p>
            <p className="font-mono text-base font-bold text-brand-500">
              {report.collectionRate.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Fiscal year: {report.fiscalYear} · As of: <BsDate date={report.asOf} showAd={false} />
      </p>

      {/* By class */}
      <div>
        <h3 className="text-sm font-semibold text-black dark:text-white mb-2">By Class</h3>
        <div className="rounded-sm border border-stroke dark:border-strokedark overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-2 text-left dark:bg-meta-4">
              <tr>
                {['Class', 'Invoiced', 'Collected', 'Pending', 'Rate'].map((h) => (
                  <th key={h} className={`px-4 py-2.5 font-medium text-black dark:text-white text-left ${h !== 'Class' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke dark:divide-strokedark">
              {report.byClass.map((row) => (
                <tr key={row.classId} className="hover:bg-gray-2 dark:hover:bg-meta-4">
                  <td className="px-4 py-2.5 font-medium text-black dark:text-white">{row.className}</td>
                  <td className="px-4 py-2.5 text-right"><AmountDisplay amount={row.invoiced} /></td>
                  <td className="px-4 py-2.5 text-right text-success-600"><AmountDisplay amount={row.collected} /></td>
                  <td className="px-4 py-2.5 text-right text-error-600"><AmountDisplay amount={row.pending} /></td>
                  <td className="px-4 py-2.5 text-right font-semibold">{row.rate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By category */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">By Category</h3>
        <div className="rounded-sm border border-stroke dark:border-strokedark overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-2 text-left dark:bg-meta-4">
              <tr>
                {['Category', 'Invoiced', 'Collected', 'Pending'].map((h) => (
                  <th key={h} className={`px-4 py-2.5 font-medium text-black dark:text-white text-left ${h !== 'Category' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke dark:divide-strokedark">
              {report.byCategory.map((row) => (
                <tr key={row.categoryId} className="hover:bg-gray-2 dark:hover:bg-meta-4">
                  <td className="px-4 py-2.5 font-medium text-black dark:text-white">{row.categoryName}</td>
                  <td className="px-4 py-2.5 text-right"><AmountDisplay amount={row.invoiced} /></td>
                  <td className="px-4 py-2.5 text-right text-success-600"><AmountDisplay amount={row.collected} /></td>
                  <td className="px-4 py-2.5 text-right text-error-600"><AmountDisplay amount={row.pending} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Defaulters Tab ───────────────────────────────────────────────────────────
function DefaultersTab({ academicYearId }: { academicYearId: string }) {
  const { data: defaulters, isLoading } = useDefaulters(academicYearId);

  if (!academicYearId)
    return <p className="text-sm text-gray-400 mt-6 text-center">Select an academic year.</p>;

  if (isLoading)
    return <Skeleton className="h-48 w-full mt-4" />;

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-gray-500">
          {defaulters?.length ?? 0} student{(defaulters?.length ?? 0) !== 1 ? 's' : ''} with overdue fees
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => console.log('Export defaulters:', defaulters)}
        >
          Export
        </Button>
      </div>

      {!defaulters || defaulters.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No defaulters found.</p>
      ) : (
        <div className="rounded-sm border border-stroke dark:border-strokedark overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-2 text-left dark:bg-meta-4">
              <tr>
                {['Name', 'Admission', 'Class', 'Overdue', 'Total Due', 'Oldest Due', 'Guardian'].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-medium text-black dark:text-white text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke dark:divide-strokedark">
              {defaulters.map((d) => (
                <tr key={d.studentId} className="hover:bg-gray-2 dark:hover:bg-meta-4">
                  <td className="px-3 py-2.5 font-medium text-black dark:text-white">{d.fullName}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{d.admissionNumber}</td>
                  <td className="px-3 py-2.5">{d.className}</td>
                  <td className="px-3 py-2.5 text-error-600 font-medium">{d.overdueInvoices}</td>
                  <td className="px-3 py-2.5"><AmountDisplay amount={d.totalDue} className="text-error-600 font-semibold" /></td>
                  <td className="px-3 py-2.5"><BsDate date={d.oldestDueDate} showAd={false} /></td>
                  <td className="px-3 py-2.5 font-mono text-xs">{d.guardianPhone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Student Ledger Tab ───────────────────────────────────────────────────────
function LedgerTab({ academicYearId }: { academicYearId: string }) {
  const [search, setSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: studentsData } = useStudents({
    search: search || undefined,
    limit: 10,
  });
  const students = studentsData?.data?.data ?? [];

  const { data: ledger, isLoading: ledgerLoading } = useStudentLedger(
    selectedStudentId,
    academicYearId,
  );

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="flex gap-3 items-start flex-wrap">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search student name or admission no."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && students.length > 0 && !selectedStudentId && (
            <div className="absolute top-full left-0 mt-1 z-10 w-full bg-white border border-stroke rounded-sm shadow-default dark:border-strokedark dark:bg-boxdark">
              {students.map((s) => (
                <button
                  key={s.id}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-2 dark:hover:bg-meta-4 first:rounded-t-sm last:rounded-b-sm border-b border-stroke last:border-b-0 dark:border-strokedark"
                  onClick={() => {
                    setSelectedStudentId(s.id);
                    setSearch(s.fullName);
                  }}
                >
                  <span className="font-medium">{s.fullName}</span>
                  <span className="text-gray-400 ml-2 font-mono text-xs">{s.studentId}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedStudentId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setSelectedStudentId(''); setSearch(''); }}
          >
            Clear
          </Button>
        )}
      </div>

      {!selectedStudentId && (
        <p className="text-sm text-gray-400 text-center py-8">
          Search and select a student to view their fee ledger.
        </p>
      )}

      {selectedStudentId && ledgerLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {ledger && (
        <div className="space-y-4">
          {/* Student + summary */}
          <div className="flex flex-wrap gap-6 items-center p-4 rounded-sm border border-stroke bg-gray-2 dark:border-strokedark dark:bg-meta-4">
            <div>
              <p className="font-semibold text-black dark:text-white">{ledger.student.fullName}</p>
              <p className="text-sm text-gray-500">{ledger.student.className} · {ledger.student.admissionNumber}</p>
            </div>
            <div className="flex gap-6">
              {[
                { label: 'Invoiced', value: ledger.summary.totalInvoiced, color: 'text-gray-700' },
                { label: 'Paid', value: ledger.summary.totalPaid, color: 'text-success-600' },
                { label: 'Balance', value: ledger.summary.totalBalance, color: 'text-error-600' },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-gray-400">{item.label}</p>
                  <AmountDisplay amount={item.value} className={`font-bold ${item.color}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Invoice list */}
          <div className="space-y-2">
            {ledger.invoices.map((inv) => (
              <div key={inv.id} className="rounded-sm border border-stroke dark:border-strokedark overflow-hidden">
                <button
                  className="w-full flex justify-between items-center px-4 py-3 hover:bg-gray-2 dark:hover:bg-meta-4 text-left"
                  onClick={() => toggleExpand(inv.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-gray-600">{inv.invoiceNumber}</span>
                    <InvoiceStatusBadge status={inv.status} />
                    <span className="text-sm text-gray-500">Due: <BsDate date={inv.dueDate} showAd={false} /></span>
                  </div>
                  <div className="flex items-center gap-4">
                    <AmountDisplay amount={inv.totalAmount} className="text-sm font-semibold" />
                    <span className="text-gray-400 text-xs">{expandedIds.has(inv.id) ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expandedIds.has(inv.id) && (
                  <div className="border-t px-4 py-3 bg-gray-50 space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Items</p>
                      <div className="space-y-1">
                        {inv.items.map((item) => (
                          <div key={item.id} className="flex justify-between">
                            <span className="text-gray-600">{item.feeCategoryName}</span>
                            <AmountDisplay amount={item.originalAmount} />
                          </div>
                        ))}
                        {inv.discountAmount > 0 && (
                          <div className="flex justify-between text-error-600">
                            <span>Discount</span>
                            <AmountDisplay amount={inv.discountAmount} negative />
                          </div>
                        )}
                      </div>
                    </div>
                    {inv.payments.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Payments</p>
                        <div className="space-y-1">
                          {inv.payments.map((p) => (
                            <div key={p.id} className="flex justify-between">
                              <span className="text-gray-600 font-mono text-xs">{p.paymentNumber} · {p.method}</span>
                              <AmountDisplay amount={p.amount} className="text-success-600" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Reports Page ────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('collection');
  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const [selectedYearId, setSelectedYearId] = useState('');

  const academicYearId = selectedYearId || currentYear?.id || '';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'collection', label: 'Collection Report' },
    { id: 'defaulters', label: 'Defaulters' },
    { id: 'ledger', label: 'Student Ledger' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Finance Reports" description="Collection summary, defaulters, and student ledgers" />

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 border border-stroke rounded-sm p-1 bg-gray-2 dark:border-strokedark dark:bg-meta-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 text-sm rounded-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-white shadow-sm font-medium text-black dark:bg-boxdark dark:text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== 'ledger' && (
          <Select value={academicYearId} onValueChange={(v) => setSelectedYearId(v ?? '')}>
            <SelectTrigger className="w-48">
              <span className={academicYearId ? '' : 'text-muted-foreground'}>
                {academicYearId
                  ? (() => {
                      const y = allYears?.find((y) => y.id === academicYearId);
                      return y ? `${y.name}${y.isCurrent ? ' (Current)' : ''}` : 'Loading…';
                    })()
                  : 'Select academic year'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {allYears?.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name} {y.isCurrent && '(Current)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {activeTab === 'collection' && <CollectionTab academicYearId={academicYearId} />}
      {activeTab === 'defaulters' && <DefaultersTab academicYearId={academicYearId} />}
      {activeTab === 'ledger' && <LedgerTab academicYearId={academicYearId} />}
    </div>
  );
}
