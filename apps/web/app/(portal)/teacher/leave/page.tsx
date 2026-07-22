'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  useLeaveTypes,
  useApplyLeave,
  useLeaveBalance,
  useMyLeave,
  useCancelLeave,
} from '@/lib/hooks/use-hr';
import { useAuthStore } from '@/store/auth.store';
import { getErrorDisplay } from '@/lib/errors';
import type { LeaveRequest } from '@/types/api.types';

/**
 * WEB-P Phase 3 Task 2 — teacher's own leave: balance, own past requests,
 * apply, and cancel-own-while-pending. Mirrors the admin leave page's UI
 * conventions (`app/(school)/hr/leave/page.tsx`: DataTable + StatusBadge +
 * BsDate + Tabs, and the async-loaded Select pattern — a <span> inside
 * <SelectTrigger> computed from the data array, never <SelectValue>) but is
 * scoped to a single caller: GET /hr/leave/my (NOT the admin's GET /hr/leave,
 * which returns everyone's requests and is a different, admin-only route —
 * see useMyLeave's doc comment) and no staff-name column, since every row is
 * the caller's own. Reuses useLeaveTypes/useApplyLeave/useLeaveBalance as-is;
 * useMyLeave/useCancelLeave are new (added alongside this page).
 */
export default function TeacherLeavePage() {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('requests');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const [applyForm, setApplyForm] = useState({
    leaveTypeId: '',
    fromDate: '',
    toDate: '',
    reason: '',
  });

  const {
    data: response,
    isLoading,
    isError,
    refetch,
  } = useMyLeave({ page, limit: 20, status: statusFilter || undefined });
  const { data: leaveTypes } = useLeaveTypes();
  const {
    data: balances,
    isLoading: balancesLoading,
    isError: balancesError,
    refetch: refetchBalances,
  } = useLeaveBalance(userId ?? '');

  const applyLeave = useApplyLeave();
  const cancelLeave = useCancelLeave();

  const requests = response?.data ?? [];
  const meta = response?.meta;

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
      // useApplyLeave (the shared, reused-as-is mutation hook) only
      // invalidates the admin list's ['hr','leave'] key — a DIFFERENT query
      // key from this page's ['hr','leave-my'] (see useMyLeave's doc
      // comment), so it never refreshes this table on its own. Invalidate
      // the self-scoped key here instead of touching the shared hook.
      queryClient.invalidateQueries({ queryKey: ['hr', 'leave-my'] });
      setPage(1);
      setTab('requests');
    } catch (err) {
      toast.error(getErrorDisplay(err).message);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Cancel this leave request?')) return;
    try {
      await cancelLeave.mutateAsync(id);
      toast.success('Leave request cancelled');
    } catch (err) {
      toast.error(getErrorDisplay(err).message);
    }
  }

  const columns: ColumnDef<LeaveRequest>[] = [
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
      id: 'reason',
      header: 'Reason',
      cell: ({ row }) => (
        <span className="text-gray-500 dark:text-gray-400">
          {row.original.reason || '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        if (row.original.status !== 'PENDING') return null;
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs text-error-600 border-error-200 hover:bg-error-50"
            onClick={() => handleCancel(row.original.id)}
            disabled={cancelLeave.isPending}
          >
            Cancel
          </Button>
        );
      },
    },
  ];

  const filterBar = (
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
  );

  return (
    <div className="space-y-5">
      <PageHeader title="My Leave" description="Your leave balance, past requests, and applications" />

      {/* Leave balance summary */}
      {balancesLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : balancesError ? (
        <QueryErrorState onRetry={() => refetchBalances()} message="Couldn't load your leave balance." />
      ) : !balances || balances.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
          No leave types configured yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {balances.map((b) => (
            <div
              key={b.leaveTypeId}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <p className="text-sm font-semibold text-gray-800 dark:text-white mb-2">
                {b.leaveTypeName}
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-brand-600 dark:text-brand-400">{b.balance}</span>
                <span className="text-xs text-gray-400">/ {b.entitlement} days left</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{b.used} used</p>
            </div>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="requests">My Requests</TabsTrigger>
          <TabsTrigger value="apply">Apply for Leave</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : (
            <DataTable
              columns={columns}
              data={requests}
              isLoading={isLoading}
              filterBar={filterBar}
              activeFilterCount={statusFilter ? 1 : 0}
              onClearFilters={() => { setStatusFilter(''); setPage(1); }}
              pagination={
                meta ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage } : undefined
              }
            />
          )}
        </TabsContent>

        <TabsContent value="apply" className="mt-4">
          <div className="max-w-lg rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">New Leave Application</h3>

            <div className="space-y-1.5">
              <Label>Leave Type *</Label>
              <Select
                value={applyForm.leaveTypeId || 'NONE'}
                onValueChange={(v) =>
                  setApplyForm((p) => ({ ...p, leaveTypeId: (v ?? '') === 'NONE' ? '' : (v ?? '') }))
                }
              >
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

            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleApplyLeave}
              disabled={applyLeave.isPending}
            >
              {applyLeave.isPending ? 'Submitting…' : 'Submit Application'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
