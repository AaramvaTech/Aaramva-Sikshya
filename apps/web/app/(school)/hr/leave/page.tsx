'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useLeaveRequests, useReviewLeave, useApplyLeave, useLeaveTypes } from '@/lib/hooks/use-hr';
import type { LeaveRequest } from '@/types/api.types';

export default function LeavePage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [applyForm, setApplyForm] = useState({
    leaveTypeId: '',
    fromDate: '',
    toDate: '',
    reason: '',
  });

  const { data: response, isLoading } = useLeaveRequests({
    page,
    limit: 20,
    status: statusFilter || undefined,
  });
  const { data: leaveTypes } = useLeaveTypes();
  const reviewLeave = useReviewLeave();
  const applyLeave = useApplyLeave();

  const allRequests = response?.data ?? [];
  const meta = response?.meta;

  // Staff search, leave type, and date range are client-side filtered
  const requests = allRequests.filter((r) => {
    if (staffSearch && !r.staffName.toLowerCase().includes(staffSearch.toLowerCase())) return false;
    if (leaveTypeFilter && r.leaveTypeName !== leaveTypeFilter) return false;
    if (dateFrom && (r.fromDate?.ad ?? '') < dateFrom) return false;
    if (dateTo && (r.toDate?.ad ?? '') > dateTo) return false;
    return true;
  });

  const activeFilterCount = [statusFilter, staffSearch, leaveTypeFilter, dateFrom, dateTo].filter(Boolean).length;

  function clearFilters() {
    setStatusFilter('');
    setStaffSearch('');
    setLeaveTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  async function handleApprove(id: string) {
    try {
      await reviewLeave.mutateAsync({ id, data: { status: 'APPROVED' } });
      toast.success('Leave approved');
    } catch {
      toast.error('Failed to approve leave');
    }
  }

  async function handleReject(id: string) {
    try {
      await reviewLeave.mutateAsync({ id, data: { status: 'REJECTED', reviewerNote: 'Rejected' } });
      toast.success('Leave rejected');
    } catch {
      toast.error('Failed to reject leave');
    }
  }

  async function handleApplyLeave() {
    if (!applyForm.leaveTypeId || !applyForm.fromDate || !applyForm.toDate) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await applyLeave.mutateAsync({
        leaveTypeId: applyForm.leaveTypeId,
        fromDate: applyForm.fromDate,
        toDate: applyForm.toDate,
        reason: applyForm.reason || undefined,
      });
      toast.success('Leave application submitted');
      setApplyForm({ leaveTypeId: '', fromDate: '', toDate: '', reason: '' });
    } catch {
      toast.error('Failed to submit leave application');
    }
  }

  const columns: ColumnDef<LeaveRequest>[] = [
    {
      id: 'staffName',
      header: 'Staff Name',
      cell: ({ row }) => <span className="font-medium text-black dark:text-white">{row.original.staffName}</span>,
    },
    {
      id: 'leaveType',
      header: 'Leave Type',
      cell: ({ row }) => row.original.leaveTypeName,
    },
    {
      id: 'fromDate',
      header: 'From',
      cell: ({ row }) => <BsDate date={row.original.fromDate} />,
    },
    {
      id: 'toDate',
      header: 'To',
      cell: ({ row }) => <BsDate date={row.original.toDate} />,
    },
    {
      accessorKey: 'totalDays',
      header: 'Days',
      cell: ({ getValue }) => <span className="font-mono">{getValue<number>()}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        if (row.original.status !== 'PENDING') return null;
        return (
          <div className="flex gap-2">
            <Button size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApprove(row.original.id)} disabled={reviewLeave.isPending}>
              Approve
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-error-600 border-error-200 hover:bg-error-50" onClick={() => handleReject(row.original.id)} disabled={reviewLeave.isPending}>
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  const leaveTypeNames = [...new Set(allRequests.map((r) => r.leaveTypeName))];

  const filterBar = (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search staff name..."
          className="h-9 w-48 pl-9 text-sm"
          value={staffSearch}
          onChange={(e) => setStaffSearch(e.target.value)}
        />
      </div>

      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ''); setPage(1); }}>
        <SelectTrigger className="h-9 w-32 text-sm">
          <span className={statusFilter ? '' : 'text-muted-foreground'}>
            {statusFilter ? statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase() : 'All Status'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Status</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="APPROVED">Approved</SelectItem>
          <SelectItem value="REJECTED">Rejected</SelectItem>
          <SelectItem value="CANCELLED">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      <Select value={leaveTypeFilter} onValueChange={(v) => { setLeaveTypeFilter(v ?? ''); setPage(1); }}>
        <SelectTrigger className="h-9 w-36 text-sm">
          <span className={leaveTypeFilter ? '' : 'text-muted-foreground'}>
            {leaveTypeFilter || 'All Leave Types'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Leave Types</SelectItem>
          {leaveTypeNames.map((name) => (
            <SelectItem key={name} value={name}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 shrink-0">Date:</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Leave Management" description="Review and manage staff leave requests" />

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">All Requests</TabsTrigger>
          <TabsTrigger value="apply">Apply for Leave</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <DataTable
            columns={columns}
            data={requests}
            isLoading={isLoading}
            filterBar={filterBar}
            activeFilterCount={activeFilterCount}
            onClearFilters={clearFilters}
            exportConfig={{
              filename: 'leave_requests',
              getData: () =>
                requests.map((r) => ({
                  'Staff Name': r.staffName,
                  'Leave Type': r.leaveTypeName,
                  'From Date': r.fromDate?.bs ?? '',
                  'To Date': r.toDate?.bs ?? '',
                  Days: r.totalDays,
                  Status: r.status,
                })),
            }}
            pagination={
              meta && !staffSearch && !leaveTypeFilter && !dateFrom && !dateTo
                ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage }
                : undefined
            }
          />
        </TabsContent>

        <TabsContent value="apply" className="mt-4">
          <div className="max-w-lg rounded-sm border border-stroke bg-white dark:border-strokedark dark:bg-boxdark p-6 space-y-4">
            <h3 className="text-sm font-semibold text-black dark:text-white">New Leave Application</h3>

            <div className="space-y-1.5">
              <Label>Leave Type *</Label>
              <Select value={applyForm.leaveTypeId || 'NONE'} onValueChange={(v) => setApplyForm((p) => ({ ...p, leaveTypeId: (v ?? '') === 'NONE' ? '' : (v ?? '') }))}>
                <SelectTrigger>
                  <span className="truncate">
                    {leaveTypes?.find((lt) => lt.id === applyForm.leaveTypeId)?.name ?? 'Select leave type'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Select leave type</SelectItem>
                  {leaveTypes?.map((lt) => (
                    <SelectItem key={lt.id} value={lt.id}>
                      {lt.name} ({lt.daysPerYear} days/year)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="from-date">From Date *</Label>
                <input
                  id="from-date"
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={applyForm.fromDate}
                  onChange={(e) => setApplyForm((p) => ({ ...p, fromDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to-date">To Date *</Label>
                <input
                  id="to-date"
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={applyForm.toDate}
                  onChange={(e) => setApplyForm((p) => ({ ...p, toDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leave-reason">Reason</Label>
              <Textarea
                id="leave-reason"
                placeholder="Optional reason for leave..."
                value={applyForm.reason}
                onChange={(e) => setApplyForm((p) => ({ ...p, reason: e.target.value }))}
                rows={3}
              />
            </div>

            <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleApplyLeave} disabled={applyLeave.isPending}>
              {applyLeave.isPending ? 'Submitting…' : 'Submit Application'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
