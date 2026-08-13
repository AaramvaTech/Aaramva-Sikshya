'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { DataTable } from '@/components/shared/data-table';
import { BsDate } from '@/components/shared/bs-date';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { ColumnDef } from '@tanstack/react-table';
import { useClasses } from '@/lib/hooks/use-academic';
import { useStudents, useAcademicYears, useCurrentAcademicYear } from '@/lib/hooks/use-students';
import { useDiscountReasons } from '@/lib/hooks/use-bill-catalog';
import {
  useDaybook,
  useFinanceDefaulters,
  useCollectionSummary,
  useFines,
  useFeeAging,
} from '@/lib/hooks/use-reports';
import { useConcessionRegister } from '@/lib/hooks/use-bill-assignment';
import { useStudentStatement, useBillPayments } from '@/lib/hooks/use-bill-payment';
import { useCashierShifts, useOpenShift, useCloseShift } from '@/lib/hooks/use-cashier';
import { exportToCsv } from '@/lib/export';
import { todayBs } from 'bs-calendar';
import type { ConcessionRegisterEntry, CashierShift } from '@/types/api.types';

/**
 * UI-6 §4 — one page, eight tabs. Directly modeled on `app/(school)/reports/
 * page.tsx` (REP-1): local Card/SimpleTable/CsvButton (copied, not imported —
 * REP-1's are page-local, §4.1), <Tabs>, <BsDateInput>/<BsDate>,
 * <QueryErrorState>, <Skeleton>. Six listing-report tabs share one filter-bar
 * shape; Statement and Cashier are visually separated (§4.2, ruling 3) and
 * use a different, search-then-render / workflow shape instead.
 */

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

function StatRow({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} className="rounded-sm border border-stroke bg-white p-4 text-center shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="text-lg font-bold text-black dark:text-white">{it.value}</div>
          <div className="text-xs text-gray-500">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ── Daybook tab (§4.3) ──────────────────────────────────────────────────────

function DaybookTab() {
  const [bsDate, setBsDate] = useState('');
  const daybook = useDaybook({ bsDate: bsDate || undefined });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <BsDateInput label="Date (BS)" value={bsDate} onChange={setBsDate} minYear={todayBs().year - 2} maxYear={todayBs().year} />
      </div>

      {daybook.isError ? (
        <QueryErrorState onRetry={() => daybook.refetch()} />
      ) : daybook.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : daybook.data ? (
        <>
          <StatRow
            items={[
              { label: 'Invoiced', value: `Rs ${daybook.data.totals.totalInvoiced}` },
              { label: 'Collected', value: `Rs ${daybook.data.totals.totalCollected}` },
              { label: 'Refunded', value: `Rs ${daybook.data.totals.totalRefunded}` },
              { label: 'Net movement', value: `Rs ${daybook.data.totals.netMovement}` },
            ]}
          />

          <Card title="By method">
            <SimpleTable
              headers={['Method', 'Total']}
              rows={daybook.data.byMethod.map((m) => [m.method, `Rs ${m.total}`])}
            />
          </Card>

          <Card
            title="Entries"
            action={<CsvButton onClick={() => exportToCsv('daybook-entries.csv', daybook.data!.entries.map((e) => ({
              time: timeOfDay(e.time), type: e.entryType, student: e.studentName, admission: e.admissionNumber,
              debit: e.debit, credit: e.credit, invoice: e.invoiceNumber ?? '', method: e.paymentMethod ?? '',
              receipt: e.receiptNumber ?? '', narration: e.narration ?? '',
            })))} />}
          >
            <SimpleTable
              headers={['Time', 'Type', 'Student', 'Debit', 'Credit', 'Ref', 'Narration']}
              rows={daybook.data.entries.map((e) => [
                timeOfDay(e.time), e.entryType, `${e.studentName} (${e.admissionNumber})`,
                e.debit ? `Rs ${e.debit}` : '', e.credit ? `Rs ${e.credit}` : '',
                e.invoiceNumber ?? e.receiptNumber ?? '', e.narration,
              ])}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ── Defaulters tab (§4.4) ───────────────────────────────────────────────────

function DefaultersTab() {
  const [classId, setClassId] = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [sort, setSort] = useState<'balance' | 'class' | 'oldest'>('balance');
  const { data: classes } = useClasses();
  const selectedClass = classes?.find((c) => c.id === classId);

  const defaulters = useFinanceDefaulters({ classId: classId || undefined, minBalance: minBalance || undefined, sort });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={classId || 'all'} onValueChange={(v) => setClassId(!v || v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40"><span>{selectedClass?.name ?? 'All classes'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Min balance</label>
          <Input type="number" min="0" className="w-32" value={minBalance} onChange={(e) => setMinBalance(e.target.value)} />
        </div>
        <Select value={sort} onValueChange={(v) => setSort((v as typeof sort) || 'balance')}>
          <SelectTrigger className="w-40"><span>Sort: {sort}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="balance">Balance</SelectItem>
            <SelectItem value="class">Class</SelectItem>
            <SelectItem value="oldest">Oldest due</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {defaulters.isError ? (
        <QueryErrorState onRetry={() => defaulters.refetch()} />
      ) : defaulters.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : defaulters.data ? (
        <>
          <StatRow
            items={[
              { label: 'Defaulters', value: defaulters.data.totalDefaulters },
              { label: 'Total outstanding', value: `Rs ${defaulters.data.totalOutstanding}` },
            ]}
          />
          <Card
            title="Students"
            action={<CsvButton onClick={() => exportToCsv('defaulters.csv', defaulters.data!.students.map((s) => ({
              student: s.fullName, admission: s.admissionNumber, class: s.className ?? '', section: s.sectionName ?? '',
              balance: s.balance, 'overdue invoices': s.overdueInvoices, 'oldest due': s.oldestDueDate ?? '',
            })))} />}
          >
            <SimpleTable
              headers={['Student', 'Class', 'Balance', 'Overdue Invoices', 'Oldest Due']}
              rows={defaulters.data.students.map((s) => [
                `${s.fullName} (${s.admissionNumber})`,
                s.className ? `${s.className}${s.sectionName ? ` · ${s.sectionName}` : ''}` : '—',
                `Rs ${s.balance}`, s.overdueInvoices,
                s.oldestDueDate ? <BsDate key={s.studentId} date={s.oldestDueDate} /> as unknown as string : null,
              ])}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ── Aging tab (§4.5 — genuine duplicate of /reports's Fees tab, ruling 1) ──

function AgingAmountAndBucketTable({ aging }: { aging: ReturnType<typeof useFeeAging> }) {
  const [bucketFilter, setBucketFilter] = useState('');
  if (!aging.data) return null;
  const filteredInvoices = aging.data.invoices.filter((i) => !bucketFilter || i.bucket === bucketFilter);
  return (
    <>
      <StatRow
        items={[
          ...aging.data.buckets.map((b) => ({ label: `${b.bucket} days (${b.invoices} inv)`, value: `Rs ${b.amount}` })),
          { label: `Total (${aging.data.invoices.length} inv)`, value: `Rs ${aging.data.totalOutstanding}` },
        ]}
      />

      <Card
        title="Aging by class"
        action={<CsvButton onClick={() => exportToCsv('fee-aging-by-class.csv', aging.data!.byClass.map((c) => ({
          class: c.className, '0-30': c['0-30'], '31-60': c['31-60'], '61-90': c['61-90'], '90+': c['90+'], total: c.total,
        })))} />}
      >
        <SimpleTable
          headers={['Class', '0–30', '31–60', '61–90', '90+', 'Total']}
          rows={aging.data.byClass.map((c) => [
            c.className, c['0-30'] as number, c['31-60'] as number, c['61-90'] as number, c['90+'] as number, c.total,
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
              invoice: i.invoiceNumber, student: i.studentName, class: i.className ?? '', 'due (AD)': i.dueDate,
              'days past due': i.daysPastDue, bucket: i.bucket, balance: i.balance,
            })))} />
          </div>
        }
      >
        {filteredInvoices.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Nothing overdue in this view.</p>
        ) : (
          <SimpleTable
            headers={['Invoice', 'Student', 'Class', 'Due', 'Days', 'Bucket', 'Balance']}
            rows={filteredInvoices.map((i) => [
              i.invoiceNumber, i.studentName, i.className ?? '—', i.dueDate, i.daysPastDue, i.bucket, `Rs ${i.balance}`,
            ])}
          />
        )}
      </Card>
    </>
  );
}

function AgingTab() {
  const [asOf, setAsOf] = useState('');
  const [classId, setClassId] = useState('');
  const { data: classes } = useClasses();
  const selectedClass = classes?.find((c) => c.id === classId);
  // Same query key/cache as /reports's Fees tab — this is the genuine
  // duplication ruling 1 asked for, not a second independent fetch.
  const aging = useFeeAging({ asOf: asOf || undefined, classId: classId || undefined });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <BsDateInput label="As of (BS)" value={asOf} onChange={setAsOf} minYear={todayBs().year - 2} maxYear={todayBs().year} />
        <Select value={classId || 'all'} onValueChange={(v) => setClassId(!v || v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40"><span>{selectedClass?.name ?? 'All classes'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {aging.isError ? (
        <QueryErrorState onRetry={() => aging.refetch()} />
      ) : aging.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <AgingAmountAndBucketTable aging={aging} />
      )}
    </div>
  );
}

// ── Collection tab (§4.6) ───────────────────────────────────────────────────

function CollectionTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [groupBy, setGroupBy] = useState<'method' | 'feehead'>('method');
  const bsYear = useMemo(() => todayBs().year, []);

  const collection = useCollectionSummary({ from: from || undefined, to: to || undefined, groupBy });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <BsDateInput label="From (BS)" value={from} onChange={setFrom} minYear={bsYear - 2} maxYear={bsYear} />
        <BsDateInput label="To (BS)" value={to} onChange={setTo} minYear={bsYear - 2} maxYear={bsYear} />
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v === 'feehead' ? 'feehead' : 'method')}>
          <SelectTrigger className="w-40"><span>{groupBy === 'feehead' ? 'By fee head' : 'By method'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="method">By method</SelectItem>
            <SelectItem value="feehead">By fee head</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {collection.isError ? (
        <QueryErrorState onRetry={() => collection.refetch()} />
      ) : collection.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : collection.data ? (
        <>
          <StatRow items={[{ label: 'Total collected', value: `Rs ${collection.data.totalCollected}` }]} />
          <Card
            title="Breakdown"
            action={<CsvButton onClick={() => exportToCsv('collection-breakdown.csv', collection.data!.breakdown.map((b) => ({
              label: b.label, total: b.total, count: b.count ?? '',
            })))} />}
          >
            <SimpleTable
              headers={groupBy === 'method' ? ['Method', 'Total', 'Count'] : ['Fee head', 'Total']}
              rows={collection.data.breakdown.map((b) =>
                groupBy === 'method' ? [b.label, `Rs ${b.total}`, b.count ?? 0] : [b.label, `Rs ${b.total}`],
              )}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ── Fines tab (§4.7) ────────────────────────────────────────────────────────

function FinesTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [classId, setClassId] = useState('');
  const bsYear = useMemo(() => todayBs().year, []);
  const { data: classes } = useClasses();
  const selectedClass = classes?.find((c) => c.id === classId);

  const fines = useFines({ from: from || undefined, to: to || undefined, classId: classId || undefined });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <BsDateInput label="From (BS)" value={from} onChange={setFrom} minYear={bsYear - 2} maxYear={bsYear} />
        <BsDateInput label="To (BS)" value={to} onChange={setTo} minYear={bsYear - 2} maxYear={bsYear} />
        <Select value={classId || 'all'} onValueChange={(v) => setClassId(!v || v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40"><span>{selectedClass?.name ?? 'All classes'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {fines.isError ? (
        <QueryErrorState onRetry={() => fines.refetch()} />
      ) : fines.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : fines.data ? (
        <>
          <StatRow items={[{ label: 'Accruals', value: fines.data.count }, { label: 'Total fined (net of reversals)', value: `Rs ${fines.data.totalFined}` }]} />
          <Card
            title="Accruals"
            action={<CsvButton onClick={() => exportToCsv('fines.csv', fines.data!.accruals.map((a) => ({
              student: a.fullName, admission: a.admissionNumber, invoice: a.invoiceNumber, 'accrued through': a.accruedThrough,
              'days overdue': a.daysOverdue, amount: a.amount, reversed: a.reversed ? 'yes' : 'no',
            })))} />}
          >
            {fines.data.accruals.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No fine accruals in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-2 text-left dark:bg-meta-4">
                    <tr>
                      {['Student', 'Invoice', 'Accrued through', 'Days overdue', 'Amount', ''].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium text-black dark:text-white">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke dark:divide-strokedark">
                    {fines.data.accruals.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2">{a.fullName} ({a.admissionNumber})</td>
                        <td className="px-3 py-2 font-mono text-xs">{a.invoiceNumber}</td>
                        <td className="px-3 py-2"><BsDate date={a.accruedThrough} /></td>
                        <td className="px-3 py-2 font-mono">{a.daysOverdue}</td>
                        <td className="px-3 py-2 font-mono">Rs {a.amount}</td>
                        <td className="px-3 py-2">
                          {a.reversed && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-meta-4">Reversed</span>
                          )}
                        </td>
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

// ── Concession Register tab (§4.8 — the one paginated tab) ─────────────────

function ConcessionRegisterTab() {
  const [page, setPage] = useState(1);
  const [classId, setClassId] = useState('');
  const [discountReasonId, setDiscountReasonId] = useState('');
  const { data: classes } = useClasses();
  const { data: reasons } = useDiscountReasons();
  const selectedClass = classes?.find((c) => c.id === classId);
  const selectedReason = reasons?.find((r) => r.id === discountReasonId);

  const register = useConcessionRegister({
    page, limit: 20, classId: classId || undefined, discountReasonId: discountReasonId || undefined,
  });

  const columns: ColumnDef<ConcessionRegisterEntry>[] = [
    { accessorKey: 'studentName', header: 'Student', cell: ({ row }) => `${row.original.studentName} (${row.original.studentAdmissionNumber})` },
    { accessorKey: 'className', header: 'Class', cell: ({ row }) => row.original.className ?? '—' },
    { accessorKey: 'feeHeadName', header: 'Fee head', cell: ({ row }) => row.original.feeHeadName ?? 'Whole bill' },
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'value', header: 'Value', cell: ({ row }) => (row.original.type === 'PERCENT' ? `${row.original.value}%` : `Rs ${row.original.value}`) },
    { accessorKey: 'capAmount', header: 'Cap', cell: ({ row }) => (row.original.capAmount != null ? `Rs ${row.original.capAmount}` : '—') },
    { accessorKey: 'discountReasonName', header: 'Reason' },
    { accessorKey: 'appliedBy', header: 'Applied by' },
    { accessorKey: 'appliedAt', header: 'Applied at', cell: ({ row }) => <BsDate date={row.original.appliedAt.slice(0, 10)} /> },
    {
      accessorKey: 'effectiveFrom',
      header: 'Effective range',
      cell: ({ row }) => (
        <span>
          <BsDate date={row.original.effectiveFrom} />
          {row.original.effectiveTo ? <> – <BsDate date={row.original.effectiveTo} /></> : ' – ongoing'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={classId || 'all'} onValueChange={(v) => { setClassId(!v || v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-40"><span>{selectedClass?.name ?? 'All classes'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={discountReasonId || 'all'} onValueChange={(v) => { setDiscountReasonId(!v || v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-48"><span>{selectedReason?.name ?? 'All reasons'}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasons</SelectItem>
            {reasons?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {register.isError ? (
        <QueryErrorState onRetry={() => register.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={register.data?.data ?? []}
          isLoading={register.isLoading}
          pagination={register.data ? { page, limit: 20, total: register.data.meta.total, onPageChange: setPage } : undefined}
          exportConfig={{
            filename: 'concession-register.csv',
            getData: () => (register.data?.data ?? []).map((r) => ({
              student: r.studentName, admission: r.studentAdmissionNumber, class: r.className ?? '',
              feeHead: r.feeHeadName ?? 'Whole bill', type: r.type, value: r.value, cap: r.capAmount ?? '',
              reason: r.discountReasonName, appliedBy: r.appliedBy, appliedAt: r.appliedAt,
              effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo ?? '',
            })),
          }}
        />
      )}
    </div>
  );
}

// ── Student Statement tab (§4.9 — search-then-render, old-rail LedgerTab shape) ──

function StatementTab() {
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const bsYear = useMemo(() => todayBs().year, []);

  const { data: studentsData } = useStudents({ search: search || undefined, limit: 10 }, { enabled: !!search && !studentId });
  const matches = studentsData?.data?.data ?? [];

  const statement = useStudentStatement(studentId || null, { from: from || undefined, to: to || undefined });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="relative w-72">
          <Input
            placeholder="Search student name or admission no."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setStudentId(''); }}
          />
          {search && matches.length > 0 && !studentId && (
            <div className="absolute top-full left-0 z-10 mt-1 w-full rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              {matches.map((s) => (
                <button
                  key={s.id}
                  className="block w-full border-b border-stroke px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
                  onClick={() => { setStudentId(s.id); setSearch(s.fullName); }}
                >
                  <span className="font-medium">{s.fullName}</span>
                  <span className="ml-2 font-mono text-xs text-gray-400">{s.studentId}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {studentId && (
          <>
            <BsDateInput label="From (BS)" value={from} onChange={setFrom} minYear={bsYear - 2} maxYear={bsYear} />
            <BsDateInput label="To (BS)" value={to} onChange={setTo} minYear={bsYear - 2} maxYear={bsYear} />
            <Button variant="outline" size="sm" onClick={() => { setStudentId(''); setSearch(''); setFrom(''); setTo(''); }}>Clear</Button>
          </>
        )}
      </div>

      {!studentId && <p className="py-8 text-center text-sm text-gray-400">Search and select a student to view their statement.</p>}

      {studentId && statement.isError && <QueryErrorState onRetry={() => statement.refetch()} />}
      {studentId && statement.isLoading && <Skeleton className="h-64 w-full" />}

      {statement.data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-6 rounded-sm border border-stroke bg-gray-2 p-4 dark:border-strokedark dark:bg-meta-4">
            <div>
              <p className="font-semibold text-black dark:text-white">{statement.data.student.fullName}</p>
              <p className="text-sm text-gray-500">{statement.data.student.className ?? '—'} · {statement.data.student.admissionNumber}</p>
            </div>
            <div className="flex gap-6">
              {[
                ['Opening', statement.data.openingBalance],
                ['Closing', statement.data.closingBalance],
                ['Advance credit', statement.data.advanceCredit],
                ['Debit', statement.data.totalDebit],
                ['Credit', statement.data.totalCredit],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-mono font-bold text-black dark:text-white">Rs {value}</p>
                </div>
              ))}
            </div>
          </div>

          <Card
            title="Entries"
            action={<CsvButton onClick={() => exportToCsv('student-statement.csv', statement.data!.entries.map((e) => ({
              date: e.entryDate, type: e.entryType, debit: e.debit, credit: e.credit,
              runningBalance: e.runningBalance ?? '', narration: e.narration ?? '',
            })))} />}
          >
            <SimpleTable
              headers={['Date', 'Type', 'Debit', 'Credit', 'Running balance', 'Narration']}
              rows={statement.data.entries.map((e) => [
                e.entryDate, e.entryType, e.debit ? `Rs ${e.debit}` : '', e.credit ? `Rs ${e.credit}` : '',
                e.runningBalance != null ? `Rs ${e.runningBalance}` : '', e.narration,
              ])}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Cashier tab (§4.10 — the one write action) ──────────────────────────────

function ShiftPaymentsDrilldown({ shift }: { shift: CashierShift }) {
  const payments = useBillPayments({
    receivedBy: shift.cashierUserId,
    dateFrom: shift.openedAt.slice(0, 10),
    dateTo: (shift.closedAt ?? shift.openedAt).slice(0, 10),
    limit: 100,
  });
  if (payments.isLoading) return <Skeleton className="h-24 w-full" />;
  const rows = (payments.data?.data ?? []).filter((p) => p.status === 'CLEARED');
  if (rows.length === 0) return <p className="px-3 py-4 text-sm text-gray-400">No cleared payments found for this shift window.</p>;
  return (
    <div className="border-t border-stroke bg-gray-2 px-3 py-3 dark:border-strokedark dark:bg-meta-4">
      <SimpleTable
        headers={['Receipt', 'Method', 'Amount', 'Received']}
        rows={rows.map((p) => [p.receiptNumber, p.method, `Rs ${p.amount}`, p.receivedDate])}
      />
    </div>
  );
}

export function CashierTab() {
  const { data: currentYear } = useCurrentAcademicYear();
  const [openingFloat, setOpeningFloat] = useState('');
  const [openNotes, setOpenNotes] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const shifts = useCashierShifts();
  const openShiftMutation = useOpenShift();
  const closeShiftMutation = useCloseShift();
  const [closeResult, setCloseResult] = useState<Awaited<ReturnType<typeof closeShiftMutation.mutateAsync>>['data']['data'] | null>(null);

  const myOpenShift = shifts.data?.find((s) => s.status === 'OPEN');

  function handleOpen() {
    if (!currentYear?.id || !openingFloat) return;
    openShiftMutation.mutate({ academicYearId: currentYear.id, openingFloat, notes: openNotes || undefined }, {
      onSuccess: () => { setOpeningFloat(''); setOpenNotes(''); },
    });
  }

  function handleClose() {
    if (!myOpenShift || !countedCash) return;
    closeShiftMutation.mutate(
      { id: myOpenShift.id, data: { countedCash, notes: closeNotes || undefined } },
      {
        onSuccess: (res) => { setCloseResult(res.data.data); setCountedCash(''); setCloseNotes(''); },
      },
    );
  }

  return (
    <div className="space-y-6">
      <Card title={myOpenShift ? 'Close shift' : 'Open shift'}>
        {shifts.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : myOpenShift ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Opened <BsDate date={myOpenShift.openedAt.slice(0, 10)} /> · opening float Rs {myOpenShift.openingFloat}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Counted cash</label>
                <Input type="number" min="0" step="0.01" className="w-40" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
              </div>
              <div className="w-64">
                <label className="mb-1 block text-xs text-gray-500">Notes (optional)</label>
                <Textarea rows={1} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
              </div>
              <Button onClick={handleClose} disabled={!countedCash || closeShiftMutation.isPending}>
                {closeShiftMutation.isPending ? 'Closing…' : 'Close shift'}
              </Button>
            </div>
            {closeResult && (
              <div className={`rounded-sm border p-4 text-sm ${closeResult.variance === 0 ? 'border-success-300 bg-success-50' : 'border-warning-300 bg-warning-50'}`}>
                <p>Expected cash: Rs {closeResult.expectedCash} · Counted: Rs {closeResult.countedCash}</p>
                <p className="font-semibold">
                  Variance: Rs {closeResult.variance} {closeResult.variance === 0 ? '(exact match)' : closeResult.variance > 0 ? '(over)' : '(short)'}
                </p>
                <SimpleTable headers={['Method', 'Total', 'Count']} rows={closeResult.byMethod.map((m) => [m.method, `Rs ${m.total}`, m.count])} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Academic year</label>
              <Input value={currentYear?.name ?? 'Loading…'} disabled className="w-40" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Opening float</label>
              <Input type="number" min="0" step="0.01" className="w-40" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
            </div>
            <div className="w-64">
              <label className="mb-1 block text-xs text-gray-500">Notes (optional)</label>
              <Textarea rows={1} value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} />
            </div>
            <Button onClick={handleOpen} disabled={!openingFloat || !currentYear?.id || openShiftMutation.isPending}>
              {openShiftMutation.isPending ? 'Opening…' : 'Open shift'}
            </Button>
          </div>
        )}
      </Card>

      <Card title="Shift history">
        {shifts.isError ? (
          <QueryErrorState onRetry={() => shifts.refetch()} />
        ) : shifts.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !shifts.data?.length ? (
          <p className="py-6 text-center text-sm text-gray-400">No shifts yet.</p>
        ) : (
          <div className="space-y-2">
            {shifts.data.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-sm border border-stroke dark:border-strokedark">
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-2 dark:hover:bg-meta-4"
                  onClick={() => s.status === 'CLOSED' && setExpandedId(expandedId === s.id ? null : s.id)}
                  disabled={s.status !== 'CLOSED'}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-black dark:text-white">{s.cashierName}</span>
                    <span className="text-gray-500"><BsDate date={s.openedAt.slice(0, 10)} /></span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === 'OPEN' ? 'bg-success-50 text-success-600' : 'bg-gray-100 text-gray-500 dark:bg-meta-4'}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>Opening Rs {s.openingFloat}</span>
                    {s.variance != null && <span className={s.variance === 0 ? 'text-success-600' : 'text-warning-600'}>Variance Rs {s.variance}</span>}
                    {s.status === 'CLOSED' && <span className="text-gray-400 text-xs">{expandedId === s.id ? '▲' : '▼'}</span>}
                  </div>
                </button>
                {expandedId === s.id && <ShiftPaymentsDrilldown shift={s} />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

// UI-6 §4.2/ruling 3 — the six filterable listing reports, kept as one group
// visually separated from the two workflow tabs (Statement, Cashier) below.
export const LISTING_TABS = [
  { value: 'daybook', label: 'Daybook' },
  { value: 'defaulters', label: 'Defaulters' },
  { value: 'aging', label: 'Aging' },
  { value: 'collection', label: 'Collection' },
  { value: 'fines', label: 'Fines' },
  { value: 'concessions', label: 'Concession Register' },
] as const;

export default function BillingReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Billing rail reporting — collections, defaulters, aging, and cashier reconciliation" />
      <Tabs defaultValue="daybook">
        <TabsList className="h-auto flex-wrap gap-1">
          {LISTING_TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          <Separator orientation="vertical" className="mx-1 h-6 self-center" />
          <TabsTrigger value="statement" className="text-muted-foreground data-[state=active]:text-foreground">Statement</TabsTrigger>
          <TabsTrigger value="cashier" className="text-muted-foreground data-[state=active]:text-foreground">Cashier</TabsTrigger>
        </TabsList>
        <TabsContent value="daybook"><DaybookTab /></TabsContent>
        <TabsContent value="defaulters"><DefaultersTab /></TabsContent>
        <TabsContent value="aging"><AgingTab /></TabsContent>
        <TabsContent value="collection"><CollectionTab /></TabsContent>
        <TabsContent value="fines"><FinesTab /></TabsContent>
        <TabsContent value="concessions"><ConcessionRegisterTab /></TabsContent>
        <TabsContent value="statement"><StatementTab /></TabsContent>
        <TabsContent value="cashier"><CashierTab /></TabsContent>
      </Tabs>
    </div>
  );
}
