'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react';
import { useStudents, useClasses } from '@/lib/hooks/use-students';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { StudentActionMenu } from '@/components/students/student-action-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StorageAvatarImage } from '@/components/shared/storage-avatar-image';
import type { StudentSummary } from '@/types/api.types';

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

type SortField = 'first_name' | 'student_id' | 'admission_date';

function SortHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  field: SortField;
  sortBy: string;
  sortOrder: string;
  onSort: (field: SortField) => void;
}) {
  const isActive = sortBy === field;
  return (
    <button
      className="flex items-center gap-1 group text-left font-semibold"
      onClick={() => onSort(field)}
    >
      {label}
      <span className={isActive ? 'text-brand-500' : 'text-gray-300 group-hover:text-gray-400'}>
        {isActive ? (
          sortOrder === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  );
}

export default function StudentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const classId = searchParams.get('classId') ?? '';
  const status = searchParams.get('status') ?? '';
  const gender = searchParams.get('gender') ?? '';
  const sortBy = searchParams.get('sortBy') ?? 'first_name';
  const sortOrder = (searchParams.get('sortOrder') ?? 'asc') as 'asc' | 'desc';

  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: response, isLoading, isError, refetch } = useStudents({
    page,
    limit: 20,
    search: search || undefined,
    classId: classId || undefined,
    status: status || undefined,
    sortBy,
    sortOrder,
  });
  const { data: classes } = useClasses();

  const allStudents = response?.data?.data ?? [];
  const meta = response?.data?.meta;

  // Gender is client-side filtered (API doesn't expose this param)
  const students = gender
    ? allStudents.filter((s) => s.gender === gender)
    : allStudents;

  const activeFilterCount = [search, classId, status, gender].filter(Boolean).length;

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val) params.set(key, val);
      else params.delete(key);
    });
    router.push(`?${params.toString()}`);
  }

  function handleSearch(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ search: value, page: '1' });
    }, 400);
  }

  function handleSort(field: SortField) {
    if (sortBy === field) {
      updateParams({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: '1' });
    } else {
      updateParams({ sortBy: field, sortOrder: 'asc', page: '1' });
    }
  }

  function clearFilters() {
    setSearchInput('');
    router.push('?');
  }

  const columns: ColumnDef<StudentSummary>[] = [
    {
      id: 'photo',
      header: '',
      cell: ({ row }) => (
        <Avatar className="h-8 w-8">
          <StorageAvatarImage value={row.original.photoUrl} />
          <AvatarFallback className="text-xs bg-brand-50 text-brand-500">
            {initials(row.original.fullName)}
          </AvatarFallback>
        </Avatar>
      ),
    },
    {
      accessorKey: 'studentId',
      header: () => (
        <SortHeader
          label="Student ID"
          field="student_id"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
      ),
      cell: ({ getValue }) => (
        <span className="font-mono text-sm text-gray-600">{getValue<string>()}</span>
      ),
    },
    {
      id: 'name',
      header: () => (
        <SortHeader
          label="Full Name"
          field="first_name"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
      ),
      cell: ({ row }) => (
        <Link href={`/students/${row.original.id}`} className="font-medium text-brand-500 hover:underline">
          {row.original.fullName}
        </Link>
      ),
    },
    {
      id: 'class',
      header: 'Class',
      cell: ({ row }) => row.original.className ?? '—',
    },
    {
      id: 'section',
      header: 'Section',
      cell: ({ row }) => row.original.sectionName ?? '—',
    },
    {
      accessorKey: 'gender',
      header: 'Gender',
      cell: ({ getValue }) => {
        const g = getValue<string>();
        return g.charAt(0) + g.slice(1).toLowerCase();
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <StudentActionMenu studentId={row.original.id} />,
    },
  ];

  const filterBar = (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search name or admission no."
          className="h-9 w-56 pl-9 text-sm"
          value={searchInput}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <Select value={classId} onValueChange={(v) => updateParams({ classId: v ?? '', page: '1' })}>
        <SelectTrigger className="h-9 w-36 text-sm">
          <span className={classId ? '' : 'text-muted-foreground'}>
            {classId ? (classes?.find((c) => c.id === classId)?.name ?? 'Loading…') : 'All Classes'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Classes</SelectItem>
          {classes?.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={gender} onValueChange={(v) => updateParams({ gender: v ?? '', page: '1' })}>
        <SelectTrigger className="h-9 w-32 text-sm">
          <span className={gender ? '' : 'text-muted-foreground'}>
            {gender ? gender.charAt(0) + gender.slice(1).toLowerCase() : 'All Gender'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Gender</SelectItem>
          <SelectItem value="MALE">Male</SelectItem>
          <SelectItem value="FEMALE">Female</SelectItem>
          <SelectItem value="OTHER">Other</SelectItem>
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={(v) => updateParams({ status: v ?? '', page: '1' })}>
        <SelectTrigger className="h-9 w-36 text-sm">
          <span className={status ? '' : 'text-muted-foreground'}>
            {status ? status.charAt(0) + status.slice(1).toLowerCase() : 'All Status'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Status</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="INACTIVE">Inactive</SelectItem>
          <SelectItem value="TRANSFERRED">Transferred</SelectItem>
          <SelectItem value="GRADUATED">Graduated</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        description="Manage student admissions and profiles"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={() => router.push('/students/new')}
          >
            + Admit Student
          </Button>
        }
      />

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : (
      <DataTable
        columns={columns}
        data={students}
        isLoading={isLoading}
        filterBar={filterBar}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        exportConfig={{
          filename: 'students',
          getData: () =>
            students.map((s) => ({
              'Student ID': s.studentId,
              'Full Name': s.fullName,
              Class: s.className ?? '',
              Section: s.sectionName ?? '',
              Gender: s.gender,
              Status: s.status,
            })),
        }}
        pagination={
          meta
            ? {
                page,
                limit: meta.limit,
                total: meta.total,
                onPageChange: (p) => updateParams({ page: String(p) }),
              }
            : undefined
        }
      />
      )}
    </div>
  );
}
