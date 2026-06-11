'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { useStudents, useClasses } from '@/lib/hooks/use-students';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { StudentActionMenu } from '@/components/students/student-action-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { StudentSummary } from '@/types/api.types';

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function StudentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const classId = searchParams.get('classId') ?? '';
  const status = searchParams.get('status') ?? '';

  // Local input state for immediate feedback; URL update is debounced
  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: response, isLoading } = useStudents({
    page,
    limit: 20,
    search: search || undefined,
    classId: classId || undefined,
    status: status || undefined,
  });

  const { data: classes } = useClasses();

  const students = response?.data?.data ?? [];
  const meta = response?.data?.meta;

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

  const columns: ColumnDef<StudentSummary>[] = [
    {
      id: 'photo',
      header: 'Photo',
      cell: ({ row }) => (
        <Avatar className="h-8 w-8">
          <AvatarImage src={row.original.photoUrl ?? undefined} />
          <AvatarFallback className="text-xs bg-brand-50 text-brand-500">
            {initials(row.original.fullName)}
          </AvatarFallback>
        </Avatar>
      ),
    },
    {
      accessorKey: 'studentId',
      header: 'Student ID',
      cell: ({ getValue }) => (
        <span className="font-mono text-sm text-gray-600">{getValue<string>()}</span>
      ),
    },
    {
      id: 'name',
      header: 'Full Name',
      cell: ({ row }) => (
        <Link
          href={`/students/${row.original.id}`}
          className="font-medium text-brand-500 hover:underline"
        >
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

  return (
    <div>
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

      {/* TailAdmin card wrapper for filters + table */}
      <div className="rounded-sm border border-stroke bg-white px-5 pt-6 pb-2.5 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5">
        <div className="max-w-full overflow-x-auto">
          <div className="flex gap-3 mb-5 flex-wrap items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search name or admission no."
                className="pl-9 w-64 rounded-lg border border-stroke bg-transparent py-2.5 text-sm text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                value={searchInput}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>

            <Select
              value={classId}
              onValueChange={(v) =>
                updateParams({ classId: v ?? '', page: '1' })
              }
            >
              <SelectTrigger className="w-40 rounded-lg border border-stroke bg-transparent py-2.5 text-sm text-black dark:border-form-strokedark dark:bg-form-input dark:text-white">
                <span className={classId ? '' : 'text-muted-foreground'}>
                  {classId
                    ? (classes?.find((c) => c.id === classId)?.name ?? 'Loading…')
                    : 'All Classes'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Classes</SelectItem>
                {classes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={status}
              onValueChange={(v) =>
                updateParams({ status: v ?? '', page: '1' })
              }
            >
              <SelectTrigger className="w-36 rounded-lg border border-stroke bg-transparent py-2.5 text-sm text-black dark:border-form-strokedark dark:bg-form-input dark:text-white">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="TRANSFERRED">Transferred</SelectItem>
                <SelectItem value="GRADUATED">Graduated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={students}
        isLoading={isLoading}
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
    </div>
  );
}
