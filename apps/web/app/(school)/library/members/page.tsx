'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useLibraryMembers, useRegisterLibraryMember } from '@/lib/hooks/use-library';
import type { LibraryMember } from '@/types/api.types';

export default function LibraryMembersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);

  const [form, setForm] = useState({
    type: 'STUDENT' as 'STUDENT' | 'STAFF',
    referenceId: '',
    maxBooks: '3',
  });

  const { data: response, isLoading } = useLibraryMembers({
    page,
    limit: 20,
    search: search || undefined,
  });

  const registerMember = useRegisterLibraryMember();

  const allMembers = response?.data ?? [];
  const meta = response?.meta;

  // Type and status are client-side filtered
  const members = allMembers.filter((m) => {
    if (typeFilter && m.memberType !== typeFilter) return false;
    if (statusFilter === 'ACTIVE' && !m.isActive) return false;
    if (statusFilter === 'INACTIVE' && m.isActive) return false;
    return true;
  });

  const activeFilterCount = [search, typeFilter, statusFilter].filter(Boolean).length;

  function clearFilters() {
    setSearch('');
    setTypeFilter('');
    setStatusFilter('');
    setPage(1);
  }

  function resetForm() {
    setForm({ type: 'STUDENT', referenceId: '', maxBooks: '3' });
  }

  async function handleRegister() {
    if (!form.referenceId.trim()) {
      toast.error(form.type === 'STUDENT' ? 'Student ID is required' : 'Staff User ID is required');
      return;
    }
    try {
      await registerMember.mutateAsync({
        type: form.type,
        studentId: form.type === 'STUDENT' ? form.referenceId.trim() : undefined,
        userId: form.type === 'STAFF' ? form.referenceId.trim() : undefined,
        maxBooks: parseInt(form.maxBooks, 10) || 3,
      });
      toast.success('Member registered successfully');
      setRegisterOpen(false);
      resetForm();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Failed to register member');
    }
  }

  const columns: ColumnDef<LibraryMember>[] = [
    {
      accessorKey: 'memberNumber',
      header: 'Member No.',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'memberName',
      header: 'Name',
      cell: ({ getValue }) => (
        <span className="font-medium text-black dark:text-white">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'memberType',
      header: 'Type',
      cell: ({ getValue }) => {
        const t = getValue<string>();
        return (
          <Badge className={`text-xs border-0 ${t === 'STAFF' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
            {t}
          </Badge>
        );
      },
    },
    {
      id: 'books',
      header: 'Books',
      cell: ({ row }) => {
        const { currentIssueCount, maxBooks } = row.original;
        return (
          <span className="font-mono text-sm">
            <span className={currentIssueCount > 0 ? 'text-orange-600 font-semibold' : 'text-gray-600'}>
              {currentIssueCount}
            </span>
            <span className="text-gray-400"> / {maxBooks}</span>
          </span>
        );
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ getValue }) => (
        <StatusBadge status={getValue<boolean>() ? 'ACTIVE' : 'INACTIVE'} />
      ),
    },
  ];

  const filterBar = (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search by name or member no."
          className="h-9 w-56 pl-9 text-sm"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v ?? ''); setPage(1); }}>
        <SelectTrigger className="h-9 w-32 text-sm">
          <span className={typeFilter ? '' : 'text-muted-foreground'}>
            {typeFilter ? typeFilter.charAt(0) + typeFilter.slice(1).toLowerCase() : 'All Types'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Types</SelectItem>
          <SelectItem value="STUDENT">Student</SelectItem>
          <SelectItem value="STAFF">Staff</SelectItem>
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ''); setPage(1); }}>
        <SelectTrigger className="h-9 w-32 text-sm">
          <span className={statusFilter ? '' : 'text-muted-foreground'}>
            {statusFilter ? statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase() : 'All Status'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Status</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="INACTIVE">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Library Members"
        description="Registered students and staff who can borrow books"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={() => setRegisterOpen(true)}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Register Member
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={members}
        isLoading={isLoading}
        filterBar={filterBar}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        exportConfig={{
          filename: 'library_members',
          getData: () =>
            members.map((m) => ({
              'Member No.': m.memberNumber,
              Name: m.memberName,
              Type: m.memberType,
              'Current Issues': m.currentIssueCount,
              'Max Books': m.maxBooks,
              Status: m.isActive ? 'Active' : 'Inactive',
            })),
        }}
        pagination={
          meta
            ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage }
            : undefined
        }
      />

      <Dialog open={registerOpen} onOpenChange={(open) => { if (!open) { setRegisterOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Register Library Member</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Member Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as 'STUDENT' | 'STAFF', referenceId: '' }))}
              >
                <SelectTrigger>
                  <span>{form.type === 'STUDENT' ? 'Student' : 'Staff'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT">Student</SelectItem>
                  <SelectItem value="STAFF">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{form.type === 'STUDENT' ? 'Student ID (UUID)' : 'Staff User ID (UUID)'}</Label>
              <Input
                value={form.referenceId}
                onChange={(e) => setForm((f) => ({ ...f, referenceId: e.target.value }))}
                placeholder="Paste the UUID from the student/staff record"
                className="font-mono text-xs"
              />
              <p className="text-xs text-gray-400">
                Find this on the {form.type === 'STUDENT' ? 'student detail' : 'staff detail'} page.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Max Books Allowed</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={form.maxBooks}
                onChange={(e) => setForm((f) => ({ ...f, maxBooks: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setRegisterOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleRegister}
              disabled={registerMember.isPending || !form.referenceId.trim()}
            >
              {registerMember.isPending ? 'Registering…' : 'Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
