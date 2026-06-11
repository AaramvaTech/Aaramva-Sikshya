'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import {
  useStaffList,
  useCreateStaff,
  useDepartments,
  useDesignations,
} from '@/lib/hooks/use-hr';
import type { StaffSummary } from '@/types/api.types';

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

const ROLES = ['TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'PRINCIPAL', 'ACADEMIC_COORDINATOR'];
const EMPLOYMENT_TYPES = ['PERMANENT', 'TEMPORARY', 'PART_TIME', 'CONTRACT'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];

export default function StaffListPage() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', role: '',
    departmentId: '', designationId: '',
    joinDate: '', baseSalary: '', employmentType: '',
    phone: '', gender: '', dateOfBirth: '',
  });

  const { data: response, isLoading } = useStaffList({
    page,
    limit: 20,
    search: search || undefined,
    departmentId: deptId || undefined,
  });
  const { data: departments } = useDepartments();
  const { data: designations } = useDesignations();
  const createStaff = useCreateStaff();

  const staffList = response?.data ?? [];
  const meta = response?.meta;

  function handleSearchChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  }

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAddStaff() {
    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.role || !form.joinDate || !form.baseSalary) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await createStaff.mutateAsync({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: form.role,
        departmentId: form.departmentId || undefined,
        designationId: form.designationId || undefined,
        joinDate: form.joinDate,
        baseSalary: Number(form.baseSalary),
        employmentType: form.employmentType || undefined,
        phone: form.phone || undefined,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
      });
      toast.success('Staff added successfully');
      setAddOpen(false);
      setForm({ firstName: '', lastName: '', email: '', password: '', role: '', departmentId: '', designationId: '', joinDate: '', baseSalary: '', employmentType: '', phone: '', gender: '', dateOfBirth: '' });
    } catch {
      toast.error('Failed to add staff');
    }
  }

  const columns: ColumnDef<StaffSummary>[] = [
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
      accessorKey: 'employeeId',
      header: 'Employee ID',
      cell: ({ getValue }) => (
        <span className="font-mono text-sm text-gray-500">{getValue<string>()}</span>
      ),
    },
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <Link href={`/hr/staff/${row.original.id}`} className="font-medium text-brand-500 hover:underline">
          {row.original.fullName}
        </Link>
      ),
    },
    {
      id: 'department',
      header: 'Department',
      cell: ({ row }) => row.original.departmentName ?? '—',
    },
    {
      id: 'designation',
      header: 'Designation',
      cell: ({ row }) => row.original.designationTitle ?? '—',
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ getValue }) => {
        const r = getValue<string>();
        return <span className="text-xs">{r.replace(/_/g, ' ')}</span>;
      },
    },
    {
      id: 'joinDate',
      header: 'Join Date',
      cell: ({ row }) => <BsDate date={row.original.joinDate} />,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Staff Directory"
        description="Manage employee profiles and records"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Staff
          </Button>
        }
      />

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search name or ID..."
            className="pl-9 w-64"
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <Select value={deptId} onValueChange={(v) => { setDeptId(v ?? ''); setPage(1); }}>
          <SelectTrigger className="w-44">
            <span className="truncate">
              {departments?.find((d) => d.id === deptId)?.name ?? 'All Departments'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Departments</SelectItem>
            {departments?.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={staffList}
        isLoading={isLoading}
        pagination={
          meta
            ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage }
            : undefined
        }
      />

      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setAddOpen(false); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-first">First Name *</Label>
              <Input id="s-first" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-last">Last Name *</Label>
              <Input id="s-last" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} placeholder="Last name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-email">Email *</Label>
              <Input id="s-email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="email@school.edu" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-pass">Password *</Label>
              <Input id="s-pass" type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => setField('role', v ?? '')}>
                <SelectTrigger>
                  <span className="truncate">{form.role ? form.role.replace(/_/g, ' ') : 'Select role'}</span>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.departmentId || 'NONE'} onValueChange={(v) => setField('departmentId', (v ?? '') === 'NONE' ? '' : (v ?? ''))}>
                <SelectTrigger>
                  <span className="truncate">
                    {departments?.find((d) => d.id === form.departmentId)?.name ?? 'Select department'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Select value={form.designationId || 'NONE'} onValueChange={(v) => setField('designationId', (v ?? '') === 'NONE' ? '' : (v ?? ''))}>
                <SelectTrigger>
                  <span className="truncate">
                    {designations?.find((d) => d.id === form.designationId)?.title ?? 'Select designation'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {designations?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-join">Join Date *</Label>
              <Input id="s-join" type="date" value={form.joinDate} onChange={(e) => setField('joinDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-salary">Base Salary (NPR) *</Label>
              <Input id="s-salary" type="number" value={form.baseSalary} onChange={(e) => setField('baseSalary', e.target.value)} placeholder="e.g. 25000" />
            </div>
            <div className="space-y-1.5">
              <Label>Employment Type</Label>
              <Select value={form.employmentType || 'NONE'} onValueChange={(v) => setField('employmentType', (v ?? '') === 'NONE' ? '' : (v ?? ''))}>
                <SelectTrigger>
                  <span className="truncate">{form.employmentType ? form.employmentType.replace(/_/g, ' ') : 'Select type'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-phone">Phone</Label>
              <Input id="s-phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="98XXXXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender || 'NONE'} onValueChange={(v) => setField('gender', (v ?? '') === 'NONE' ? '' : (v ?? ''))}>
                <SelectTrigger>
                  <span className="truncate">{form.gender ? form.gender.charAt(0) + form.gender.slice(1).toLowerCase() : 'Select gender'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {GENDERS.map((g) => (
                    <SelectItem key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-dob">Date of Birth</Label>
              <Input id="s-dob" type="date" value={form.dateOfBirth} onChange={(e) => setField('dateOfBirth', e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleAddStaff}
              disabled={createStaff.isPending}
            >
              {createStaff.isPending ? 'Adding…' : 'Add Staff'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
