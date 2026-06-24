'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useLeaveRequests, useReviewLeaveRequest } from '@/lib/hooks/use-attendance';
import type { StudentLeaveRequest } from '@/types/api.types';

const STATUS_LABELS: Record<string, string> = {
  '': 'All Status',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export default function LeaveRequestsPage() {
  // Default to PENDING so deciders land on actionable items; the filter lets
  // them review decided requests too (decided items don't vanish without trace).
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<StudentLeaveRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const { data: response, isLoading } = useLeaveRequests({
    status: statusFilter || undefined,
    page,
    limit: 20,
  });
  const reviewLeave = useReviewLeaveRequest();

  const requests = response?.data ?? [];
  const meta = response?.meta;

  async function handleApprove(req: StudentLeaveRequest) {
    try {
      await reviewLeave.mutateAsync({ id: req.id, data: { status: 'APPROVED' } });
      toast.success(`Leave approved for ${req.studentName ?? 'student'}`);
    } catch {
      toast.error('Failed to approve leave');
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    try {
      await reviewLeave.mutateAsync({
        id: rejectTarget.id,
        data: { status: 'REJECTED', remarks: rejectNote.trim() || undefined },
      });
      toast.success(`Leave rejected for ${rejectTarget.studentName ?? 'student'}`);
      setRejectTarget(null);
      setRejectNote('');
    } catch {
      toast.error('Failed to reject leave');
    }
  }

  const columns: ColumnDef<StudentLeaveRequest>[] = [
    {
      id: 'student',
      header: 'Student',
      cell: ({ row }) => {
        const r = row.original;
        const grade = [r.className, r.sectionName ? `Sec ${r.sectionName}` : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <div className="min-w-0">
            <div className="font-medium text-black dark:text-white">
              {r.studentName ?? '—'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {[r.admissionNumber, grade].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        );
      },
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm">
          <BsDate date={row.original.fromDate} />
          <span className="text-gray-400">→</span>
          <BsDate date={row.original.toDate} />
        </div>
      ),
    },
    {
      id: 'reason',
      header: 'Reason',
      cell: ({ row }) => (
        <span className="block max-w-xs truncate text-gray-600 dark:text-gray-300" title={row.original.reason}>
          {row.original.reason}
        </span>
      ),
    },
    {
      id: 'appliedBy',
      header: 'Applied By',
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">
          {row.original.appliedByName ?? '—'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="space-y-1">
            <StatusBadge status={r.status} />
            {r.status !== 'PENDING' && (r.reviewedByName || r.reviewRemarks) && (
              <div className="text-xs text-gray-400">
                {r.reviewedByName ? `by ${r.reviewedByName}` : ''}
                {r.reviewRemarks ? ` — “${r.reviewRemarks}”` : ''}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        if (row.original.status !== 'PENDING') return null;
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
              onClick={() => handleApprove(row.original)}
              disabled={reviewLeave.isPending}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-error-600 border-error-200 hover:bg-error-50"
              onClick={() => {
                setRejectTarget(row.original);
                setRejectNote('');
              }}
              disabled={reviewLeave.isPending}
            >
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  const filterBar = (
    <Select
      value={statusFilter}
      onValueChange={(v) => {
        setStatusFilter(v ?? '');
        setPage(1);
      }}
    >
      <SelectTrigger className="h-9 w-36 text-sm">
        <span className={statusFilter ? '' : 'text-muted-foreground'}>
          {STATUS_LABELS[statusFilter] ?? 'All Status'}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">All Status</SelectItem>
        <SelectItem value="PENDING">Pending</SelectItem>
        <SelectItem value="APPROVED">Approved</SelectItem>
        <SelectItem value="REJECTED">Rejected</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leave Requests"
        description="Review and decide student leave applications filed by parents and students"
      />

      <DataTable
        columns={columns}
        data={requests}
        isLoading={isLoading}
        filterBar={filterBar}
        activeFilterCount={statusFilter ? 1 : 0}
        onClearFilters={() => {
          setStatusFilter('');
          setPage(1);
        }}
        pagination={
          meta
            ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage }
            : undefined
        }
      />

      {/* Reject with optional note */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
            <DialogDescription>
              {rejectTarget?.studentName
                ? `Rejecting leave for ${rejectTarget.studentName}. You can add an optional note for the applicant.`
                : 'Add an optional note for the applicant.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-1">
            <Label htmlFor="reject-note">Note (optional)</Label>
            <Textarea
              id="reject-note"
              placeholder="e.g. Insufficient notice — please reapply"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={reviewLeave.isPending}>
              Cancel
            </Button>
            <Button
              className="bg-error-600 hover:bg-error-700 text-white"
              onClick={confirmReject}
              disabled={reviewLeave.isPending}
            >
              {reviewLeave.isPending ? 'Rejecting…' : 'Reject Leave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
